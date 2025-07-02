import os
import json
import functions_framework
from google import genai
from google.genai import types
from flask import jsonify
import logging

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
    # First try basic cleaning
    cleaned_text = response_text.strip()
    
    # Remove markdown code blocks
    if "```json" in cleaned_text:
        cleaned_text = cleaned_text.replace("```json", "").replace("```", "")
    elif "```" in cleaned_text:
        cleaned_text = cleaned_text.replace("```", "")
    
    # Try to extract JSON object from mixed text
    # Look for the first { and last } to extract just the JSON
    start_idx = cleaned_text.find('{')
    end_idx = cleaned_text.rfind('}')
    
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned_text = cleaned_text[start_idx:end_idx+1]
    
    return cleaned_text.strip()

def get_generate_config():
    """Get generation config with Google Search tool and safety settings."""
    return types.GenerateContentConfig(
        temperature=1,
        top_p=1,
        seed=0,
        max_output_tokens=65535,
        safety_settings=[
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
        ],
        tools=[types.Tool(google_search=types.GoogleSearch())],
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

@functions_framework.http
def get_food_recommendations(request):
    """HTTP Cloud Function for meal recommendations."""
    
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
        
        user_settings = request_json.get('user_settings', '')
        user_preferences = request_json.get('user_preferences', '')
        
        if not user_settings or not user_preferences:
            return jsonify({"error": "Missing user_settings or user_preferences"}), 400, headers
        
        # Initialize client and load documents
        client = initialize_client()
        documents = load_documents()
        
        if not documents:
            return jsonify({"error": "Failed to load documents"}), 500, headers
        
        prompt_part = types.Part.from_text(
            text=f"""
            You are provided with multiple reference documents to assess foods based on both HEALTH and SAFETY criteria:

            HEALTH STANDARDS:
            - Use the FDA healthy claim factsheet (2024-12-16-healthyclaim-factsheet-scb-0900.pdf) to determine what qualifies as "healthy" foods
            - Use the Dietary Guidelines for Americans (2020-2025) for nutritional recommendations

            SAFETY STANDARDS:
            - Use the SCOGS definitions CSV to understand the 5 safety conclusion types (1=safest, 5=insufficient data)
            - Use the SCOGS data CSV to check safety evaluations of specific food additives and ingredients
            - Use the FDA News Release to identify banned substances that are considered unsafe.
            - CRITICAL: Foods with additives that have concerning SCOGS safety ratings (types 3, 4, or 5) or are mentioned in the FDA News Release should be considered UNSAFE and therefore UNHEALTHY, even if they are FDA approved

            User Profile:
            User Description: {user_settings}
            User Preferences: {user_preferences}

            Recommend 5 meals that are both HEALTHY (meeting FDA health standards and dietary guidelines) and SAFE (avoiding ingredients with concerning SCOGS safety ratings). Consider any food additives, preservatives, or processing aids that may be present. PRIORITIZE SCOGS safety evaluations over FDA approval status - if an additive has a concerning SCOGS rating, avoid it regardless of FDA approval.

            The 5 meals should be: Breakfast, Lunch, Dinner, Snack, Snack. Each meal should have a name for the item, and a description on how to make the item.

            In your summary, explain how your choices balance both health and safety considerations.

            IMPORTANT: Your response must be ONLY a valid JSON object. Do not include any explanations, markdown formatting, or text before or after the JSON.
            Start your response with {{ and end with }}

            Return exactly this JSON structure:
            {{
                "Breakfast": {{ "Name": "Name of item", "Description": "Instructions on how to make Breakfast" }},
                "Lunch": {{ "Name": "Name of item", "Description": "Instructions on how to make Lunch" }},
                "Dinner": {{ "Name": "Name of item", "Description": "Instructions on how to make Dinner" }},
                "Snack Idea 1": {{ "Name": "Name of item", "Description": "Instructions on how to make Snack 1" }},
                "Snack Idea 2": {{ "Name": "Name of item", "Description": "Instructions on how to make Snack 2" }},
                "Summary": "Short 2 paragraph summary explaining how these choices balance both health and safety considerations."
            }}
            """
        )
        
        # Create content parts from documents
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
        
        model = "gemini-2.5-flash"
        
        logger.info('Generating recommendations')
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=get_generate_config(),
        )
        
        # Clean and parse the response
        cleaned_result = clean_json_response(response.text)
        result_json = json.loads(cleaned_result)
        
        return jsonify(result_json), 200, headers
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        logger.error(f"Raw response text: {response.text}")
        logger.error(f"Cleaned response: {cleaned_result}")
        # Return a more helpful error response
        return jsonify({
            "error": "Failed to parse Gemini response", 
            "details": str(e),
            "raw_response_preview": response.text[:500] if response.text else "No response text"
        }), 500, headers
    except Exception as e:
        logger.error(f"Error in get_food_recommendations: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500, headers
