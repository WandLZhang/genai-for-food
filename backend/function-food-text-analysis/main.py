import os
import json
import asyncio
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
    cleaned_text = response_text.strip().replace("```json", "").replace("```", "")
    return cleaned_text

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

async def health_rating_from_text_async(client, description, user_settings, user_preferences, documents):
    """Async version of health rating analysis from text description."""
    try:
        prompt_part = types.Part.from_text(
            text=f"""
            Analyze the provided food description based on the following HEALTH criteria:
            - FDA healthy claim factsheet (2024-12-16-healthyclaim-factsheet-scb-0900.pdf)
            - Dietary Guidelines for Americans (2020-2025)

            User Profile:
            - Description: {user_settings}
            - Preferences: {user_preferences}
            
            Food Description: {description}

            Return a JSON object with four fields:
            1. "rating": 'Healthy', 'Moderate', or 'Unhealthy'
            2. "explanation": A one-paragraph explanation for the rating with inline citation markers [1], [2], etc.
            3. "citations": An array of citation objects, each containing:
               - "id": The citation number (1, 2, etc.)
               - "source": The source document name
               - "context": A direct quote or specific context from the source
               - "page": Page number(s) if applicable (DO NOT include page for FDA Healthy Claim Factsheet as it's a single-page document)
               - "url": URL link to the source document:
                 * For FDA Healthy Claim Factsheet: "https://www.fda.gov/media/184535/download"
                 * For Dietary Guidelines: "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"
            4. "color": "green", "yellow", or "red" based on the rating.

            Example format:
            {{
                "rating": "Unhealthy",
                "explanation": "This meal is high in saturated fat and sodium [1], and the soda is a source of added sugars [2].",
                "citations": [
                    {{
                        "id": 1,
                        "source": "Dietary Guidelines for Americans 2020-2025",
                        "context": "Limit saturated fat to less than 10 percent of calories per day.",
                        "page": "Page 45",
                        "url": "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"
                    }},
                    {{
                        "id": 2,
                        "source": "Dietary Guidelines for Americans 2020-2025",
                        "context": "Limit added sugars to less than 10 percent of calories per day.",
                        "page": "Page 47",
                        "url": "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"
                    }}
                ],
                "color": "red"
            }}
            """
        )
        
        pdf_file_part = types.Part.from_bytes(data=documents['health_pdf'], mime_type='application/pdf')
        txt_file_part = types.Part.from_bytes(data=documents['health_txt'], mime_type='text/plain')
        
        contents = [types.Content(role="user", parts=[prompt_part, pdf_file_part, txt_file_part])]
        
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
        logger.error(f"Error in health_rating_from_text_async: {e}")
        return {"error": str(e)}

async def analyze_food_text_async(description, user_settings, user_preferences):
    """Run health analysis from text description."""
    # Initialize client and load documents
    client = initialize_client()
    documents = load_documents()
    
    if not documents:
        return {"error": "Failed to load documents"}
    
    # Run health analysis
    health_result = await health_rating_from_text_async(client, description, user_settings, user_preferences, documents)
    
    return health_result

@functions_framework.http
def analyze_food_text(request):
    """HTTP Cloud Function for text analysis."""
    
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
        # Get JSON data
        request_json = request.get_json(silent=True)
        if not request_json:
            return jsonify({"error": "Invalid request body"}), 400, headers
        
        # Extract required fields
        description = request_json.get('description', '')
        user_settings = request_json.get('user_settings', '')
        user_preferences = request_json.get('user_preferences', '')
        
        if not description:
            return jsonify({"error": "Missing description parameter"}), 400, headers
        
        logger.info(f'Analyzing food text: {description[:100]}...')
        
        # Run async analysis
        result = asyncio.run(
            analyze_food_text_async(description, user_settings, user_preferences)
        )
        
        if "error" in result:
            return jsonify({"error": "Failed to analyze text", "details": result.get("error")}), 500, headers
        
        # Ensure all required fields are present
        response_data = {
            "rating": result.get("rating", "Unknown"),
            "explanation": result.get("explanation", "No explanation provided."),
            "citations": result.get("citations", []),
            "color": result.get("color", "gray")
        }
        
        logger.info(f'Analysis complete: Rating={response_data["rating"]}, Color={response_data["color"]}')
        
        return jsonify(response_data), 200, headers
        
    except Exception as e:
        logger.error(f"Error in analyze_food_text: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500, headers
