import base64
import io
import os
import cv2
import PIL.Image
from google import genai
from google.genai import types
from dotenv import load_dotenv
import json
import logging
from rag_utils import get_relevant_codes, DATA_STORE_ID
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime
import vertexai
from vertexai.preview.generative_models import GenerativeModel, Part, SafetySetting, Tool
from vertexai.preview.generative_models import grounding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
MODEL = "gemini-2.0-flash-exp"

class InspectionApp:
    def __init__(self):
        self.client = genai.Client(
            vertexai=True,
            project="gemini-med-lit-review",
            location="us-central1"
        )
        self.model = "gemini-2.0-flash-exp"
        self.tools = [types.Tool(google_search=types.GoogleSearch())]
        
        self.cap = cv2.VideoCapture(0)
        self.image_dir = "captured_images"
        os.makedirs(self.image_dir, exist_ok=True)
        
        # Initialize Vertex AI for the second model
        vertexai.init(project="gemini-med-lit-review", location="us-central1")
        self.gemini_model = GenerativeModel(
            "gemini-1.5-flash-001",
            tools=[Tool.from_google_search_retrieval(
                google_search_retrieval=grounding.GoogleSearchRetrieval()
            )],
        )

    def _get_frame(self):
        ret, frame = self.cap.read()
        if not ret:
            return None, None, None
        
        img = PIL.Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        img.thumbnail([1024, 1024])
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        local_path = os.path.join(self.image_dir, f"capture_{timestamp}.jpg")
        img.save(local_path)
        logger.info(f"Saved local copy of the image: {local_path}")
        
        image_io = io.BytesIO()
        img.save(image_io, format="jpeg")
        image_io.seek(0)
        return types.Part.from_bytes(data=image_io.getvalue(), mime_type="image/jpeg"), img, local_path

    def generate_initial_response(self, inspection_type, image):
        text_prompt = types.Part.from_text(f"""As an FDA inspector performing a {inspection_type} inspection, analyze the given image.
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
        Also, more likely the image will show a picture presented on a phone or screen. Do not remark about the act of showing the screen, it's the content's of the image being shown that matters, because this is for demonstration purposes and we won't be able to go to an inspection site often.""")

        contents = [
            types.Content(
                role="user",
                parts=[text_prompt, image]
            )
        ]

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=1,
                top_p=0.95,
                max_output_tokens=8192,
                response_modalities=["TEXT"],
                safety_settings=[
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
                ],
                tools=self.tools,
                system_instruction=[types.Part.from_text("""Return bounding boxes as a JSON array with labels. Never return masks or code fencing. Limit to 25 objects.
If an object is present multiple times, name them according to their unique characteristic (colors, size, position, unique characteristics, etc..).""")]
            )
        )

        return self.format_response(response.text)

    def verify_and_complete_response(self, initial_response, img):
        verified_citations = []
        for index, citation in enumerate(initial_response.get('citations', [])):
            relevant_codes = get_relevant_codes(citation['reason'], DATA_STORE_ID)
            
            verification_prompt = f"""Given the following citation and other relevant codes retrieved from the FDA Title 21 regulations, 
            decide which is better and more relevant for the given citation "reason": the original cited section OR another section from the retrieved relevant codes. Use chain of thought. If there is a better section code from the retrieved relevant codes, replace the original cited "section" and "text" fields with the better option from the retrieved relevant codes. 
            Then, generate a valid URL for the (corrected) section.

            Original Citation:
            {json.dumps(citation, indent=2)}

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
            https://www.ecfr.gov/current/title-21/chapter-[CHAPTER]/subchapter-[SUB CHAPTER]/part-[PART]#[SECTION]

            Ensure that the generated URL is correct and points to the specific section cited."""

            generation_config = {
                "max_output_tokens": 8192,
                "temperature": 1,
                "top_p": 0.95,
            }

            safety_settings = [
                SafetySetting(
                    category=SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold=SafetySetting.HarmBlockThreshold.OFF
                ),
                SafetySetting(
                    category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold=SafetySetting.HarmBlockThreshold.OFF
                ),
                SafetySetting(
                    category=SafetySetting.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold=SafetySetting.HarmBlockThreshold.OFF
                ),
                SafetySetting(
                    category=SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold=SafetySetting.HarmBlockThreshold.OFF
                ),
            ]

            responses = self.gemini_model.generate_content(
                [verification_prompt],
                generation_config=generation_config,
                safety_settings=safety_settings,
                stream=True,
            )

            response_text = ""
            for response in responses:
                if response.candidates and response.candidates[0].content.parts:
                    response_text += response.text

            verified_citation = self.format_response(response_text)
            if verified_citation:
                image_path = self.plot_bounding_box(img.copy(), citation, verified_citation['section'], index)
                verified_citation['image_path'] = image_path
                verified_citations.append(verified_citation)

        return {"citations": verified_citations}

    def format_response(self, response_text):
        try:
            response_text = response_text.strip()
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start != -1 and end != -1:
                json_str = response_text[start:end]
                return json.loads(json_str)
            else:
                raise ValueError("No valid JSON object found in the response")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse response as JSON: {str(e)}")
            return {"error": "Failed to parse response as JSON"}
        except Exception as e:
            logger.error(f"Error formatting response: {str(e)}")
            return {"error": "An unexpected error occurred while formatting the response"}

    def plot_bounding_box(self, img, citation, verified_section, index):
        draw = ImageDraw.Draw(img)
        width, height = img.size

        color = 'red'
        outline_thickness = 5

        try:
            # Try to load Arial font
            font = ImageFont.truetype("Arial.ttf", 36)
        except OSError:
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

        output_path = f"citation_{index+1}.jpg"
        img.save(output_path)
        logger.info(f"Saved citation image: {output_path}")
        return output_path

    def run(self):
        print("Hello FDA inspector! What type of inspection are you performing today?")
        
        try:
            while True:
                inspection_type = input("message > ")
                if inspection_type.lower() == 'q':
                    break

                frame, img, local_path = self._get_frame()
                if frame is None or img is None:
                    print("Failed to capture video frame.")
                    continue

                initial_response = self.generate_initial_response(inspection_type, frame)
                if 'error' in initial_response:
                    print(f"Error in initial response: {initial_response['error']}")
                    continue

                verified_response = self.verify_and_complete_response(initial_response, img)
                
                print("\nGemini Analysis:")
                print(json.dumps(verified_response, indent=2))
                print(f"\nLocal copy of the image saved at: {local_path}")
                print("\n")
        finally:
            self.cap.release()

if __name__ == "__main__":
    app = InspectionApp()
    app.run()
