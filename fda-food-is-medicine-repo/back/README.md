# Food is Medicine Backend Setup

## Prerequisites

1. **API Key File**: Create a file named `keys` (no extension) in this directory containing your Google Gemini API key.

2. **Required Files**: Ensure these files exist in the backend directory:
   - `2024-12-16-healthyclaim-factsheet-scb-0900.pdf`
   - `Dietary_Guidelines_for_Americans-2020-2025.txt`
   - `SCOGS-definitions.csv`
   - `SCOGS.csv`
   - `FDA News Release.txt`

3. **Python Dependencies**: Install required packages:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Backend Server

1. Navigate to the backend directory:
   ```bash
   cd back
   ```

2. Start the Flask server:
   ```bash
   python app.py
   ```

3. The server should start on `http://localhost:5000`

## Troubleshooting

- If you get an API key error, make sure the `keys` file exists and contains your valid Gemini API key
- If you get file not found errors, verify all required PDF/CSV/TXT files are in the backend directory
- For CORS issues, the backend already has CORS enabled for all origins

## Testing the Server

Once running, you can test the server is working by visiting:
`http://localhost:5000/` (should show a 404 since there's no root route defined)

The available endpoints are:
- POST `/recommendations` - Get meal recommendations
- POST `/img_analysis` - Analyze food images
- POST `/health` - Check if a food item is healthy
- POST `/chat` - Chat about food and nutrition
