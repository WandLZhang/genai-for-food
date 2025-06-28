import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
import json
import werkzeug.utils
import requests
import base64

# Initialize Flask app
app = Flask(__name__, static_url_path='', static_folder='../')
CORS(app)
# --- Helper Functions ---

def get_mime_type(filename):
    """Gets the MIME type based on the file extension."""
    file_extension = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if file_extension == 'pdf':
        return 'application/pdf'
    elif file_extension in ['jpg', 'jpeg']:
        return 'image/jpeg'
    elif file_extension == 'png':
        return 'image/png'
    elif file_extension == 'gif':
        return 'image/gif'
    elif file_extension == 'bmp':
        return 'image/bmp'
    elif file_extension == 'tiff' or file_extension == 'tif':
        return 'image/tiff'
    else:
        return 'application/octet-stream'

def clean_json_response(response_text):
    """Cleans the response text to be valid JSON."""
    # Remove markdown formatting
    cleaned_text = response_text.strip().replace("```json", "").replace("```", "")
    return cleaned_text

# --- Core Functions ---

def recommendations(user_settings: str, user_preferences: str) -> str:
    """
    Makes a call to the Gemini API to get meal recommendations.
    """
    try:
        client = genai.Client(api_key=open('keys', 'r').read().strip())
    except FileNotFoundError:
        return jsonify({"error": "The 'key' file was not found."}), 500

    pdf_file_path = '2024-12-16-healthyclaim-factsheet-scb-0900.pdf'
    txt_file_path = 'Dietary_Guidelines_for_Americans-2020-2025.txt'
    scogs_definitions_path = 'SCOGS-definitions.csv'
    scogs_data_path = 'SCOGS.csv'
    fda_news_release_path = 'FDA News Release.txt'

    if not all(os.path.exists(path) for path in [pdf_file_path, txt_file_path, scogs_definitions_path, scogs_data_path, fda_news_release_path]):
        return jsonify({"error": "Required context files are missing."}), 500

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

    pdf_file_part = types.Part.from_bytes(
        data=open(pdf_file_path, 'rb').read(),
        mime_type='application/pdf'
    )

    txt_file_part = types.Part.from_bytes(
        data=open(txt_file_path, 'rb').read(),
        mime_type='text/plain'
    )

    scogs_definitions_part = types.Part.from_bytes(
        data=open(scogs_definitions_path, 'rb').read(),
        mime_type='text/csv'
    )

    scogs_data_part = types.Part.from_bytes(
        data=open(scogs_data_path, 'rb').read(),
        mime_type='text/csv'
    )

    fda_news_release_part = types.Part.from_bytes(
        data=open(fda_news_release_path, 'rb').read(),
        mime_type='text/plain'
    )

    contents = [
        types.Content(
            role="user",
            parts=[prompt_part, pdf_file_part, txt_file_part, scogs_definitions_part, scogs_data_part, fda_news_release_part],
        ),
    ]

    tools = [types.Tool(google_search=types.GoogleSearch())]
    generate_content_config = types.GenerateContentConfig(tools=tools)
    model = "gemini-2.5-flash-preview-05-20"

    print('Generating recommendations')

    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )

    return response.text


def health_rating_from_text(description: str, user_settings: str, user_preferences: str) -> str:
    """
    Determines the Health Rating (Healthy or Unhealthy) from a text description.
    """
    try:
        client = genai.Client(api_key=open('keys', 'r').read().strip())
    except FileNotFoundError:
        return "Error: API key not found."

    pdf_file_path = '2024-12-16-healthyclaim-factsheet-scb-0900.pdf'
    txt_file_path = 'Dietary_Guidelines_for_Americans-2020-2025.txt'

    if not all(os.path.exists(path) for path in [pdf_file_path, txt_file_path]):
        return "Error: Missing health context files."

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
           - "page": Page number(s) if applicable
           - "url": URL link to the source document
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
                    "page": "Page 46",
                    "url": "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"
                }}
            ],
            "color": "red"
        }}
        """
    )

    pdf_file_part = types.Part.from_bytes(data=open(pdf_file_path, 'rb').read(), mime_type='application/pdf')
    txt_file_part = types.Part.from_bytes(data=open(txt_file_path, 'rb').read(), mime_type='text/plain')

    contents = [types.Content(role="user", parts=[prompt_part, pdf_file_part, txt_file_part])]
    model = "gemini-2.5-flash-preview-05-20"
    
    generate_content_config = types.GenerateContentConfig(temperature=0)
    
    response = client.models.generate_content(model=model, contents=contents, config=generate_content_config)
    return response.text.strip()


def health_rating_from_image(evidence_file, user_settings, user_preferences) -> str:
    """
    Determines the Health Rating (Healthy or Unhealthy) from an image.
    """
    try:
        client = genai.Client(api_key=open('keys', 'r').read().strip())
    except FileNotFoundError:
        return "Error: API key not found."

    pdf_file_path = '2024-12-16-healthyclaim-factsheet-scb-0900.pdf'
    txt_file_path = 'Dietary_Guidelines_for_Americans-2020-2025.txt'

    if not all(os.path.exists(path) for path in [pdf_file_path, txt_file_path]):
        return "Error: Missing health context files."

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

        Example format:
        {{
            "rating": "Healthy",
            "summary": "This food meets FDA healthy criteria [1] and aligns with dietary guidelines for whole grains [2]...",
            "citations": [
                {{
                    "id": 1,
                    "source": "FDA Healthy Claim Factsheet",
                    "context": "Foods must contain at least 10% DV per RACC of vitamin D, calcium, iron, or potassium and meet specific limits for saturated fat, sodium, and added sugars...",
                    "page": "",
                    "url": "https://www.fda.gov/media/184535/download"
                }},
                {{
                    "id": 2,
                    "source": "Dietary Guidelines for Americans 2020-2025",
                    "context": "Make half your grains whole grains. Choose whole-grain versions of common foods such as bread, pasta, and rice...",
                    "page": "Page 42",
                    "url": "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf"
                }}
            ]
        }}
        """
    )

    pdf_file_part = types.Part.from_bytes(data=open(pdf_file_path, 'rb').read(), mime_type='application/pdf')
    txt_file_part = types.Part.from_bytes(data=open(txt_file_path, 'rb').read(), mime_type='text/plain')
    
    file_content = open(evidence_file, 'rb').read()
    mime_type = get_mime_type(evidence_file)
    evidence_file_part = types.Part.from_bytes(data=file_content, mime_type=mime_type)

    contents = [types.Content(role="user", parts=[prompt_part, evidence_file_part, pdf_file_part, txt_file_part])]
    model = "gemini-2.5-flash-preview-05-20"
    
    # Create GenerateContentConfig with temperature=0
    generate_content_config = types.GenerateContentConfig(temperature=0)
    
    response = client.models.generate_content(model=model, contents=contents, config=generate_content_config)
    return response.text.strip()


def safety_rating_from_image(evidence_file, user_settings, user_preferences) -> str:
    """
    Determines the Safety Rating (Safe or Unsafe) from an image.
    """
    try:
        client = genai.Client(api_key=open('keys', 'r').read().strip())
    except FileNotFoundError:
        return "Error: API key not found."

    scogs_definitions_path = 'SCOGS-definitions.csv'
    scogs_data_path = 'SCOGS.csv'
    fda_news_release_path = 'FDA News Release.txt'

    if not all(os.path.exists(path) for path in [scogs_definitions_path, scogs_data_path, fda_news_release_path]):
        return "Error: Missing safety context files."

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

        Example format:
        {{
            "rating": "Safe",
            "summary": "This food contains citric acid [1] which has a SCOGS Type 1 rating indicating it is safe...",
            "citations": [
                {{
                    "id": 1,
                    "source": "SCOGS Database",
                    "context": "Citric acid has been evaluated and given a Type 1 conclusion - Safe under conditions of intended use",
                    "substance": "Citric acid",
                    "cas_number": "77-92-9",
                    "year_of_report": "1975"
                }}
            ]
        }}
        """
    )

    scogs_definitions_part = types.Part.from_bytes(data=open(scogs_definitions_path, 'rb').read(), mime_type='text/csv')
    scogs_data_part = types.Part.from_bytes(data=open(scogs_data_path, 'rb').read(), mime_type='text/csv')
    fda_news_release_part = types.Part.from_bytes(data=open(fda_news_release_path, 'rb').read(), mime_type='text/plain')
    
    file_content = open(evidence_file, 'rb').read()
    mime_type = get_mime_type(evidence_file)
    evidence_file_part = types.Part.from_bytes(data=file_content, mime_type=mime_type)

    contents = [types.Content(role="user", parts=[prompt_part, evidence_file_part, scogs_definitions_part, scogs_data_part, fda_news_release_part])]
    model = "gemini-2.5-flash-preview-05-20"
    
    # Create GenerateContentConfig with temperature=0
    generate_content_config = types.GenerateContentConfig(temperature=0)
    
    response = client.models.generate_content(model=model, contents=contents, config=generate_content_config)
    return response.text.strip()


def chat(user_settings, user_preferences, chat_history, query) -> str:
    """
    Makes a call to the Gemini API for a chat interaction.
    """
    try:
        client = genai.Client(api_key=open('keys', 'r').read().strip())
    except FileNotFoundError:
        return "Error: API key not found."

    pdf_file_path = '2024-12-16-healthyclaim-factsheet-scb-0900.pdf'
    txt_file_path = 'Dietary_Guidelines_for_Americans-2020-2025.txt'
    scogs_definitions_path = 'SCOGS-definitions.csv'
    scogs_data_path = 'SCOGS.csv'
    fda_news_release_path = 'FDA News Release.txt'

    if not all(os.path.exists(path) for path in [pdf_file_path, txt_file_path, scogs_definitions_path, scogs_data_path, fda_news_release_path]):
        return "Error: Missing context files."

    prompt_part = types.Part.from_text(
        text=f"""
        You are a helpful Food Nutritionist from the FDA, chatting with a user. Do not introduce yourself.

        Reference Documents:
        - HEALTH: FDA healthy claim factsheet, Dietary Guidelines for Americans
        - SAFETY: SCOGS definitions & data, FDA News Release on banned substances

        User Profile:
        - Description: {user_settings}
        - Preferences: {user_preferences}

        Chat History: {chat_history}
        User's Latest Query: {query}

        Task:
        1.  Provide a concise, one-paragraph response to the user's query.
        2.  If your response references specific information from the provided documents, include inline citation markers (e.g., [1], [2]).
        3.  Return a single JSON object with two fields: "response" and "citations".
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

    pdf_file_part = types.Part.from_bytes(data=open(pdf_file_path, 'rb').read(), mime_type='application/pdf')
    txt_file_part = types.Part.from_bytes(data=open(txt_file_path, 'rb').read(), mime_type='text/plain')
    scogs_definitions_part = types.Part.from_bytes(data=open(scogs_definitions_path, 'rb').read(), mime_type='text/csv')
    scogs_data_part = types.Part.from_bytes(data=open(scogs_data_path, 'rb').read(), mime_type='text/csv')
    fda_news_release_part = types.Part.from_bytes(data=open(fda_news_release_path, 'rb').read(), mime_type='text/plain')

    contents = [types.Content(role="user", parts=[prompt_part, pdf_file_part, txt_file_part, scogs_definitions_part, scogs_data_part, fda_news_release_part])]
    
    # Set temperature to 0 for consistent, fact-based responses
    generate_content_config = types.GenerateContentConfig(temperature=0)
    
    model = "gemini-2.5-flash-preview-05-20"

    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )

    return response.text.strip()

def health_analysis(description, user_settings, user_preferences) -> str:
    """
    Makes a call to the Gemini API to analyze an image of a food item.
    """
    try:
        client = genai.Client(api_key=open('keys', 'r').read().strip())
    except FileNotFoundError:
        return jsonify({"error": "The 'key' file was not found."}), 500

    pdf_file_path = '2024-12-16-healthyclaim-factsheet-scb-0900.pdf'
    txt_file_path = 'Dietary_Guidelines_for_Americans-2020-2025.txt'

    if not os.path.exists(pdf_file_path) or not os.path.exists(txt_file_path):
        return jsonify({"error": "Required context files are missing."}), 500

    try:
        prompt_part = types.Part.from_text(
            text=f"""
            You are provided with a description of food consumed.

            You are also provided with a PDF file of dietary guidelines set by the FDA, along with what is considered "healthy" foods.

            You are also provided with a user profile:

            User Description: {user_settings}
            User Preferences: {user_preferences}

            Using the dietary guidelines and the guide on what is considered healthy foods, determine whether the food is considered "Healthy", "Moderate", or "Unhealthy" for the user.

            Description of the food user ate: {description}

            Return ONLY a single word: "Healthy", "Moderate", or "Unhealthy"
            """
        )

        pdf_file_part = types.Part.from_bytes(
            data=open(pdf_file_path, 'rb').read(),
            mime_type='application/pdf'
        )

        txt_file_part = types.Part.from_bytes(
            data=open(txt_file_path, 'rb').read(),
            mime_type='text/plain'
        )

        contents = [
            types.Content(
                role="user",
                parts=[prompt_part, pdf_file_part, txt_file_part],
            ),
        ]

        tools = [types.Tool(google_search=types.GoogleSearch())]
        generate_content_config = types.GenerateContentConfig(tools=tools)
        model = "gemini-2.5-flash-preview-05-20"

        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
        )
        print(response.text)
        return response.text

    except Exception as e:
        return str(e)

# --- Flask Endpoints ---

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/recommendations', methods=['POST'])
def recommendations_endpoint():
    """Endpoint for meal recommendations."""
    data = request.get_json()
    if not data or 'user_settings' not in data or 'user_preferences' not in data:
        return jsonify({"error": "Missing user_settings or user_preferences"}), 400
    
    user_settings = data['user_settings']
    user_preferences = data['user_preferences']
    print(user_settings, user_preferences)

    result = recommendations(user_settings, user_preferences)
    print(result)
    try:
        # Clean the response to be valid JSON
        cleaned_result = result.strip().replace("```json", "").replace("```", "")
        return jsonify(json.loads(cleaned_result))
    except (json.JSONDecodeError, Exception) as e:
        return jsonify({"error": "Failed to parse Gemini response", "details": str(e)}), 500

@app.route('/img_analysis', methods=['POST'])
def img_analysis_endpoint():
    """Endpoint for image analysis."""
    app.logger.info('Image analysis request received')
    if 'evidence_file' not in request.files:
        app.logger.error('No file part in request')
        return jsonify({"error": "No file part"}), 400
    file = request.files['evidence_file']
    if file.filename == '':
        app.logger.error('No selected file')
        return jsonify({"error": "No selected file"}), 400

    user_settings = request.form.get('user_settings', '')
    user_preferences = request.form.get('user_preferences', '')
    app.logger.info(f'User settings: {user_settings}')
    app.logger.info(f'User preferences: {user_preferences}')

    if file:
        filename = werkzeug.utils.secure_filename(file.filename)
        filepath = os.path.join('/tmp', filename)
        file.save(filepath)
        app.logger.info(f'File saved to {filepath}')

        health_response = health_rating_from_image(filepath, user_settings, user_preferences)
        app.logger.info(f'Health rating response: {health_response}')
        safety_response = safety_rating_from_image(filepath, user_settings, user_preferences)
        app.logger.info(f'Safety rating response: {safety_response}')
        
        os.remove(filepath)
        app.logger.info(f'File {filepath} removed')

        try:
            cleaned_health_response = clean_json_response(health_response)
            cleaned_safety_response = clean_json_response(safety_response)
            
            health_data = json.loads(cleaned_health_response)
            safety_data = json.loads(cleaned_safety_response)
            
            response_data = {
                "healthRating": health_data.get("rating"),
                "healthSummary": health_data.get("summary"),
                "healthCitations": health_data.get("citations", []),
                "safetyRating": safety_data.get("rating"),
                "safetySummary": safety_data.get("summary"),
                "safetyCitations": safety_data.get("citations", [])
            }
            app.logger.info(f'Returning response: {response_data}')
            return jsonify(response_data)
        except json.JSONDecodeError as e:
            app.logger.error(f'Failed to parse rating responses: {e}')
            app.logger.error(f'Health response: {health_response}')
            app.logger.error(f'Safety response: {safety_response}')
            return jsonify({"error": "Failed to parse rating responses"}), 500

@app.route('/health', methods=['POST'])
def health_endpoint():
    """Endpoint for health rating of a food description."""
    data = request.get_json()
    if not data or 'description' not in data:
        return jsonify({"error": "Missing description"}), 400
    
    description = data['description']
    user_settings = data.get('user_settings', '')
    user_preferences = data.get('user_preferences', '')

    result = health_rating_from_text(description, user_settings, user_preferences)
    
    try:
        cleaned_result = clean_json_response(result)
        return jsonify(json.loads(cleaned_result))
    except (json.JSONDecodeError, Exception) as e:
        return jsonify({"error": "Failed to parse Gemini response", "details": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat_endpoint():
    """Endpoint for chat interaction."""
    data = request.get_json()
    if not data or not all(k in data for k in ['user_settings', 'user_preferences', 'chat_history', 'query']):
        return jsonify({"error": "Missing required fields"}), 400

    user_settings = data['user_settings']
    user_preferences = data['user_preferences']
    chat_history = data['chat_history']
    query = data['query']

    result = chat(user_settings, user_preferences, chat_history, query)
    
    try:
        # Clean the response to be valid JSON
        cleaned_result = clean_json_response(result)
        # Attempt to parse the JSON response
        response_data = json.loads(cleaned_result)
        
        # Ensure the response has the expected keys
        if "response" not in response_data:
            # If parsing fails or keys are missing, wrap the raw text in the expected structure
            return jsonify({"response": result, "citations": []})
            
        return jsonify(response_data)
        
    except (json.JSONDecodeError, Exception) as e:
        app.logger.error(f"Failed to parse chat response: {e}")
        app.logger.error(f"Raw response was: {result}")
        # Fallback for non-JSON responses: return the raw text in the expected structure
        return jsonify({"response": result, "citations": []})


@app.route('/text-to-speech', methods=['POST'])
def text_to_speech_endpoint():
    """Endpoint for Google Cloud Text-to-Speech synthesis."""
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "Missing text parameter"}), 400
    
    text = data['text']
    
    try:
        # Load API key from keys file or environment variable
        try:
            api_key = open('tts_keys', 'r').read().strip()
        except FileNotFoundError:
            api_key = os.environ.get('GOOGLE_TTS_API_KEY', '')
            if not api_key:
                return jsonify({"error": "Text-to-Speech API key not found. Please set GOOGLE_TTS_API_KEY environment variable or create a 'tts_keys' file."}), 500
        
        # Google Cloud Text-to-Speech API endpoint with API key as query parameter
        url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
        
        # Request headers
        headers = {
            "Content-Type": "application/json"
        }
        
        # Request body - try a simpler configuration first
        payload = {
            "input": {
                "text": text
            },
            "voice": {
                "languageCode": "en-US",
                "ssmlGender": "FEMALE"  # Simplified voice selection
            },
            "audioConfig": {
                "audioEncoding": "MP3"
            }
        }
        
        # Log the request for debugging
        app.logger.info(f"TTS Request URL: {url}")
        app.logger.info(f"TTS Request payload: {json.dumps(payload, indent=2)}")
        
        # Make the API request
        response = requests.post(url, headers=headers, json=payload)
        
        # Log the response
        app.logger.info(f"TTS Response status: {response.status_code}")
        app.logger.info(f"TTS Response headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            # Successfully got audio content
            result = response.json()
            audio_content = result.get("audioContent", "")
            app.logger.info(f"Audio content length: {len(audio_content)}")
            return jsonify({
                "audioContent": audio_content
            })
        else:
            # API error - get detailed error information
            error_text = response.text
            try:
                error_data = response.json()
            except:
                error_data = {"raw_error": error_text}
            
            app.logger.error(f"Text-to-Speech API error: {response.status_code}")
            app.logger.error(f"Error response: {error_text}")
            
            return jsonify({
                "error": "Text-to-Speech API error",
                "details": error_data,
                "status_code": response.status_code,
                "raw_response": error_text
            }), response.status_code
            
    except Exception as e:
        app.logger.error(f"Text-to-Speech error: {str(e)}")
        return jsonify({
            "error": "Internal server error during text-to-speech conversion",
            "details": str(e)
        }), 500

    user_settings = data['user_settings']
    user_preferences = data['user_preferences']
    description = data['description']

    result = health_analysis(description, user_settings, user_preferences)
    return jsonify({"rating": result})

if __name__ == '__main__':
    # Before running, ensure you have the following files in the same directory:
    # - keys (containing your Gemini API key)
    # - 2024-12-16-healthyclaim-factsheet-scb-0900.pdf
    # - Dietary_Guidelines_for_Americans-2020-2025.txt
    # - SCOGS-definitions.csv
    # - SCOGS.csv
    app.run(debug=True)
