#!/usr/bin/env python3
"""
Script to upload RAG documents from fda-food-is-medicine repo to Google Cloud Storage
"""

import os
import sys
from google.cloud import storage

# Set the bucket name (can be overridden by environment variable)
BUCKET_NAME = os.environ.get('RAG_BUCKET_NAME', 'fda-food-medicine-rag')

# Define the files to upload
FILES_TO_UPLOAD = [
    '2024-12-16-healthyclaim-factsheet-scb-0900.pdf',
    'Dietary_Guidelines_for_Americans-2020-2025.pdf',
    'Dietary_Guidelines_for_Americans-2020-2025.txt',
    'FDA News Release.txt',
    'SCOGS-definitions.csv',
    'SCOGS.csv'
]

def upload_files_to_gcs():
    """Upload files to Google Cloud Storage."""
    # Initialize storage client
    storage_client = storage.Client()
    
    # Create bucket if it doesn't exist
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        if not bucket.exists():
            bucket = storage_client.create_bucket(BUCKET_NAME)
            print(f"Created bucket: {BUCKET_NAME}")
        else:
            print(f"Using existing bucket: {BUCKET_NAME}")
    except Exception as e:
        print(f"Error accessing/creating bucket: {e}")
        return False
    
    # Base directory where files are located
    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                           'fda-food-is-medicine-repo', 'back')
    
    # Upload each file
    success_count = 0
    for filename in FILES_TO_UPLOAD:
        file_path = os.path.join(base_dir, filename)
        
        if not os.path.exists(file_path):
            print(f"Warning: File not found - {file_path}")
            continue
        
        try:
            blob = bucket.blob(filename)
            blob.upload_from_filename(file_path)
            print(f"Uploaded: {filename}")
            success_count += 1
        except Exception as e:
            print(f"Error uploading {filename}: {e}")
    
    print(f"\nUploaded {success_count}/{len(FILES_TO_UPLOAD)} files to {BUCKET_NAME}")
    return success_count == len(FILES_TO_UPLOAD)

if __name__ == "__main__":
    print("Starting RAG document upload to Google Cloud Storage...")
    print(f"Target bucket: {BUCKET_NAME}")
    print("-" * 50)
    
    success = upload_files_to_gcs()
    
    if success:
        print("\nAll files uploaded successfully!")
        print("\nNext steps:")
        print("1. Deploy the Cloud Functions:")
        print("   gcloud functions deploy get-food-recommendations --source backend/function-food-recommendations --runtime python311 --trigger-http --allow-unauthenticated --set-env-vars GEMINI_API_KEY=YOUR_API_KEY,RAG_BUCKET_NAME=" + BUCKET_NAME)
        print("   gcloud functions deploy analyze-food-image --source backend/function-food-analysis --runtime python311 --trigger-http --allow-unauthenticated --set-env-vars GEMINI_API_KEY=YOUR_API_KEY,RAG_BUCKET_NAME=" + BUCKET_NAME)
        print("   gcloud functions deploy food-chat --source backend/function-food-chat --runtime python311 --trigger-http --allow-unauthenticated --set-env-vars GEMINI_API_KEY=YOUR_API_KEY,RAG_BUCKET_NAME=" + BUCKET_NAME)
    else:
        print("\nSome files failed to upload. Please check the errors above.")
        sys.exit(1)
