# GenAI for Food Deployment Guide

This guide provides step-by-step instructions for deploying the GenAI for Food application, including the frontend, backend Cloud Functions, and necessary services on Google Cloud.

## 1. Prerequisites

- A Google Cloud project with billing enabled.
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and initialized.
- [Firebase CLI](https://firebase.google.com/docs/cli#setup_update_cli) installed.
- [Python 3.10+](https://www.python.org/downloads/) installed.
- [Node.js and npm](https://nodejs.org/en/download/) installed.

## 2. Project Setup

### 2.1. Set GCP Project

Set your GCP project ID for all subsequent commands:

```bash
gcloud config set project YOUR_PROJECT_ID
```

### 2.2. Enable APIs

Enable the necessary GCP APIs for the project:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  discoveryengine.googleapis.com \
  aiplatform.googleapis.com \
  firebase.googleapis.com \
  firestore.googleapis.com \
  iam.googleapis.com \
  static-maps-backend.googleapis.com
```

### 2.3. Create Google Maps API Key

Go to Google Cloud API marketplace and enable Maps Javascript SDK and Maps Static API. Then create an API key.

## 3. Firebase Setup

### 3.1. Create Firebase Project

If you haven't already, create a Firebase project. You can either use an existing GCP project or create a new one.

- Go to the [Firebase Console](https://console.firebase.google.com/).
- Click "Add project" and select your GCP project.
- Follow the on-screen instructions to complete the setup.

### 3.2. Configure Firebase for the Frontend

The frontend is hosted on Firebase Hosting.

1.  **Login to Firebase:**
    ```bash
    firebase login
    ```

2.  **Initialize Firebase in the `frontend` directory:**
    ```bash
    cd frontend
    firebase use --add
    ```
    Select your Firebase project when prompted.

3.  **Update `firebase.json` (if necessary):**

    If you are not using the `genai-for-food.web.app` hosting URL, you will need to update the `firebase.json` file.

    The existing `frontend/firebase.json` is configured for a specific site.
    ```json
    {
      "hosting": {
        "site": "gps-rit-fda-inspection",
        "public": "public",
        "ignore": [
          "firebase.json",
          "**/.*",
          "**/node_modules/**"
        ],
        "rewrites": [
          {
            "source": "**",
            "destination": "/index.html"
          }
        ]
      }
    }
    ```
    To use a different hosting site, replace the value of `"site"` with your Firebase hosting site name. You can find your site name in the Firebase Hosting console.

4.  **Update `.firebaserc`:**

    The `frontend/.firebaserc` file should be updated with your project ID.
    ```json
    {
      "projects": {
        "default": "YOUR_FIREBASE_PROJECT_ID"
      }
    }
    ```

5.  **Update `frontend/public/config.js`:**

    Update the Firebase project ID in `frontend/public/config.js` to match your project.
    ```javascript
    // ...
    export const config = {
        firebase: {
            // ...
            projectId: "YOUR_FIREBASE_PROJECT_ID",
            // ...
        },
    // ...
    ```

### 3.3. Set Environment Variables

Create a `.env` file in the `frontend` directory by copying the example:
```bash
cp frontend/.env.example frontend/.env
```
And populate it with your API keys.

### 3.4. Create Firestore Database

The application uses Firestore for storing inspection job data and streaming updates. You need to create a Firestore database before deploying the backend:

1. **Go to the Firebase Console**:
   - Navigate to [Firebase Console](https://console.firebase.google.com/)
   - Select your project

2. **Create Firestore Database**:
   - In the left sidebar, click on "Firestore Database"
   - Click "Create database"

3. **Configure Database Settings**:
   - **Choose mode**: Select "Start in production mode" (Firestore Native)
   - **Security rules**: Choose "Start in production mode" (restrictive rules)
     - This is fine since only your Cloud Functions will access Firestore, not client apps
   - **Location**: 
     - For US-based projects: Select "nam5 (United States)" multi-region
     - This provides 99.999% availability and aligns with your Cloud Functions in us-central1

4. **Complete Setup**:
   - Click "Create" to provision your Firestore database
   - The database will be ready in a few moments

**Note**: You only need to create the Firestore database once per project. The Cloud Functions will automatically create the necessary collections (`inspection_jobs`) when they first run.

## 4. RAG Datastore Setup

The application uses a RAG (Retrieval-Augmented Generation) datastore for providing context to the chat function. Setting up the datastore involves two steps: chunking the XML source documents and then uploading them to Google Cloud Discovery Engine.

### 4.1. Install Dependencies

First, create a virtual environment and install the required Python packages:

```bash
cd backend/create-rag-datastore

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip3 install -r requirements.txt
```

### 4.2. Process XML Documents

With the virtual environment still activated, chunk the XML source file (`title21.xml`) into individual JSON documents:

```bash
# Make sure you're still in backend/create-rag-datastore with venv activated
python3 xml_chunker.py
```

This will:
- Parse the `title21.xml` file containing FDA regulations
- Extract individual sections from the XML structure
- Create a `processed_documents` directory
- Generate JSON files for each section with structured metadata (id, section_id, section_name, content)

### 4.3. Create Datastore and Upload Documents

After processing the XML, upload the documents to Google Cloud Discovery Engine (ensure your virtual environment is still activated):

```bash
python3 rag-upload.py \
  --project-id YOUR_PROJECT_ID \
  --datastore-id YOUR_DATASTORE_ID
```

Required parameters:
- `--project-id`: Your GCP project ID
- `--datastore-id`: The ID for your datastore (e.g., `fda-title21_v1`)

Optional parameters:
- `--collection`: Collection name (default: `default_collection`)
- `--documents-dir`: Directory containing JSON documents (default: `processed_documents`)
- `--max-workers`: Maximum concurrent uploads (default: 5)

Example with all parameters:
```bash
python3 rag-upload.py \
  --project-id my-gcp-project \
  --collection default_collection \
  --datastore-id fda-regulations-v1 \
  --documents-dir processed_documents \
  --max-workers 10
```

When you're done, deactivate the virtual environment:
```bash
deactivate
cd ../..
```

This will:
- Create a new Discovery Engine datastore if it doesn't exist (or use existing if already created)
- Upload all JSON documents from the specified directory
- Verify each document after upload
- Provide progress updates and verification results

**Note:** The script automatically handles datastore creation. If the datastore already exists, it will use the existing one and proceed with document uploads.

### 4.4. Cloud Storage Bucket for Food Analysis Documents

The food analysis functions (function-food-analysis, function-food-recommendations, function-food-chat) require a separate Cloud Storage bucket containing FDA and dietary guideline documents. These documents provide context for health and safety analysis.

#### Setup Location

The nutrition RAG documents and upload script are located in:
```
backend/create-nutrition-rag-datastore/
├── upload-rag-documents.py    # Upload script
├── requirements.txt           # Python dependencies
└── documents/                 # RAG documents
    ├── 2024-12-16-healthyclaim-factsheet-scb-0900.pdf
    ├── Dietary_Guidelines_for_Americans-2020-2025.pdf
    ├── Dietary_Guidelines_for_Americans-2020-2025.txt
    ├── FDA News Release.txt
    ├── SCOGS-definitions.csv
    └── SCOGS.csv
```

#### Install Dependencies

```bash
cd backend/create-nutrition-rag-datastore

# Create a virtual environment (recommended)
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate     # On Windows

# Install dependencies
pip install -r requirements.txt
```

**Note:** On macOS with Homebrew-managed Python, you must use a virtual environment to install packages.

#### Upload Documents to Cloud Storage

The upload script supports multiple ways to specify your bucket name:

**Option 1: Using default bucket name**
```bash
python upload-rag-documents.py
```
This creates/uses a bucket named `fda-genai-for-food-rag`

**Option 2: Using command-line argument (recommended)**
```bash
python upload-rag-documents.py --bucket YOUR_BUCKET_NAME
```

**Option 3: Using environment variable**
```bash
RAG_BUCKET_NAME=YOUR_BUCKET_NAME python upload-rag-documents.py
```

**Additional options:**
```bash
# Specify bucket location (default: us)
python upload-rag-documents.py --bucket YOUR_BUCKET_NAME --location us-central1

# Use existing bucket only (fail if bucket doesn't exist)
python upload-rag-documents.py --bucket EXISTING_BUCKET --no-create-bucket
```

#### What the Script Does

The script will:
1. Create the bucket if it doesn't exist (unless `--no-create-bucket` is specified)
2. Upload all 6 FDA/nutrition documents to the bucket
3. Display deployment commands with your bucket name pre-filled

#### Documents Uploaded

- **2024-12-16-healthyclaim-factsheet-scb-0900.pdf** - FDA healthy claim factsheet
- **Dietary_Guidelines_for_Americans-2020-2025.pdf** - Dietary guidelines PDF
- **Dietary_Guidelines_for_Americans-2020-2025.txt** - Dietary guidelines text version
- **FDA News Release.txt** - FDA banned substances information
- **SCOGS-definitions.csv** - SCOGS safety definitions
- **SCOGS.csv** - SCOGS safety data

## 5. Backend Deployment

The backend consists of several Python Cloud Functions.

### 5.1. Configure IAM Permissions

Before deploying Cloud Functions, you need to grant the necessary permissions to the Cloud Build service account:

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant Cloud Build Builder role to the default compute service account
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder

# Grant Vertex AI User role for functions that use Vertex AI
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/aiplatform.user

# Grant Datastore User role for Firestore access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/datastore.user

# Grant Discovery Engine Viewer role for searching datastores
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/discoveryengine.viewer

# Grant Storage Object Viewer role for reading RAG documents from Cloud Storage
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectViewer
```

This step is required to allow the service account to build and deploy Cloud Functions, access Vertex AI services, read/write to Firestore, search Discovery Engine datastores, and read RAG documents from Cloud Storage. Without these permissions, deployments will fail with build service account errors, Vertex AI access errors, Firestore permission errors, Discovery Engine search errors, or Cloud Storage access errors.

### 5.2. Deploying Cloud Functions

Deploy each function from its respective directory.

**`function-audio-output`**
```bash
cd backend/function-audio-output
gcloud functions deploy function-audio-output \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=fda_generate_audio \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=600s \
  --memory=512Mi \
  --cpu=2 \
  --min-instances=1 \
  --max-instances=100 \
  --concurrency=1 \
  --set-env-vars GEMINI_API_KEY=your_gemini_api_key_here
cd ../..
```

**`function-food-analysis`**
```bash
cd backend/function-food-analysis
gcloud functions deploy function-food-analysis \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=analyze_food_image \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=3600s \
  --memory=8Gi \
  --cpu=6 \
  --min-instances=1 \
  --max-instances=100 \
  --concurrency=1 \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_API_KEY,RAG_BUCKET_NAME=YOUR_RAG_BUCKET_NAME
cd ../..
```

**`function-food-chat`**
```bash
cd backend/function-food-chat
gcloud functions deploy function-food-chat \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=food_chat \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_API_KEY,RAG_BUCKET_NAME=YOUR_RAG_BUCKET_NAME
cd ../..
```

**`function-food-recommendations`**
```bash
cd backend/function-food-recommendations
gcloud functions deploy function-food-recommendations \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=get_food_recommendations \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_API_KEY,RAG_BUCKET_NAME=YOUR_RAG_BUCKET_NAME
cd ../..
```

**Note:** The `RAG_BUCKET_NAME` should match the bucket name you created in section 4.4. Replace `YOUR_GEMINI_API_KEY` and `YOUR_RAG_BUCKET_NAME` with your actual values.

**`function-image-inspection`**
```bash
cd backend/function-image-inspection
gcloud functions deploy function-image-inspection \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=process_inspection \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=3600s \
  --memory=8Gi \
  --cpu=6 \
  --min-instances=1 \
  --max-instances=100 \
  --concurrency=1 \
  --set-env-vars GCP_PROJECT=YOUR_PROJECT_ID,DATA_STORE_ID=YOUR_DATASTORE_ID
cd ../..
```

**Note:** The `DATA_STORE_ID` should match the datastore ID you created in section 4.3 (RAG Datastore Setup). For example, if you created a datastore with ID `ecfr-title-21`, use that value here.

**`function-site-check`**
```bash
cd backend/function-site-check
gcloud functions deploy site-check-py \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=analyze_site_precheck \
  --trigger-http \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=3600s \
  --max-instances=100 \
  --concurrency=1 \
  --set-env-vars GCP_PROJECT=YOUR_PROJECT_ID
cd ../..
```

**`function-get-map`** (JavaScript function for map retrieval)
```bash
cd backend/function-get-map
gcloud functions deploy function-get-map \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=default \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=540s \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=100 \
  --concurrency=80 \
  --set-env-vars MAPS_API_KEY=your_google_maps_api_key_here
cd ../..
```

## 6. Update Frontend with Backend Endpoints

After deploying the Cloud Functions, you need to update the frontend to use the correct endpoints.

### 6.1. Automated Update Script

Copy and run this script to automatically update all backend endpoints in your frontend:

```bash
# Set your project ID (replace with your actual project ID)
PROJECT_ID="YOUR_PROJECT_ID"

# Update audioManager.js
echo "Updating audioManager.js..."
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/fda-generate-audio|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-audio-output|g" frontend/public/modules/audioManager.js

# Update inspection.js
echo "Updating inspection.js..."
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/process-inspection|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-image-inspection|g" frontend/public/modules/inspection.js

# Update nutritionAssistant.js
echo "Updating nutritionAssistant.js..."
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/get-food-recommendations|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-food-recommendations|g" frontend/public/modules/nutritionAssistant.js
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/analyze-food-image|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-food-analysis|g" frontend/public/modules/nutritionAssistant.js
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/food-chat|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-food-chat|g" frontend/public/modules/nutritionAssistant.js

# Update sitePrecheck.js
echo "Updating sitePrecheck.js..."
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/site-check-py|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-site-check|g" frontend/public/modules/sitePrecheck.js
sed -i '' "s|https://us-central1-gemini-med-lit-review\.cloudfunctions\.net/function-get-map|https://us-central1-${PROJECT_ID}.cloudfunctions.net/function-get-map|g" frontend/public/modules/sitePrecheck.js

echo "All endpoints updated!"
```

**Note for Linux users:** Remove the empty quotes after `-i` in the sed commands (use `sed -i` instead of `sed -i ''`).

### 6.2. Verify Function URLs (Optional)

If you want to verify your deployed function URLs, run:

```bash
# Get all function URLs
for func in function-audio-output function-food-analysis function-food-chat function-food-recommendations function-image-inspection function-site-check; do
  echo "$func:"
  gcloud functions describe $func --region=us-central1 --format="value(serviceConfig.uri)" 2>/dev/null || echo "Not deployed"
  echo ""
done
```

## 7. Frontend Deployment

Once the backend is deployed and configured, deploy the frontend to Firebase Hosting.

```bash
cd frontend
firebase deploy --only hosting
```

After deployment, your application will be available at your Firebase Hosting URL (e.g., `https://YOUR_PROJECT_ID.web.app`).
