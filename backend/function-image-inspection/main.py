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

import base64
import io
import os
import json
import logging
import threading
import time
import uuid
from datetime import datetime
import tempfile

import flask
import functions_framework
from flask import jsonify, request
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np

from google import genai
from google.api_core.client_options import ClientOptions
from google.api_core.exceptions import NotFound, PermissionDenied, ResourceExhausted
from google.cloud import discoveryengine
from google.cloud import firestore
from google.cloud import storage
from google.genai import types
from datetime import timedelta
import firebase_admin
from firebase_admin import credentials, storage as firebase_storage

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Firestore client
db = firestore.Client()

# Firebase Storage bucket name
FIREBASE_STORAGE_BUCKET = os.environ.get('FIREBASE_STORAGE_BUCKET', 'fda-genai-for-food.firebasestorage.app')

# Initialize Firebase Admin SDK
try:
    # Initialize with storage bucket
    firebase_admin.initialize_app(options={
        'storageBucket': FIREBASE_STORAGE_BUCKET
    })
except ValueError:
    # App already initialized
    pass

# Initialize GCS client
storage_client = storage.Client()
# GCS bucket name for temporary processing (using same as Firebase Storage)
GCS_BUCKET_NAME = FIREBASE_STORAGE_BUCKET

# Discovery Engine setup
PROJECT_ID = os.environ.get('GCP_PROJECT', 'YOUR_PROJECT_ID')
LOCATION = os.environ.get('DISCOVERY_ENGINE_LOCATION', 'global')
DATA_STORE_ID = os.environ.get('DATA_STORE_ID', 'YOUR_DATASTORE_ID')

client_options = ClientOptions(api_endpoint=f"{LOCATION}-discoveryengine.googleapis.com")
search_client = discoveryengine.SearchServiceClient(client_options=client_options)
doc_client = discoveryengine.DocumentServiceClient(client_options=client_options)

# Initialize Gemini 2.5 client
gemini_2_5_client = genai.Client(
    vertexai=True,
    project=os.environ.get('GCP_PROJECT', 'YOUR_PROJECT_ID'),
    location="global"
)

# Model name
GEMINI_2_5_MODEL_NAME = "gemini-2.5-pro"

# Common safety settings
COMMON_SAFETY_SETTINGS = [
    types.SafetySetting(
        category="HARM_CATEGORY_HATE_SPEECH",
        threshold="OFF"
    ),
    types.SafetySetting(
        category="HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold="OFF"
    ),
    types.SafetySetting(
        category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold="OFF"
    ),
    types.SafetySetting(
        category="HARM_CATEGORY_HARASSMENT",
        threshold="OFF"
    )
]

# Grounding tool for Google Search
GROUNDING_TOOL = [types.Tool(google_search=types.GoogleSearch())]

# Global storage for streaming events with full data
streaming_events = {}

def truncate_base64_for_logging(data):
    """Truncate base64 strings in data for cleaner logging"""
    if isinstance(data, str):
        # Check if it's a base64 string (data URL or raw base64)
        if data.startswith('data:') and ';base64,' in data:
            prefix = data.split(';base64,')[0]
            return f"{prefix};base64,[TRUNCATED...length:{len(data)}]"
        elif len(data) > 100 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in data[:100]):
            return f"[BASE64_DATA truncated...length:{len(data)}]"
        return data
    elif isinstance(data, dict):
        return {k: truncate_base64_for_logging(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [truncate_base64_for_logging(item) for item in data]
    else:
        return data

# Firestore helper functions
def create_job(inspection_type):
    """Create a new job document in Firestore"""
    job_id = str(uuid.uuid4())
    job_ref = db.collection('inspection_jobs').document(job_id)
    job_ref.set({
        'job_id': job_id,
        'status': 'created',
        'created_at': firestore.SERVER_TIMESTAMP,
        'inspection_type': inspection_type,
        'events': [],
        'result': None
    })
    return job_id

def add_event_to_job(job_id, event_type, content=None, data=None):
    """Add an event to the job document and streaming storage"""
    job_ref = db.collection('inspection_jobs').document(job_id)
    
    # Create the full event with original data (including images)
    full_event = {
        'timestamp': datetime.utcnow(),
        'type': event_type,
        'content': content or '',
        'data': data or {}
    }
    
    # Add to streaming events with full data
    if job_id not in streaming_events:
        streaming_events[job_id] = []
    streaming_events[job_id].append(full_event)
    
    # Strip images from data before storing to Firestore to avoid size limits
    import copy
    data_for_storage = copy.deepcopy(data) if data else {}
    if isinstance(data_for_storage, dict):
        # Strip image from processed_citation if it exists
        if 'processed_citation' in data_for_storage and 'image' in data_for_storage['processed_citation']:
            data_for_storage['processed_citation'].pop('image', None)
        # Strip images from citations array if it exists
        if 'citations' in data_for_storage and isinstance(data_for_storage['citations'], list):
            data_for_storage['citations'] = strip_image_from_citations(data_for_storage['citations'])
    
    event_for_storage = {
        'timestamp': datetime.utcnow(),
        'type': event_type,
        'content': content or '',
        'data': data_for_storage
    }
    
    job_ref.update({
        'events': firestore.ArrayUnion([event_for_storage]),
        'status': 'processing'
    })
    logger.info(f"Added event to job {job_id}: {event_type}")

def update_job_result(job_id, result, status='completed'):
    """Update the job status only (results are streamed, not stored)"""
    job_ref = db.collection('inspection_jobs').document(job_id)
    # Only update status and timestamp, not the actual results
    # This avoids Firestore's 1MB document size limit
    job_ref.update({
        'status': status,
        'completed_at': firestore.SERVER_TIMESTAMP
    })
    
    # Clean up GCS files for this job
    cleanup_gcs_files(job_id)

def cleanup_gcs_files(job_id):
    """Delete all files associated with a job from Firebase Storage"""
    try:
        # Use Firebase Storage bucket
        bucket = firebase_storage.bucket()
        # List all blobs with this job_id prefix
        blobs = bucket.list_blobs(prefix=f"inspection-uploads/{job_id}")
        for blob in blobs:
            blob.delete()
            logger.info(f"Deleted file: {blob.name}")
    except Exception as e:
        logger.error(f"Error cleaning up files for job {job_id}: {str(e)}")

# RAG Utility Functions
def search_datastore(query: str, data_store_id: str) -> list:
    serving_config = search_client.serving_config_path(
        project=PROJECT_ID,
        location=LOCATION,
        data_store=data_store_id,
        serving_config="default_config",
    )

    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query=query,
        page_size=7,
        query_expansion_spec=discoveryengine.SearchRequest.QueryExpansionSpec(
            condition=discoveryengine.SearchRequest.QueryExpansionSpec.Condition.AUTO
        ),
        spell_correction_spec=discoveryengine.SearchRequest.SpellCorrectionSpec(
            mode=discoveryengine.SearchRequest.SpellCorrectionSpec.Mode.AUTO
        )
    )

    try:
        response = search_client.search(request)
        logging.info(f"Search returned {len(response.results)} results")
        return response.results
    except Exception as e:
        logging.error(f"Error during search: {str(e)}")
        return []

def get_document_by_id(doc_id: str, data_store_id: str) -> discoveryengine.Document:
    parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{data_store_id}/branches/default_branch"
    name = f"{parent}/documents/{doc_id}"
    try:
        document = doc_client.get_document(name=name)
        logging.info(f"Successfully retrieved document: {doc_id}")
        return document
    except NotFound:
        logging.error(f"Document not found: {doc_id}")
    except Exception as e:
        logging.error(f"Error retrieving document {doc_id}: {str(e)}")
    return None

def extract_safe(obj: object, *keys: str) -> object:
    for key in keys:
        if isinstance(obj, dict):
            obj = obj.get(key)
        elif hasattr(obj, key):
            obj = getattr(obj, key)
        else:
            return None
    return obj

def process_search_results(search_results: list, target_string: str) -> list:
    matching_documents = []
    for i, result in enumerate(search_results):
        logging.debug(f"Processing search result {i+1}: {result}")

        doc_id = extract_safe(result, 'document', 'id')
        full_doc = get_document_by_id(doc_id, DATA_STORE_ID)
        
        if full_doc and full_doc.content and full_doc.content.raw_bytes:
            content = full_doc.content.raw_bytes.decode('utf-8')
            section_id = full_doc.struct_data.get('section_id', 'N/A')
            section_name = full_doc.struct_data.get('section_name', 'N/A')
            
            if any(word.lower() in content.lower() for word in target_string.split()):
                matching_documents.append({
                    'id': doc_id,
                    'section_id': section_id,
                    'section': section_name,
                    'content': content
                })
        else:
            logging.warning(f"No content found for document {doc_id}")

    return matching_documents

def get_relevant_codes(query: str, data_store_id: str) -> str:
    search_results = search_datastore(query, data_store_id)
    matching_documents = process_search_results(search_results, query)
    
    relevant_codes = []
    for doc in matching_documents:
        relevant_codes.append(f"Section {doc['section_id']}: {doc['content']}")
    
    return "\n".join(relevant_codes)

def plot_bounding_box(img, citation, verified_section, index):
    draw = ImageDraw.Draw(img)
    width, height = img.size

    color = 'red'
    outline_thickness = 5

    try:
        # Try system-specific default font paths
        if os.name == 'nt':  # Windows
            font = ImageFont.truetype("C:\\Windows\\Fonts\\arial.ttf", 36)
        else:  # Linux/Mac
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
    except OSError:
        # If all else fails, use default font
        font = ImageFont.load_default()

    y1, x1, y2, x2 = citation['box_2d']
    x1 = int(x1 * width / 1000)
    y1 = int(y1 * height / 1000)
    x2 = int(x2 * width / 1000)
    y2 = int(y2 * height / 1000)

    for i in range(outline_thickness):
        draw.rectangle([x1+i, y1+i, x2-i, y2-i], outline=color)

    # Draw text at top of image, independent of bounding box
    label = f"Section {verified_section}"
    text_bbox = draw.textbbox((0, 0), label, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    # Fixed position at top of image
    text_x = 10  # Left margin
    text_y = 10  # Top margin
    
    # Draw white background for text
    draw.rectangle([text_x, text_y, text_x + text_width + 20, text_y + text_height + 10], fill='white')
    
    # Draw text
    draw.text((text_x + 10, text_y + 5), label, fill=color, font=font)

    # Save to memory instead of file
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    
    return base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

def upload_to_gcs(file_data, filename, mime_type):
    """Upload file to GCS and return the URI"""
    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(f"inspection-uploads/{filename}")
        
        # Upload the file
        blob.upload_from_string(file_data, content_type=mime_type)
        
        # Set blob to expire after 24 hours
        blob.update_storage_class("STANDARD")
        
        # Return the GCS URI
        gcs_uri = f"gs://{GCS_BUCKET_NAME}/inspection-uploads/{filename}"
        logger.info(f"Uploaded file to GCS: {gcs_uri}")
        return gcs_uri
    except Exception as e:
        logger.error(f"Error uploading to GCS: {str(e)}")
        raise

def generate_initial_response(job_id, inspection_type, gcs_uri, mime_type="image/jpeg"):
    print(f"Starting generate_initial_response for {inspection_type}")
    add_event_to_job(job_id, "INITIAL_ANALYSIS_START", "Initializing image analysis with AI...")
    
    text_prompt = f"""As an FDA inspector performing a {inspection_type} inspection, analyze the given image.
    Based on Title 21 regulations, identify potential citation opportunities and reference 
    the specific sections of Title 21 that apply. Provide a detailed explanation for each 
    potential citation, including what is observed in the image and how it relates to the 
    regulation. Format your response as a JSON object with the following structure:
    {{
        "citations": [
            {{
                "section": "Cited Title 21 section number",
                "text": "Relevant text from the cited section",
                "reason": "Detailed explanation of why this citation applies based on the image",
                "box_2d": [y1, x1, y2, x2]
            }},
            // Additional citations...
        ]
    }}
    Ensure that the JSON is valid and properly formatted. For each citation, provide specific 
    bounding box coordinates (normalized to 1000x1000) that focus only on the area of the image 
    relevant to that particular citation. Do not use the entire image for every citation.
    Also, more likely the image will show a picture presented on a phone or screen. Do not remark about the act of showing the screen, it's the content's of the image being shown that matters, because this is for demonstration purposes and we won't be able to go to an inspection site often."""

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=text_prompt),
                types.Part.from_uri(file_uri=gcs_uri, mime_type=mime_type)
            ]
        )
    ]

    print(f"Sending request to Gemini model with prompt length: {len(text_prompt)}")
    add_event_to_job(job_id, "INITIAL_ANALYSIS_PROCESSING", "AI is processing visual elements and identifying potential violations...")
    
    # Generate content with streaming
    response_text = ""
    for chunk in gemini_2_5_client.models.generate_content_stream(
        model=GEMINI_2_5_MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=1,
            top_p=0.95,
            max_output_tokens=8192,
            safety_settings=COMMON_SAFETY_SETTINGS,
            tools=GROUNDING_TOOL,
            system_instruction=[types.Part.from_text(text="""Return bounding boxes as a JSON array with labels. Never return masks or code fencing. Limit to 25 objects.
If an object is present multiple times, name them according to their unique characteristic (colors, size, position, unique characteristics, etc..).""")],
            thinking_config=types.ThinkingConfig(
                thinking_budget=128,
            )
        )
    ):
        if chunk.text:
            response_text += chunk.text
    
    print(f"Received response from Gemini model with length: {len(response_text)}")

    try:
        response_text = response_text.strip()
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != -1:
            json_str = response_text[start:end]
            parsed_response = json.loads(json_str)
            print(f"Parsed JSON response with {len(parsed_response['citations'])} citations")
            
            # Add event for initial citations identified
            add_event_to_job(
                job_id,
                "INITIAL_CITATIONS_IDENTIFIED", 
                "Initial potential violations identified.",
                {"citations": parsed_response.get('citations', [])}
            )
            
            return parsed_response
        else:
            raise ValueError("No valid JSON object found in the response")
    except Exception as e:
        logger.error(f"Error formatting response: {str(e)}")
        return {"error": "Failed to parse response"}

def strip_image_from_citations(citations):
    return [{k: v for k, v in citation.items() if k not in ['image', 'frame_image']} for citation in citations]

def extract_frame_at_timestamp(video_path, timestamp):
    """Extract a frame from video at specified timestamp"""
    cap = cv2.VideoCapture(video_path)
    
    # Set position to timestamp (in seconds)
    cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
    
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        # Convert frame to JPEG
        _, buffer = cv2.imencode('.jpg', frame)
        return base64.b64encode(buffer).decode('utf-8')
    return None

def analyze_video_with_gemini(job_id, gcs_uri, video_path, inspection_type):
    """Analyze video with Gemini to identify key timestamps and extract frames"""
    print(f"Starting video analysis with Gemini for {inspection_type}")
    add_event_to_job(job_id, "VIDEO_ANALYSIS_START", "Analyzing video content for inspection points...")
    
    video_prompt = f"""As an FDA inspector performing a {inspection_type} inspection, analyze the given video.
    Based on Title 21 regulations, identify potential citation opportunities throughout the video and reference 
    the specific sections of Title 21 that apply. For each potential violation observed, note the timestamp
    where it occurs. Provide a detailed explanation for each potential citation, including what is observed 
    at that moment and how it relates to the regulation. Format your response as a JSON object with the 
    following structure:
    {{
        "video_citations": [
            {{
                "timestamp": timestamp_in_seconds,
                "section": "Cited Title 21 section number",
                "text": "Relevant text from the cited section", 
                "reason": "Detailed explanation of why this citation applies based on what's observed at this timestamp",
                "box_2d": [y1, x1, y2, x2]
            }},
            // Additional citations at various timestamps...
        ]
    }}
    Ensure that the JSON is valid and properly formatted. For each citation, provide:
    1. The exact timestamp (in seconds) where the violation is most clearly visible
    2. Specific bounding box coordinates (normalized to 1000x1000) for that frame
    3. Only include timestamps where actual violations or inspection-worthy items appear
    Also, more likely the video will show content presented on a phone or screen. Do not remark about 
    the act of showing the screen, it's the content being shown that matters, because this is for 
    demonstration purposes and we won't be able to go to an inspection site often."""

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=video_prompt),
                types.Part.from_uri(file_uri=gcs_uri, mime_type="video/mp4")
            ]
        )
    ]

    # Generate content with streaming
    response_text = ""
    for chunk in gemini_2_5_client.models.generate_content_stream(
        model=GEMINI_2_5_MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=1,
            top_p=0.95,
            max_output_tokens=8192,
            safety_settings=COMMON_SAFETY_SETTINGS,
            tools=GROUNDING_TOOL,
            system_instruction=[types.Part.from_text(text="""Return results as a JSON object with video_citations array. Never return masks or code fencing. Each citation must include a timestamp in seconds.""")],
            thinking_config=types.ThinkingConfig(
                thinking_budget=128,
            )
        )
    ):
        if chunk.text:
            response_text += chunk.text
    
    print(f"Raw Gemini video analysis response length: {len(response_text)}")
    
    try:
        response_text = response_text.strip()
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != -1:
            json_str = response_text[start:end]
            parsed_response = json.loads(json_str)
            video_citations = parsed_response.get('video_citations', [])
            
            # Log the actual timestamps and citations
            logger.info(f"Video analysis found {len(video_citations)} citations")
            logger.info(f"Video analysis response: {json.dumps(video_citations, indent=2)}")
            
            add_event_to_job(
                job_id,
                "TIMESTAMPS_IDENTIFIED",
                f"Found {len(video_citations)} relevant moments in video",
                {"timestamp_count": len(video_citations)}
            )
            
            # Now extract frames for each timestamp and build citations in the same format as image processing
            citations = []
            
            for idx, video_citation in enumerate(video_citations):
                timestamp = video_citation.get('timestamp', 0)
                
                add_event_to_job(
                    job_id,
                    "EXTRACTING_FRAME",
                    f"Extracting frame at {timestamp} seconds...",
                    {"timestamp": timestamp, "frame_index": idx}
                )
                
                # Extract frame at timestamp
                frame_base64 = extract_frame_at_timestamp(video_path, timestamp)
                
                if not frame_base64:
                    logger.error(f"Failed to extract frame at timestamp {timestamp}")
                    continue
                
                # Build citation in the same format as image processing
                citation = {
                    "section": video_citation['section'],
                    "text": video_citation['text'],
                    "reason": video_citation['reason'],
                    "box_2d": video_citation['box_2d'],
                    "frame_image": frame_base64,  # Store the frame
                    "video_timestamp": timestamp  # Keep timestamp info
                }
                citations.append(citation)
            
            # Add event for initial citations identified (matching image processing)
            add_event_to_job(
                job_id,
                "INITIAL_CITATIONS_IDENTIFIED", 
                "Initial potential violations identified.",
                {"citations": strip_image_from_citations(citations)}  # Strip images for event storage
            )
            
            # Return in the same format as generate_initial_response
            return {"citations": citations}
            
        else:
            raise ValueError("No valid JSON object found in the response")
    except Exception as e:
        logger.error(f"Error parsing video analysis response: {str(e)}")
        logger.error(f"Raw response was: {response_text[:500]}...")  # Log first 500 chars
        return {"error": "Failed to parse response"}

def process_video_async(job_id, video_data, inspection_type, is_raw_bytes=False):
    """Process video asynchronously"""
    try:
        add_event_to_job(job_id, "UPLOADING_TO_GCS", "Uploading video to cloud storage...")
        
        # Upload video to GCS
        if is_raw_bytes:
            video_bytes = video_data  # Already raw bytes
        else:
            video_bytes = base64.b64decode(video_data)  # Legacy base64
        filename = f"{job_id}_video.mp4"
        gcs_uri = upload_to_gcs(video_bytes, filename, "video/mp4")
        
        add_event_to_job(job_id, "GCS_UPLOAD_COMPLETE", f"Video uploaded to cloud storage", {"gcs_uri": gcs_uri})
        
        # Save video to temporary file for frame extraction
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_video:
            temp_video.write(video_bytes)
            temp_video_path = temp_video.name
        
        # Analyze video with Gemini and extract frames - now returns {"citations": [...]} like image processing
        initial_response = analyze_video_with_gemini(job_id, gcs_uri, temp_video_path, inspection_type)
        
        if 'error' in initial_response:
            update_job_result(job_id, {"error": initial_response['error']}, status='error')
            return
        
        # Now we have all citations with embedded frame images, process them all at once
        # Just like image processing, call verify_and_complete_response ONCE
        # Pass None as the img parameter since each citation has its own frame_image
        verified_response = verify_and_complete_response(job_id, initial_response, None)
        
        # Clean up temp file
        os.unlink(temp_video_path)
        
        # Update job with final result
        update_job_result(job_id, verified_response)
        
    except Exception as e:
        logger.error(f"Error processing video job {job_id}: {str(e)}")
        update_job_result(job_id, {"error": str(e)}, status='error')

def verify_and_complete_response(job_id, initial_response, img):
    citations_count = len(initial_response.get('citations', []))
    print(f"Starting verify_and_complete_response with {citations_count} citations")
    
    add_event_to_job(
        job_id,
        "VERIFICATION_PROCESS_START",
        "Starting verification and cross-referencing of identified violations with FDA regulations.",
        {"citation_count": citations_count}
    )
    
    verified_citations = []
    total_citations = len(initial_response.get('citations', []))
    for index, citation in enumerate(initial_response.get('citations', [])):
        print(f"Processing citation {index + 1}")
        
        add_event_to_job(
            job_id,
            "CITATION_VERIFICATION_START",
            f"Verifying violation {index + 1} of {total_citations}...",
            {"citation_index": index, "total_citations": total_citations}
        )
        
        add_event_to_job(
            job_id,
            "CITATION_CODE_LOOKUP",
            f"Retrieving relevant FDA regulations for violation {index + 1}...",
            {"citation_index": index}
        )
        
        relevant_codes = get_relevant_codes(citation['reason'], DATA_STORE_ID)
        print(f"Retrieved relevant codes with length: {len(relevant_codes)}")
        
        print(f"Generating verification prompt for citation {index + 1}")
        add_event_to_job(
            job_id,
            "CITATION_AI_VERIFICATION",
            f"Cross-referencing violation {index + 1} with AI and FDA data...",
            {"citation_index": index}
        )
        
        # Create a clean copy of citation without frame_image for the prompt
        citation_for_prompt = {k: v for k, v in citation.items() if k != 'frame_image'}
        
        verification_prompt = f"""Given the following citation and other relevant codes retrieved from the FDA Title 21 regulations, 
        decide which is better and more relevant for the given citation "reason": the original cited section OR another section from the retrieved relevant codes. Use chain of thought. If there is a better section code from the retrieved relevant codes, replace the original cited "section" and "text" fields with the better option from the retrieved relevant codes. 
        Then, generate a valid URL for the (corrected) section.

        Original Citation:
        {json.dumps(citation_for_prompt, indent=2)}

        Relevant Codes:
        {relevant_codes}

        Provide your response as a JSON object with the following structure:
        {{
            "section": "Verified or corrected Title 21 section number",
            "text": "Verified or corrected text from the cited section",
            "reason": "Original reason for the citation",
            "url": "Generated URL of the Title 21 eCFR regulation"
        }}

        For the 'url' field, generate a valid URL to the specific section of the Title 21 eCFR regulation. 
        The URL should follow this format: 
        https://www.ecfr.gov/current/title-21/chapter-[CHAPTER]/subchapter-[SUB CHAPTER]/part-[PART]#p-[PART].[SECTION]

        For example, if citing section 110.80(b)(1), the URL should be:
        https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-110#p-110.80(b)(1)

        Note: The '#p-' prefix is required before the section number in the URL.
        
        Ensure that the generated URL is correct and points to the specific section cited."""
        print(f"Verification prompt length: {len(verification_prompt)}")

        # Generate verification with streaming
        response_text = ""
        for chunk in gemini_2_5_client.models.generate_content_stream(
            model=GEMINI_2_5_MODEL_NAME,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=verification_prompt)])],
            config=types.GenerateContentConfig(
                temperature=1,
                top_p=0.95,
                max_output_tokens=8192,
                safety_settings=COMMON_SAFETY_SETTINGS,
                tools=GROUNDING_TOOL,
                thinking_config=types.ThinkingConfig(
                    thinking_budget=128,
                )
            )
        ):
            if chunk.text:
                response_text += chunk.text
        
        print(f"Received verification response for citation {index + 1}")

        try:
            response_text = response_text.strip()
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start != -1 and end != -1:
                json_str = response_text[start:end]
                logger.info(f"Raw verification JSON string for citation {index + 1}: {truncate_base64_for_logging(json_str)}")
                verified_citation = json.loads(json_str)
                print(f"Parsed verification response for citation {index + 1}")
                if verified_citation:
                    # Check if citation has its own frame_image (video path) or use shared img (image path)
                    if 'frame_image' in citation:
                        # Video path: use the citation's own frame
                        img_to_use = citation.pop('frame_image')  # Remove from citation to keep it clean
                        print(f"Using frame image for citation {index + 1} from video")
                    else:
                        # Image path: use the shared image parameter
                        img_to_use = img
                        print(f"Using shared image for citation {index + 1}")
                    
                    # Convert image to PIL Image for bounding box
                    img_bytes = io.BytesIO(base64.b64decode(img_to_use))
                    pil_img = Image.open(img_bytes)
                    # Convert to RGB mode if needed
                    if pil_img.mode in ('RGBA', 'LA', 'P'):
                        pil_img = pil_img.convert('RGB')
                    
                    # Log citation data before plotting bounding box (with truncated base64)
                    logger.info(f"Data for citation {index + 1} (from initial_response) being used for bounding box: {truncate_base64_for_logging(citation)}")
                    
                    # Plot bounding box and get base64 image
                    image_base64 = plot_bounding_box(pil_img.copy(), citation, verified_citation['section'], index)
                    verified_citation['image'] = f"data:image/jpeg;base64,{image_base64}"
                    
                    # For video citations, add timestamp info
                    if 'video_timestamp' in citation:
                        verified_citation['video_timestamp'] = citation['video_timestamp']
                        verified_citation['frame_description'] = f"Frame at {citation['video_timestamp']}s"
                    
                    verified_citations.append(verified_citation)
                    
                    # Add event for processed citation
                    add_event_to_job(
                        job_id,
                        "SINGLE_CITATION_PROCESSED",
                        f"Violation {index + 1} processed and image generated.",
                        {
                            "citation_index": index,
                            "processed_citation": verified_citation
                        }
                    )
            else:
                logger.error("No valid JSON found in verification response")
        except Exception as e:
            logger.error(f"Error processing verification response: {str(e)}")

    # Generate summary after citations are verified
    if verified_citations:
        print("Verified citations content (with images):")
        citations_json_with_images = json.dumps(verified_citations, indent=2)
        truncated_citations = json.dumps(truncate_base64_for_logging(verified_citations), indent=2)
        print(truncated_citations)
        print(f"Total length of verified_citations JSON (with images): {len(citations_json_with_images)}")

        # Strip images for summary generation
        citations_without_images = strip_image_from_citations(verified_citations)
        print("Verified citations content (without images):")
        citations_json_without_images = json.dumps(citations_without_images, indent=2)
        print(citations_json_without_images)
        print(f"Total length of verified_citations JSON (without images): {len(citations_json_without_images)}")

        print("Generating summary")
        add_event_to_job(
            job_id,
            "SUMMARY_GENERATION_START",
            "All violations processed. Generating final inspection summary..."
        )
        
        summary_prompt = f"""Generate a brief summary of the following FDA citations in 2-3 sentences. Focus on the key issues identified and their potential impact on food safety or compliance.

        Citations:
        {citations_json_without_images}

        Provide your response as a simple string without any JSON formatting or additional markup."""

        # Generate summary with streaming
        summary_text = ""
        for chunk in gemini_2_5_client.models.generate_content_stream(
            model=GEMINI_2_5_MODEL_NAME,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=summary_prompt)])],
            config=types.GenerateContentConfig(
                temperature=1,
                top_p=0.95,
                max_output_tokens=8192,
                safety_settings=COMMON_SAFETY_SETTINGS,
                tools=GROUNDING_TOOL,
                thinking_config=types.ThinkingConfig(
                    thinking_budget=128,
                )
            )
        ):
            if chunk.text:
                summary_text += chunk.text
        print(f"Generated summary with length: {len(summary_text)}")
        
        add_event_to_job(
            job_id,
            "SUMMARY_GENERATED",
            "Inspection summary generated.",
            {"summary": summary_text.strip()}
        )
        
        add_event_to_job(
            job_id,
            "ANALYSIS_FINALIZING",
            "Finalizing analysis..."
        )
        
        final_response = {
            "citations": verified_citations,
            "summary": summary_text.strip()
        }
        
        # Strip images from the response for Firestore storage
        final_response_for_storage = {
            "citations": strip_image_from_citations(verified_citations),
            "summary": summary_text.strip()
        }
        
        add_event_to_job(
            job_id,
            "ANALYSIS_COMPLETE",
            "Image inspection complete.",
            final_response  # Use final_response with images for streaming
        )
        
        print(f"[DEBUG] Added ANALYSIS_COMPLETE event for job {job_id}")
        return final_response
    
    print(f"[DEBUG] No verified citations for job {job_id}")
    return {"citations": verified_citations, "summary": ""}

def process_image_async(job_id, image_data, inspection_type, is_raw_bytes=False):
    """Process the image asynchronously and update Firestore"""
    try:
        print(f"[DEBUG] Starting process_image_async for job {job_id}")
        
        add_event_to_job(job_id, "UPLOADING_TO_GCS", "Uploading image to cloud storage...")
        
        # Upload image to GCS
        if is_raw_bytes:
            image_bytes = image_data  # Already raw bytes
        else:
            image_bytes = base64.b64decode(image_data)  # Legacy base64
        filename = f"{job_id}_image.jpg"
        gcs_uri = upload_to_gcs(image_bytes, filename, "image/jpeg")
        
        add_event_to_job(job_id, "GCS_UPLOAD_COMPLETE", f"Image uploaded to cloud storage", {"gcs_uri": gcs_uri})
        
        # Generate initial response using GCS URI
        initial_response = generate_initial_response(job_id, inspection_type, gcs_uri)
        
        if 'error' in initial_response:
            update_job_result(job_id, {"error": initial_response['error']}, status='error')
            return
        
        # Verify and complete response
        # For bounding boxes, we need base64 encoded image
        if is_raw_bytes:
            image_data_for_verification = base64.b64encode(image_bytes).decode('utf-8')
        else:
            image_data_for_verification = image_data
        verified_response = verify_and_complete_response(job_id, initial_response, image_data_for_verification)
        
        print(f"[DEBUG] verify_and_complete_response returned for job {job_id}")
        
        # Add a small delay to ensure ANALYSIS_COMPLETE event is written
        time.sleep(0.5)
        
        print(f"[DEBUG] Updating job result for {job_id} to completed")
        # Update job with final result
        update_job_result(job_id, verified_response)
        
        print(f"[DEBUG] process_image_async completed for job {job_id}")
        
    except Exception as e:
        logger.error(f"Error processing job {job_id}: {str(e)}")
        update_job_result(job_id, {"error": str(e)}, status='error')

def generate_status_stream(job_id):
    """Generate status stream from streaming events with full data"""
    print(f"generate_status_stream called for job_id: {job_id}")
    
    # Get the job document reference
    job_ref = db.collection('inspection_jobs').document(job_id)
    
    # Track which events we've already sent
    sent_event_count = 0
    last_status = None
    
    while True:
        try:
            # Get the current job document to check status
            job_doc = job_ref.get()
            
            if not job_doc.exists:
                yield f"data: {json.dumps({'type': 'error', 'content': 'Job not found'})}\n\n"
                break
            
            job_data = job_doc.to_dict()
            current_status = job_data.get('status')
            
            # Get streaming events for this job (with full data including images)
            job_streaming_events = streaming_events.get(job_id, [])
            
            # Send any new events
            while sent_event_count < len(job_streaming_events):
                event = job_streaming_events[sent_event_count].copy()
                # Convert timestamp to ISO string if present
                if 'timestamp' in event and hasattr(event['timestamp'], 'isoformat'):
                    event['timestamp'] = event['timestamp'].isoformat()
                print(f"Streaming event: {event.get('type', 'unknown')}")
                yield f"data: {json.dumps(event)}\n\n"
                sent_event_count += 1
            
            # Check if job is completed or errored
            if current_status in ['completed', 'error']:
                # Clean up streaming events for this job
                if job_id in streaming_events:
                    del streaming_events[job_id]
                break
            
            last_status = current_status
            
            # Send heartbeat
            yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            
            # Wait a bit before checking again
            time.sleep(0.5)
            
        except Exception as e:
            logger.error(f"Error in status stream: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            break


def download_from_firebase_storage(storage_path):
    """Download file from Firebase Storage and return bytes"""
    try:
        # Get Firebase Storage bucket
        bucket = firebase_storage.bucket()
        blob = bucket.blob(storage_path)
        
        # Download file
        file_bytes = blob.download_as_bytes()
        logger.info(f"Downloaded file from Firebase Storage: {storage_path}")
        return file_bytes
    except Exception as e:
        logger.error(f"Error downloading from Firebase Storage: {str(e)}")
        raise

def get_mime_type_from_filename(filename):
    """Get MIME type from filename extension"""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    
    mime_types = {
        # Image types
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',
        # Video types
        'mp4': 'video/mp4',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mkv': 'video/x-matroska',
        'webm': 'video/webm',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        'mpg': 'video/mpeg',
        'mpeg': 'video/mpeg',
    }
    
    return mime_types.get(ext, 'application/octet-stream')

def process_from_firebase_storage(job_id, storage_path, inspection_type):
    """Process an image/video from Firebase Storage"""
    try:
        # Get filename from path
        filename = storage_path.split('/')[-1]
        
        # Determine mime type from filename
        mime_type = get_mime_type_from_filename(filename)
        is_video = mime_type.startswith('video/')
        
        # Download file from Firebase Storage
        file_bytes = download_from_firebase_storage(storage_path)
        
        # Upload to GCS for Gemini processing with original filename
        gcs_filename = f"{job_id}_{filename}"
        gcs_uri = upload_to_gcs(file_bytes, gcs_filename, mime_type)
        
        # Use existing GCS processing logic
        process_from_gcs(job_id, gcs_uri, inspection_type)
        
    except Exception as e:
        logger.error(f"Error processing from Firebase Storage: {str(e)}")
        update_job_result(job_id, {"error": str(e)}, status='error')

def process_from_gcs(job_id, gcs_uri, inspection_type):
    """Process an image/video that's already in GCS"""
    try:
        # Determine mime type from filename
        filename = gcs_uri.split('/')[-1]
        mime_type = get_mime_type_from_filename(filename)
        is_video = mime_type.startswith('video/')
        
        if is_video:
            print("Processing video from GCS")
            add_event_to_job(
                job_id,
                "ANALYSIS_STARTED",
                "Video inspection process initiated.",
                {"inspection_type": inspection_type, "content_type": "video"}
            )
            
            # Download video for frame extraction
            bucket_name = gcs_uri.split('/')[2]
            blob_path = '/'.join(gcs_uri.split('/')[3:])
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            # Download to temporary file
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_video:
                blob.download_to_file(temp_video)
                temp_video_path = temp_video.name
            
            # Analyze video with Gemini and extract frames - now returns {"citations": [...]} like image processing
            initial_response = analyze_video_with_gemini(job_id, gcs_uri, temp_video_path, inspection_type)
            
            if 'error' in initial_response:
                update_job_result(job_id, {"error": initial_response['error']}, status='error')
                return
            
            # Now we have all citations with embedded frame images, process them all at once
            # Just like image processing, call verify_and_complete_response ONCE
            # Pass None as the img parameter since each citation has its own frame_image
            verified_response = verify_and_complete_response(job_id, initial_response, None)
            
            # Update job with final result
            update_job_result(job_id, verified_response)
            
            # Clean up temp file
            os.unlink(temp_video_path)
        else:
            print(f"Processing image from GCS with mime type: {mime_type}")
            add_event_to_job(
                job_id,
                "ANALYSIS_STARTED",
                "Image inspection process initiated.",
                {"inspection_type": inspection_type, "content_type": "image"}
            )
            
            # Generate initial response using GCS URI with correct mime type
            initial_response = generate_initial_response(job_id, inspection_type, gcs_uri, mime_type)
            
            if 'error' in initial_response:
                update_job_result(job_id, {"error": initial_response['error']}, status='error')
                return
            
            # Download image for bounding box processing
            bucket_name = gcs_uri.split('/')[2]
            blob_path = '/'.join(gcs_uri.split('/')[3:])
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            image_bytes = blob.download_as_bytes()
            image_data_for_verification = base64.b64encode(image_bytes).decode('utf-8')
            
            # Verify and complete response
            verified_response = verify_and_complete_response(job_id, initial_response, image_data_for_verification)
            
            # Update job with final result
            update_job_result(job_id, verified_response)
            
    except Exception as e:
        logger.error(f"Error processing from GCS: {str(e)}")
        update_job_result(job_id, {"error": str(e)}, status='error')

@functions_framework.http
def process_inspection(request):
    print("Starting process_inspection")
    print(f"Request method: {request.method}")
    print(f"Request path: {request.path}")
    
    # Enable CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
    }

    if request.method == 'OPTIONS':
        print("Handling OPTIONS request")
        return ('', 204, headers)

    # Handle streaming endpoint
    if request.method == 'GET' and request.path.endswith('/stream'):
        print("Handling GET /stream request")
        
        # Get job_id from query parameters
        job_id = request.args.get('job_id')
        if not job_id:
            return jsonify({'error': 'Missing job_id parameter'}), 400, headers
        
        headers['Content-Type'] = 'text/event-stream'
        headers['Cache-Control'] = 'no-cache'
        headers['Connection'] = 'keep-alive'
        headers['X-Accel-Buffering'] = 'no'  # Disable proxy buffering
        
        return flask.Response(generate_status_stream(job_id), 200, headers)


    # Handle regular POST request for image analysis
    if request.method == 'POST':
        print("Handling POST request")
        headers['Content-Type'] = 'application/json'
        
        try:
            # Check if this is a JSON request with Firebase Storage path
            if request.content_type and 'application/json' in request.content_type:
                request_json = request.get_json()
                
                if request_json and 'storage_path' in request_json:
                    # Handle Firebase Storage processing
                    print("Handling Firebase Storage request")
                    storage_path = request_json.get('storage_path', '')
                    inspection_type = request_json.get('background', '')
                    job_id = request_json.get('job_id', '')
                    
                    if not storage_path or not inspection_type or not job_id:
                        return jsonify({'error': 'Missing required fields: storage_path, background, job_id'}), 400, headers
                    
                    # Create job in Firestore if it doesn't exist
                    job_ref = db.collection('inspection_jobs').document(job_id)
                    if not job_ref.get().exists:
                        job_ref.set({
                            'job_id': job_id,
                            'status': 'created',
                            'created_at': firestore.SERVER_TIMESTAMP,
                            'inspection_type': inspection_type,
                            'events': [],
                            'result': None
                        })
                    
                    # Start async processing from Firebase Storage
                    thread = threading.Thread(
                        target=process_from_firebase_storage,
                        args=(job_id, storage_path, inspection_type)
                    )
                    thread.daemon = True
                    thread.start()
                    
                    return jsonify({'job_id': job_id}), 200, headers
                
                elif request_json and 'gcs_uri' in request_json:
                    # Handle direct GCS processing (legacy)
                    print("Handling GCS URI request (legacy)")
                    gcs_uri = request_json.get('gcs_uri', '')
                    inspection_type = request_json.get('background', '')
                    job_id = request_json.get('job_id', '')
                    
                    if not gcs_uri or not inspection_type or not job_id:
                        return jsonify({'error': 'Missing required fields: gcs_uri, background, job_id'}), 400, headers
                    
                    # Create job in Firestore if it doesn't exist
                    job_ref = db.collection('inspection_jobs').document(job_id)
                    if not job_ref.get().exists:
                        job_ref.set({
                            'job_id': job_id,
                            'status': 'created',
                            'created_at': firestore.SERVER_TIMESTAMP,
                            'inspection_type': inspection_type,
                            'events': [],
                            'result': None
                        })
                    
                    # Start async processing from GCS
                    thread = threading.Thread(
                        target=process_from_gcs,
                        args=(job_id, gcs_uri, inspection_type)
                    )
                    thread.daemon = True
                    thread.start()
                    
                    return jsonify({'job_id': job_id}), 200, headers
            
            # Check if this is a multipart/form-data request (raw file upload)
            elif request.content_type and 'multipart/form-data' in request.content_type:
                print("Handling multipart/form-data request")
                
                # Get the file from the request
                if 'file' not in request.files:
                    return jsonify({'error': 'No file part in request'}), 400, headers
                
                file = request.files['file']
                if file.filename == '':
                    return jsonify({'error': 'No file selected'}), 400, headers
                
                # Get inspection type from form data
                inspection_type = request.form.get('background', '')
                if not inspection_type:
                    return jsonify({'error': 'Missing background/inspection_type'}), 400, headers
                
                # Read file data
                file_data = file.read()
                print(f"Received file: {file.filename}, size: {len(file_data)} bytes, content_type: {file.content_type}")
                
                # Determine if it's a video or image based on multiple factors
                # Check content type first
                is_video = file.content_type and 'video' in file.content_type
                
                # If content type doesn't indicate video, check file extension
                if not is_video and file.filename:
                    video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm']
                    is_video = any(file.filename.lower().endswith(ext) for ext in video_extensions)
                
                # If still not detected as video, check file signature
                if not is_video:
                    # Check first few bytes for video signatures
                    file_header = file_data[:100] if len(file_data) >= 100 else file_data
                    video_signatures = [
                        b'ftypmp4',  # MP4
                        b'ftypisom', # MP4
                        b'ftypMSNV', # MP4
                        b'\x00\x00\x00\x14ftypqt', # MOV
                        b'RIFF',     # AVI
                    ]
                    is_video = any(sig in file_header for sig in video_signatures)
                
                print(f"File detected as: {'video' if is_video else 'image'}")
                
            else:
                # Legacy JSON with base64 approach
                print("Handling JSON request (legacy base64)")
                request_json = request.get_json()
                
                if not request_json:
                    return jsonify({'error': 'No JSON data received'}), 400, headers

                image_data = request_json.get('image', '').split(',')[1]  # Remove data URL prefix
                inspection_type = request_json.get('background', '')
                
                if not image_data or not inspection_type:
                    return jsonify({'error': 'Missing required fields'}), 400, headers
                
                # Decode base64 to get raw file data
                file_data = base64.b64decode(image_data)
                # For legacy base64, assume it's an image (videos would be too large for base64)
                is_video = False
                print(f"Base64 data decoded, size: {len(file_data)} bytes")

            # Create a new job
            job_id = create_job(inspection_type)
            print(f"Created job with ID: {job_id}")
            
            # Final check for video detection was already done above
            print(f"Processing as: {'video' if is_video else 'image'}")
            
            if is_video:
                print("Detected video data")
                # Add initial event for video
                add_event_to_job(
                    job_id,
                    "ANALYSIS_STARTED",
                    "Video inspection process initiated.",
                    {"inspection_type": inspection_type, "content_type": "video"}
                )
                
                # Start async video processing in a background thread
                thread = threading.Thread(
                    target=process_video_async,
                    args=(job_id, file_data, inspection_type, True)  # True = raw bytes, not base64
                )
                thread.daemon = True
                thread.start()
            else:
                print("Detected image data")
                # Add initial event for image
                add_event_to_job(
                    job_id,
                    "ANALYSIS_STARTED",
                    "Image inspection process initiated.",
                    {"inspection_type": inspection_type, "content_type": "image"}
                )
                
                # Start async image processing in a background thread
                thread = threading.Thread(
                    target=process_image_async,
                    args=(job_id, file_data, inspection_type, True)  # True = raw bytes, not base64
                )
                thread.daemon = True
                thread.start()
            
            # Return job_id immediately
            return jsonify({'job_id': job_id}), 200, headers

        except Exception as e:
            print(f"Exception caught: {str(e)}")
            logger.error(f"Error processing request: {str(e)}")
            return jsonify({"error": str(e)}), 500, headers

    # If not OPTIONS, GET /stream, or POST, return method not allowed
    print("Method not allowed")
    return jsonify({"error": "Method not allowed"}), 405, headers

if __name__ == "__main__":
    # This is used when running locally only. When deploying to Google Cloud Functions,
    # a webserver will be used to run the app instead
    app = functions_framework.create_app(target="process_inspection")
    port = int(os.environ.get('PORT', 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
