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
import asyncio
import functions_framework
from google import genai
from google.genai import types
from flask import jsonify
import logging
import base64

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables for document caching
_documents_cache = None
_client = None

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

def load_documents():
    """Load all documents once and cache them."""
    global _documents_cache
    
    if _documents_cache is not None:
        return _documents_cache
    
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        docs_dir = os.path.join(current_dir, 'documents')
        
        _documents_cache = {
            'health_pdf': read_file_bytes(os.path.join(docs_dir, '2024-12-16-healthyclaim-factsheet-scb-0900.pdf')),
            'health_txt': read_file_bytes(os.path.join(docs_dir, 'Dietary_Guidelines_for_Americans-2020-2025.txt')),
            'scogs_definitions': read_file_bytes(os.path.join(docs_dir, 'SCOGS-definitions.csv')),
            'scogs_data': read_file_bytes(os.path.join(docs_dir, 'SCOGS.csv')),
            'fda_news': read_file_bytes(os.path.join(docs_dir, 'FDA News Release.txt'))
        }
        
        logger.info("Documents loaded and cached successfully")
        return _documents_cache
        
    except Exception as e:
        logger.error(f"Error loading documents: {e}")
        return None

def read_file_bytes(file_path):
    """Read file and return bytes."""
    with open(file_path, 'rb') as f:
        return f.read()

def clean_json_response(response_text):
    """Clean the response text to be valid JSON."""
    cleaned_text = response_text.strip().replace("```json", "").replace("```", "")
    return cleaned_text

def get_mime_type(filename):
    """Get MIME type based on file extension."""
    file_extension = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    mime_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
        'tif': 'image/tiff'
    }
    return mime_types.get(file_extension, 'application/octet-stream')

def get_generate_config():
    """Get common generation config with safety settings."""
    return types.GenerateContentConfig(
        temperature=0,
        top_p=1,
        seed=0,
        max_output_tokens=65535,
        safety_settings=[
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
        ],
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

async def health_rating_from_image_async(client, image_data, mime_type, user_settings, user_preferences, documents):
    """Async version of health rating analysis."""
    try:
        prompt_part = types.Part.from_text(
            text=f"""
            Analyze the provided image of a food item based on the following HEALTH criteria:
            - FDA healthy claim factsheet (2024-12-16-healthyclaim-factsheet-scb-0900.pdf)
            - Dietary Guidelines for Americans (2020-2025)

            User Profile:
            - Description: {user_settings}
            - Preferences: {user_preferences}

            Return a JSON object with three fields:
            1. "rating": 'Healthy' or 'Unhealthy'
            2. "summary": A one-paragraph explanation with inline citation markers [1], [2], etc. Do NOT include page numbers in the summary text itself.
            3. "citations": An array of citation objects, each containing:
               - "id": The citation number (1, 2, etc.)
               - "source": The source document name
               - "context": A direct quote or specific context from the source (1-3 sentences showing the actual referenced text)
               - "page": Page number(s) if applicable (DO NOT include page for FDA Healthy Claim Factsheet as it's a single-page document)
               - "url": URL link to the source document:
                 * For FDA Healthy Claim Factsheet: "https://www.fda.gov/media/184535/download"
                 * For Dietary Guidelines: "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"

            IMPORTANT: 
            - For FDA Healthy Claim Factsheet citations, always include direct quotes and the URL, but DO NOT include page numbers.
            - For Dietary Guidelines citations, always include specific page number(s) and direct quotes.
            """
        )
        
        pdf_file_part = types.Part.from_bytes(data=documents['health_pdf'], mime_type='application/pdf')
        txt_file_part = types.Part.from_bytes(data=documents['health_txt'], mime_type='text/plain')
        image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
        
        contents = [types.Content(role="user", parts=[prompt_part, image_part, pdf_file_part, txt_file_part])]
        
        # Run in executor to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=get_generate_config()
            )
        )
        
        return json.loads(clean_json_response(response.text))
        
    except Exception as e:
        logger.error(f"Error in health_rating_from_image_async: {e}")
        return {"error": str(e)}

async def safety_rating_from_image_async(client, image_data, mime_type, user_settings, user_preferences, documents):
    """Async version of safety rating analysis."""
    try:
        prompt_part = types.Part.from_text(
            text=f"""
            Analyze the provided image of a food item based on the following SAFETY criteria:
            - SCOGS definitions and data
            - FDA News Release on banned substances

            User Profile:
            - Description: {user_settings}
            - Preferences: {user_preferences}

            IMPORTANT: When citing SCOGS data:
            - In the summary text, replace generic placeholders like [substance] with the actual substance name
            - In citations, include the CAS Reg. No. or other ID CODE and Year of Report from the SCOGS data

            Return a JSON object with three fields:
            1. "rating": 'Safe' or 'Unsafe'
            2. "summary": A one-paragraph explanation with inline citation markers [1], [2], etc. Use actual substance names, not placeholders.
            3. "citations": An array of citation objects, each containing:
               - "id": The citation number (1, 2, etc.)
               - "source": The source document name
               - "context": A brief quote or context from the source (1-2 sentences)
               - "substance": The specific substance or additive being referenced (if applicable)
               - "cas_number": CAS Reg. No. or other ID CODE (for SCOGS citations)
               - "year_of_report": Year of Report (for SCOGS citations)
            """
        )
        
        scogs_definitions_part = types.Part.from_bytes(data=documents['scogs_definitions'], mime_type='text/csv')
        scogs_data_part = types.Part.from_bytes(data=documents['scogs_data'], mime_type='text/csv')
        fda_news_release_part = types.Part.from_bytes(data=documents['fda_news'], mime_type='text/plain')
        image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
        
        contents = [types.Content(role="user", parts=[prompt_part, image_part, scogs_definitions_part, scogs_data_part, fda_news_release_part])]
        
        # Run in executor to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=get_generate_config()
            )
        )
        
        return json.loads(clean_json_response(response.text))
        
    except Exception as e:
        logger.error(f"Error in safety_rating_from_image_async: {e}")
        return {"error": str(e)}

async def analyze_food_image_async(image_data, mime_type, user_settings, user_preferences):
    """Run health and safety analysis in parallel."""
    # Initialize client and load documents
    client = initialize_client()
    documents = load_documents()
    
    if not documents:
        return {"error": "Failed to load documents"}
    
    # Run both analyses in parallel
    health_task = health_rating_from_image_async(client, image_data, mime_type, user_settings, user_preferences, documents)
    safety_task = safety_rating_from_image_async(client, image_data, mime_type, user_settings, user_preferences, documents)
    
    # Wait for both to complete
    health_result, safety_result = await asyncio.gather(health_task, safety_task)
    
    return health_result, safety_result

@functions_framework.http
def analyze_food_image(request):
    """HTTP Cloud Function for image analysis."""
    
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
        # Get form data
        user_settings = request.form.get('user_settings', '')
        user_preferences = request.form.get('user_preferences', '')
        
        # Handle both file upload and base64 image data
        image_data = None
        mime_type = None
        
        if 'evidence_file' in request.files:
            # File upload
            file = request.files['evidence_file']
            if file.filename == '':
                return jsonify({"error": "No selected file"}), 400, headers
            
            image_data = file.read()
            mime_type = get_mime_type(file.filename)
            
        elif request.content_type == 'application/json':
            # JSON with base64 image
            request_json = request.get_json(silent=True)
            if not request_json:
                return jsonify({"error": "Invalid request body"}), 400, headers
            
            if 'imageData' in request_json:
                # Decode base64 image
                image_base64 = request_json['imageData']
                if ',' in image_base64:
                    # Remove data URL prefix if present
                    image_base64 = image_base64.split(',')[1]
                image_data = base64.b64decode(image_base64)
                mime_type = request_json.get('mimeType', 'image/jpeg')
                
            user_settings = request_json.get('user_settings', user_settings)
            user_preferences = request_json.get('user_preferences', user_preferences)
        
        if not image_data:
            return jsonify({"error": "No image data provided"}), 400, headers
        
        logger.info('Analyzing food image')
        
        # Run async analysis
        health_result, safety_result = asyncio.run(
            analyze_food_image_async(image_data, mime_type, user_settings, user_preferences)
        )
        
        if "error" in health_result or "error" in safety_result:
            error_msg = health_result.get("error", "") + " " + safety_result.get("error", "")
            return jsonify({"error": "Failed to analyze image", "details": error_msg}), 500, headers
        
        # Combine results
        response_data = {
            "healthRating": health_result.get("rating"),
            "healthSummary": health_result.get("summary"),
            "healthCitations": health_result.get("citations", []),
            "safetyRating": safety_result.get("rating"),
            "safetySummary": safety_result.get("summary"),
            "safetyCitations": safety_result.get("citations", [])
        }
        
        logger.info(f'Analysis complete: Health={response_data["healthRating"]}, Safety={response_data["safetyRating"]}')
        
        return jsonify(response_data), 200, headers
        
    except Exception as e:
        logger.error(f"Error in analyze_food_image: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500, headers
