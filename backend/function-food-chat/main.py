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

# Initialize storage client
storage_client = storage.Client()

def get_document_content(bucket_name, file_path):
    """Download and read content from Cloud Storage."""
    try:
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        content = blob.download_as_bytes()
        return content
    except Exception as e:
        logger.error(f"Error reading {file_path} from bucket {bucket_name}: {e}")
        return None

def clean_json_response(response_text):
    """Clean the response text to be valid JSON."""
    cleaned_text = response_text.strip().replace("```json", "").replace("```", "")
    return cleaned_text

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
        
        # Initialize Gemini client
        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            return jsonify({"error": "API key not configured"}), 500, headers
        
        client = genai.Client(api_key=api_key)
        
        # Get bucket name from environment or use default
        bucket_name = os.environ.get('RAG_BUCKET_NAME', 'fda-food-medicine-rag')
        
        # Load documents from Cloud Storage
        pdf_content = get_document_content(bucket_name, '2024-12-16-healthyclaim-factsheet-scb-0900.pdf')
        txt_content = get_document_content(bucket_name, 'Dietary_Guidelines_for_Americans-2020-2025.txt')
        scogs_definitions = get_document_content(bucket_name, 'SCOGS-definitions.csv')
        scogs_data = get_document_content(bucket_name, 'SCOGS.csv')
        fda_news_release = get_document_content(bucket_name, 'FDA News Release.txt')
        
        if not all([pdf_content, txt_content, scogs_definitions, scogs_data, fda_news_release]):
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
        
        # Create content parts from documents
        pdf_file_part = types.Part.from_bytes(data=pdf_content, mime_type='application/pdf')
        txt_file_part = types.Part.from_bytes(data=txt_content, mime_type='text/plain')
        scogs_definitions_part = types.Part.from_bytes(data=scogs_definitions, mime_type='text/csv')
        scogs_data_part = types.Part.from_bytes(data=scogs_data, mime_type='text/csv')
        fda_news_release_part = types.Part.from_bytes(data=fda_news_release, mime_type='text/plain')
        
        contents = [
            types.Content(
                role="user",
                parts=[prompt_part, pdf_file_part, txt_file_part, scogs_definitions_part, scogs_data_part, fda_news_release_part],
            ),
        ]
        
        # Set temperature to 0 for consistent, fact-based responses
        generate_content_config = types.GenerateContentConfig(temperature=0)
        model = "gemini-2.5-flash-preview-05-20"
        
        logger.info('Generating chat response')
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
        )
        
        # Clean and parse the response
        try:
            cleaned_result = clean_json_response(response.text)
            response_data = json.loads(cleaned_result)
            
            # Ensure the response has the expected keys
            if "response" not in response_data:
                # If parsing fails or keys are missing, wrap the raw text in the expected structure
                return jsonify({"response": response.text, "citations": []}), 200, headers
            
            return jsonify(response_data), 200, headers
            
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Failed to parse chat response: {e}")
            logger.error(f"Raw response was: {response.text}")
            # Fallback for non-JSON responses: return the raw text in the expected structure
            return jsonify({"response": response.text, "citations": []}), 200, headers
        
    except Exception as e:
        logger.error(f"Error in food_chat: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500, headers
