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
  iam.googleapis.com
```

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

## 4. Backend Deployment

The backend consists of several Python Cloud Functions.

### 4.1. Configure IAM Permissions

Before deploying Cloud Functions, you need to grant the necessary permissions to the Cloud Build service account:

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant Cloud Build Builder role to the default compute service account
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder
```

This step is required to allow the service account to build and deploy Cloud Functions. Without this permission, deployments will fail with a build service account error.

### 4.2. Deploying Cloud Functions

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
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=analyze_food \
  --trigger-http \
  --allow-unauthenticated
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
  --allow-unauthenticated
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
  --entry-point=recommend_food \
  --trigger-http \
  --allow-unauthenticated
cd ../..
```

**`function-image-inspection`**
```bash
cd backend/function-image-inspection
gcloud functions deploy function-image-inspection \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=inspect_image \
  --trigger-http \
  --allow-unauthenticated
cd ../..
```

**`function-site-check`**
```bash
cd backend/function-site-check/python-function
gcloud functions deploy function-site-check \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=site_check \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars MAPS_API_KEY=your_google_maps_api_key_here,APP_FIREBASE_KEY=your_firebase_api_key_here
cd ../../..
```

## 5. Update Frontend with Backend Endpoints

After deploying the Cloud Functions, you need to update the frontend to use the correct endpoints.

### 5.1. Automated Update Script

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

echo "All endpoints updated!"
```

**Note for Linux users:** Remove the empty quotes after `-i` in the sed commands (use `sed -i` instead of `sed -i ''`).

### 5.2. Verify Function URLs (Optional)

If you want to verify your deployed function URLs, run:

```bash
# Get all function URLs
for func in function-audio-output function-food-analysis function-food-chat function-food-recommendations function-image-inspection function-site-check; do
  echo "$func:"
  gcloud functions describe $func --region=us-central1 --format="value(serviceConfig.uri)" 2>/dev/null || echo "Not deployed"
  echo ""
done
```

## 6. RAG Datastore Setup

The application uses a RAG datastore for providing context to the chat function.

### 5.1. Create the Datastore

Run the `create-rag-datastore/rag-upload.py` script to create the datastore and upload the initial documents.

```bash
python3 backend/create-rag-datastore/rag-upload.py
```

### 5.2. Upload Additional Documents

To upload your own documents to the datastore, use the `upload-rag-documents.py` script.

```bash
python3 backend/upload-rag-documents.py --datastore-id YOUR_DATASTORE_ID --files "path/to/your/file1.pdf" "path/to/your/file2.txt"
```

## 7. Frontend Deployment

Once the backend is deployed and configured, deploy the frontend to Firebase Hosting.

```bash
cd frontend
firebase deploy --only hosting
```

After deployment, your application will be available at your Firebase Hosting URL (e.g., `https://YOUR_PROJECT_ID.web.app`).
