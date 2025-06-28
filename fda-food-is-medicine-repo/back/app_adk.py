import asyncio
import os
from flask import Flask, request, jsonify
from google.genai import types
from google.adk.agents import Agent
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.runners import Runner
from google.adk.tools import google_search

# --- Define constants for clarity ---
APP_NAME = "FDA_food_medicine"
USER_ID = "user"
SESSION_ID = "session"
os.environ["GOOGLE_API_KEY"] = open('key', 'r').read()

app = Flask(__name__)

# --- 1. Function to Load PDF and Text Files ---
async def load_files(artifact_service, app_name, user_id, session_id):
    """
    Loads PDF and text files into the ArtifactService.
    """
    pdf_files = [
        "2024-12-16-healthyclaim-factsheet-scb-0900.pdf"
    ]
    text_files = [
        "Dietary_Guidelines_for_Americans-2020-2025.txt",
        "FDA News Release.txt"
    ]

    for pdf_file in pdf_files:
        try:
            with open(pdf_file, "rb") as f:
                pdf_content = f.read()
                artifact_part = types.Part(
                    inline_data=types.Blob(
                        mime_type="application/pdf",
                        data=pdf_content
                    )
                )
                await artifact_service.save_artifact(
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session_id,
                    filename=pdf_file,
                    artifact=artifact_part
                )
            print(f"Successfully loaded '{pdf_file}' into ArtifactService.")
        except FileNotFoundError:
            print(f"Error: The file '{pdf_file}' was not found.")
            raise

    for text_file in text_files:
        try:
            with open(text_file, "rb") as f:
                text_content = f.read()
                artifact_part = types.Part(
                    inline_data=types.Blob(
                        mime_type="text/plain",
                        data=text_content
                    )
                )
                await artifact_service.save_artifact(
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session_id,
                    filename=text_file,
                    artifact=artifact_part
                )
            print(f"Successfully loaded '{text_file}' into ArtifactService.")
        except FileNotFoundError:
            print(f"Error: The file '{text_file}' was not found.")
            raise

    return pdf_files, text_files

# --- 2. Function for Agent + Runner ---
async def run_agent_and_runner(artifact_service, session_service, app_name, user_id, session_id, pdf_files, text_files, user_query):
    """
    Defines the agent and runner, and executes the agent.
    """
    factsheet_pdf = pdf_files[0]
    guidelines = text_files[0]
    fda_news = text_files[1]

    summarizer_agent = Agent(
        model="gemini-2.5-pro-preview-05-06",
        name="document_summarizer",
        instruction=f"""
        - {factsheet_pdf}: {{artifact.{factsheet_pdf}}}
        - {guidelines}: {{artifact.{guidelines}}}
        - {fda_news}: {{artifact.{fda_news}}}

        According to the dietary guidelines set by the FDA, Women Who Are Pregnant or Lactating opens with a discussion of selected nutrition issues important to this stage of adult life. What types of foods should they consider?
        When making recommendations, also consider the safety information in the FDA News Release. Any food containing substances mentioned in the news release should be considered unsafe.
        """,
        tools=[google_search]
    )

    runner = Runner(
        agent=summarizer_agent,
        app_name=app_name,
        artifact_service=artifact_service,
        session_service=session_service
    )

    user_message = types.Content(parts=[types.Part(text=user_query)])

    print("\nInvoking the agent to summarize the PDF documents...")

    async for event in runner.run_async(
        user_id=user_id, session_id=session_id, new_message=user_message
    ):
        if event.is_final_response():
            return event.content.parts[0].text

    return "No final response from the agent."

# --- 3. Flask Route ---
@app.route('/summarize', methods=['POST'])
async def summarize():
    """
    Flask route to trigger the summarization process.
    """
    data = request.get_json()
    user_query = data.get('query', 'Please provide a summary of the two documents.')

    artifact_service = InMemoryArtifactService()
    session_service = InMemorySessionService()

    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=SESSION_ID
    )
    print(f"Session '{session.id}' created successfully.")

    try:
        pdf_files, text_files = await load_files(artifact_service, APP_NAME, USER_ID, SESSION_ID)
    except FileNotFoundError:
        return jsonify({"error": "One or more files not found."}), 400

    summary = await run_agent_and_runner(
        artifact_service,
        session_service,
        APP_NAME,
        USER_ID,
        SESSION_ID,
        pdf_files,
        text_files,
        user_query
    )

    return jsonify({"summary": summary})

# --- Entry point to run the Flask app ---
if __name__ == "__main__":
    app.run(debug=True)
