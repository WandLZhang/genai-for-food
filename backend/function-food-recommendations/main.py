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

            Return as a only JSON with the following fields:

            "Breakfast": {{ "Name": "Name of item", "Description": "Instructions on how to make Breakfast" }},
            "Lunch": {{ "Name": "Name of item", "Description": "Instructions on how to make Lunch" }},
            "Dinner": {{ "Name": "Name of item", "Description": "Instructions on how to make Dinner" }},
            "Snack Idea 1": {{ "Name": "Name of item", "Description": "Instructions on how to make Snack 1" }},
            "Snack Idea 2": {{ "Name": "Name of item", "Description": "Instructions on how to make Snack 2" }},
            "Summary": "Short 2 paragraph summary explaining how these choices balance both health and safety considerations."
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
        
        tools = [types.Tool(google_search=types.GoogleSearch())]
        generate_content_config = types.GenerateContentConfig(tools=tools)
        model = "gemini-2.5-flash-preview-05-20"
        
        logger.info('Generating recommendations')
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
        )
        
        # Clean and parse the response
        cleaned_result = clean_json_response(response.text)
        result_json = json.loads(cleaned_result)
        
        return jsonify(result_json), 200, headers
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return jsonify({"error": "Failed to parse Gemini response", "details": str(e)}), 500, headers
    except Exception as e:
        logger.error(f"Error in get_food_recommendations: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500, headers
