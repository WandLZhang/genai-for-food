# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import json
import functions_framework
from google import genai
from google.genai import types
from google.cloud import storage
from flask import jsonify
import logging

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables for caching
_storage_client = None
_documents_cache = None
_client = None

def get_storage_client():
    """Get or create storage client."""
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client

def initialize_client():
    """Initialize Vertex AI client once."""
    global _client
    if _client is None:
        project_id = os.environ.get('PROJECT_ID', 'fda-genai-for-food')
        location = os.environ.get('LOCATION', 'global')
        
        _client = genai.Client(
            vertexai=True,
            project=project_id,
            location=location,
        )
        logger.info(f"Initialized Vertex AI client for project {project_id} in {location}")
    
    return _client

def load_documents_from_storage(bucket_name):
    """Load all documents once from Cloud Storage and cache them."""
    global _documents_cache
    
    if _documents_cache is not None:
        return _documents_cache
    
    try:
        storage_client = get_storage_client()
        bucket = storage_client.bucket(bucket_name)
        
        _documents_cache = {
            'health_pdf': get_document_content(bucket, '2024-12-16-healthyclaim-factsheet-scb-0900.pdf'),
            'health_txt': get_document_content(bucket, 'Dietary_Guidelines_for_Americans-2020-2025.txt'),
            'scogs_definitions': get_document_content(bucket, 'SCOGS-definitions.csv'),
            'scogs_data': get_document_content(bucket, 'SCOGS.csv'),
            'fda_news': get_document_content(bucket, 'FDA News Release.txt')
        }
        
        # Check if all documents loaded successfully
        if not all(_documents_cache.values()):
            logger.error("Some documents failed to load from Cloud Storage")
            return None
            
        logger.info("Documents loaded and cached successfully from Cloud Storage")
        return _documents_cache
        
    except Exception as e:
        logger.error(f"Error loading documents from Cloud Storage: {e}")
        return None

def get_document_content(bucket, file_path):
    """Download and read content from Cloud Storage bucket."""
    try:
        blob = bucket.blob(file_path)
        content = blob.download_as_bytes()
        return content
    except Exception as e:
        logger.error(f"Error reading {file_path}: {e}")
        return None

def clean_json_response(response_text):
    """Clean the response text to be valid JSON."""
    cleaned_text = response_text.strip().replace("```json", "").replace("```", "")
    return cleaned_text

def get_generate_config():
    """Get common generation config with safety settings."""
    return types.GenerateContentConfig(
        temperature=0,
        top_p=1,
        seed=0,
        max_output_tokens=8192,
        safety_settings=[
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
        ],
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

@functions_framework.http
def food_chat(request):
    """HTTP Cloud Function for food chat interaction."""
    
    # Handle CORS
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    }
    
    try:
        request_json = request.get_json(silent=True)
        if not request_json:
            return jsonify({"error": "Invalid request body"}), 400, headers
        
        # Extract required fields
        user_settings = request_json.get('user_settings', '')
        user_preferences = request_json.get('user_preferences', '')
        chat_history = request_json.get('chat_history', [])
        query = request_json.get('query', '')
        
        if not query:
            return jsonify({"error": "Missing query"}), 400, headers
        
        # Initialize Vertex AI client
        client = initialize_client()
        
        # Get bucket name from environment or use default
        bucket_name = os.environ.get('RAG_BUCKET_NAME', 'fda-food-medicine-rag')
        
        # Load documents from Cloud Storage with caching
        documents = load_documents_from_storage(bucket_name)
        
        if not documents:
            return jsonify({"error": "Failed to load required documents"}), 500, headers
        
        # Format chat history for context
        chat_history_text = ""
        if chat_history:
            for msg in chat_history[-10:]:  # Keep last 10 messages for context
                role = msg.get('role', 'user')
                text = msg.get('text', '')
                chat_history_text += f"{role.capitalize()}: {text}\n"
        
        prompt_part = types.Part.from_text(
            text=f"""
            You are a helpful Food Nutritionist from the FDA, chatting with a user. Do not introduce yourself.

            Reference Documents:
            - HEALTH: FDA healthy claim factsheet, Dietary Guidelines for Americans
            - SAFETY: SCOGS definitions & data, FDA News Release on banned substances

            User Profile:
            - Description: {user_settings}
            - Preferences: {user_preferences}

            Chat History: 
            {chat_history_text}
            
            User's Latest Query: {query}

            Task:
            1. Provide a concise, one-paragraph response to the user's query.
            2. If your response references specific information from the provided documents, include inline citation markers (e.g., [1], [2]).
            3. Return a single JSON object with two fields: "response" and "citations".
               - "response": Your textual answer to the user.
               - "citations": An array of citation objects, structured like the examples from the health/safety analysis. Include fields like "id", "source", "context", "page", "url", "substance", etc., where applicable.

            Example JSON Output:
            {{
                "response": "Based on the dietary guidelines, it's recommended to limit sodium intake [1]. The food you mentioned contains yellow no. 5, which is considered safe for consumption [2].",
                "citations": [
                    {{
                        "id": 1,
                        "source": "Dietary Guidelines for Americans 2020-2025",
                        "context": "Limit sodium intake to less than 2,300 milligrams per day.",
                        "page": "Page 35",
                        "url": "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"
                    }},
                    {{
                        "id": 2,
                        "source": "SCOGS Database",
                        "context": "FD&C Yellow No. 5 is a color additive and is considered safe.",
                        "substance": "FD&C Yellow No. 5",
                        "cas_number": "1934-21-0",
                        "year_of_report": "1980"
                    }}
                ]
            }}
            """
        )
        
        # Create content parts from cached documents
        pdf_file_part = types.Part.from_bytes(data=documents['health_pdf'], mime_type='application/pdf')
        txt_file_part = types.Part.from_bytes(data=documents['health_txt'], mime_type='text/plain')
        scogs_definitions_part = types.Part.from_bytes(data=documents['scogs_definitions'], mime_type='text/csv')
        scogs_data_part = types.Part.from_bytes(data=documents['scogs_data'], mime_type='text/csv')
        fda_news_release_part = types.Part.from_bytes(data=documents['fda_news'], mime_type='text/plain')
        
        contents = [
            types.Content(
                role="user",
                parts=[prompt_part, pdf_file_part, txt_file_part, scogs_definitions_part, scogs_data_part, fda_news_release_part],
            ),
        ]
        
        # Use updated model and config
        model = "gemini-2.5-flash"
        
        logger.info('Generating chat response')
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=get_generate_config(),
        )
        
        # Clean and parse the response
        try:
            cleaned_result = clean_json_response(response.text)
            response_data = json.loads(cleaned_result)
            
            # Ensure the response has the expected keys
            if "response" not in response_data:
                # If parsing fails or keys are missing, wrap the raw text in the expected structure
                logger.warning("Response missing expected structure, wrapping in default format")
                return jsonify({"response": response.text, "citations": []}), 200, headers
            
            return jsonify(response_data), 200, headers
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse chat response as JSON: {e}")
            logger.error(f"Raw response was: {response.text}")
            # Fallback for non-JSON responses: return the raw text in the expected structure
            return jsonify({"response": response.text, "citations": []}), 200, headers
        
    except Exception as e:
        logger.error(f"Error in food_chat: {e}", exc_info=True)
        error_message = "Internal server error"
        if "PROJECT_ID" in str(e):
            error_message = "Missing PROJECT_ID environment variable"
        elif "credentials" in str(e).lower():
            error_message = "Authentication error - check service account credentials"
        
        return jsonify({"error": error_message, "details": str(e)}), 500, headers
