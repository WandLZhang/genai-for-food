#!/usr/bin/env python3
"""
Script to upload FDA nutrition and safety documents to Google Cloud Storage for RAG-based analysis.

This script uploads the following documents:
- FDA healthy claim factsheet
- Dietary Guidelines for Americans (PDF and text versions)
- FDA News Release on banned substances
- SCOGS safety data and definitions

Usage:
    # Using default bucket name (fda-genai-for-food-rag)
    python upload-rag-documents.py
    
    # Using environment variable
    RAG_BUCKET_NAME=my-custom-bucket python upload-rag-documents.py
    
    # Using command-line argument
    python upload-rag-documents.py --bucket my-custom-bucket
"""

import os
import sys
import argparse
from google.cloud import storage

# Default bucket name
DEFAULT_BUCKET_NAME = 'fda-genai-for-food-rag'

# Define the files to upload
FILES_TO_UPLOAD = [
    '2024-12-16-healthyclaim-factsheet-scb-0900.pdf',
    'Dietary_Guidelines_for_Americans-2020-2025.pdf',
    'Dietary_Guidelines_for_Americans-2020-2025.txt',
    'FDA News Release.txt',
    'SCOGS-definitions.csv',
    'SCOGS.csv'
]

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Upload FDA nutrition and safety documents to Google Cloud Storage'
    )
    parser.add_argument(
        '--bucket',
        help=f'GCS bucket name (default: {DEFAULT_BUCKET_NAME})',
        default=None
    )
    parser.add_argument(
        '--create-bucket',
        action='store_true',
        help='Create bucket if it does not exist (default: true)'
    )
    parser.add_argument(
        '--location',
        default='us',
        help='Bucket location if creating new bucket (default: us)'
    )
    return parser.parse_args()

def get_bucket_name(args):
    """Determine bucket name from args or environment."""
    # Priority: CLI arg > env var > default
    if args.bucket:
        return args.bucket
    return os.environ.get('RAG_BUCKET_NAME', DEFAULT_BUCKET_NAME)

def upload_files_to_gcs(bucket_name, create_if_missing=True, location='us'):
    """Upload files to Google Cloud Storage."""
    # Initialize storage client
    try:
        storage_client = storage.Client()
    except Exception as e:
        print(f"Error initializing storage client: {e}")
        print("\nMake sure you have authenticated with Google Cloud:")
        print("  gcloud auth application-default login")
        return False
    
    # Create bucket if it doesn't exist
    try:
        bucket = storage_client.bucket(bucket_name)
        if not bucket.exists():
            if create_if_missing:
                bucket = storage_client.create_bucket(bucket_name, location=location)
                print(f"Created bucket: {bucket_name} in location: {location}")
            else:
                print(f"Error: Bucket {bucket_name} does not exist")
                return False
        else:
            print(f"Using existing bucket: {bucket_name}")
    except Exception as e:
        print(f"Error accessing/creating bucket: {e}")
        return False
    
    # Base directory where files are located
    base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'documents')
    
    if not os.path.exists(base_dir):
        print(f"Error: Documents directory not found: {base_dir}")
        return False
    
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
    
    print(f"\nUploaded {success_count}/{len(FILES_TO_UPLOAD)} files to {bucket_name}")
    return success_count == len(FILES_TO_UPLOAD)

def main():
    """Main function."""
    args = parse_args()
    bucket_name = get_bucket_name(args)
    
    print("FDA Nutrition RAG Document Upload")
    print("=" * 50)
    print(f"Target bucket: {bucket_name}")
    print(f"Bucket location: {args.location}")
    print("-" * 50)
    
    success = upload_files_to_gcs(
        bucket_name, 
        create_if_missing=args.create_bucket,
        location=args.location
    )
    
    if success:
        print("\nAll files uploaded successfully!")
        print("\nNext steps:")
        print("1. Deploy the Cloud Functions with the following environment variables:")
        print(f"   GEMINI_API_KEY=YOUR_API_KEY")
        print(f"   RAG_BUCKET_NAME={bucket_name}")
        print("\nExample deployment commands:")
        print(f"   gcloud functions deploy analyze-food-image --source backend/function-food-analysis --runtime python311 --trigger-http --allow-unauthenticated --set-env-vars GEMINI_API_KEY=YOUR_API_KEY,RAG_BUCKET_NAME={bucket_name}")
        print(f"   gcloud functions deploy get-food-recommendations --source backend/function-food-recommendations --runtime python311 --trigger-http --allow-unauthenticated --set-env-vars GEMINI_API_KEY=YOUR_API_KEY,RAG_BUCKET_NAME={bucket_name}")
        print(f"   gcloud functions deploy food-chat --source backend/function-food-chat --runtime python311 --trigger-http --allow-unauthenticated --set-env-vars GEMINI_API_KEY=YOUR_API_KEY,RAG_BUCKET_NAME={bucket_name}")
    else:
        print("\nSome files failed to upload. Please check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
