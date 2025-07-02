import os
import json
import functions_framework
from google import genai
from google.genai import types
from google.cloud import storage
from flask import jsonify
import logging
import base64

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

def health_rating_from_image(image_data, mime_type, user_settings, user_preferences, bucket_name):
    """Determine the Health Rating from an image."""
    try:
        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            return {"error": "API key not configured"}
        
        client = genai.Client(api_key=api_key)
        
        # Load documents from Cloud Storage
        pdf_content = get_document_content(bucket_name, '2024-12-16-healthyclaim-factsheet-scb-0900.pdf')
        txt_content = get_document_content(bucket_name, 'Dietary_Guidelines_for_Americans-2020-2025.txt')
        
        if not all([pdf_content, txt_content]):
            return {"error": "Failed to load health documents"}
        
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
        
        pdf_file_part = types.Part.from_bytes(data=pdf_content, mime_type='application/pdf')
        txt_file_part = types.Part.from_bytes(data=txt_content, mime_type='text/plain')
        image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
        
        contents = [types.Content(role="user", parts=[prompt_part, image_part, pdf_file_part, txt_file_part])]
        
        generate_content_config = types.GenerateContentConfig(temperature=0)
        model = "gemini-2.5-flash"
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config
        )
        
        return json.loads(clean_json_response(response.text))
        
    except Exception as e:
        logger.error(f"Error in health_rating_from_image: {e}")
        return {"error": str(e)}

def safety_rating_from_image(image_data, mime_type, user_settings, user_preferences, bucket_name):
    """Determine the Safety Rating from an image."""
    try:
        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            return {"error": "API key not configured"}
        
        client = genai.Client(api_key=api_key)
        
        # Load documents from Cloud Storage
        scogs_definitions = get_document_content(bucket_name, 'SCOGS-definitions.csv')
        scogs_data = get_document_content(bucket_name, 'SCOGS.csv')
        fda_news_release = get_document_content(bucket_name, 'FDA News Release.txt')
        
        if not all([scogs_definitions, scogs_data, fda_news_release]):
            return {"error": "Failed to load safety documents"}
        
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
        
        scogs_definitions_part = types.Part.from_bytes(data=scogs_definitions, mime_type='text/csv')
        scogs_data_part = types.Part.from_bytes(data=scogs_data, mime_type='text/csv')
        fda_news_release_part = types.Part.from_bytes(data=fda_news_release, mime_type='text/plain')
        image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
        
        contents = [types.Content(role="user", parts=[prompt_part, image_part, scogs_definitions_part, scogs_data_part, fda_news_release_part])]
        
        generate_content_config = types.GenerateContentConfig(temperature=0)
        model = "gemini-2.5-flash-preview-05-20"
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config
        )
        
        return json.loads(clean_json_response(response.text))
        
    except Exception as e:
        logger.error(f"Error in safety_rating_from_image: {e}")
        return {"error": str(e)}

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
        
        # Get bucket name from environment or use default
        bucket_name = os.environ.get('RAG_BUCKET_NAME', 'fda-food-medicine-rag')
        
        logger.info('Analyzing food image')
        
        # Get both health and safety ratings
        health_result = health_rating_from_image(image_data, mime_type, user_settings, user_preferences, bucket_name)
        safety_result = safety_rating_from_image(image_data, mime_type, user_settings, user_preferences, bucket_name)
        
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
