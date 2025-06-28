import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

// Define API key parameters
const mapsApiKey = defineString('MAPS_API_KEY');

// Initialize Express app
const analyzeSitePrecheckApp = express();

// Enable CORS with specific options
const corsOptions = {
  origin: true, // Allow any origin
  methods: ['POST', 'OPTIONS'] // We only need POST and preflight OPTIONS
};

// Enable CORS
analyzeSitePrecheckApp.use(cors(corsOptions));

// Parse JSON bodies
analyzeSitePrecheckApp.use(express.json());

// Get satellite image for site precheck
analyzeSitePrecheckApp.post('/', async (req, res) => {
  try {
    console.log('[getMapData] Received request for satellite image');
    
    // For Firebase Functions, data comes in req.body.data
    const { address } = req.body.data || req.body;
    if (!address) {
      console.error('[getMapData] Missing address in request');
      return res.status(400).json({ error: 'Missing address' });
    }

    console.log('[getMapData] Fetching satellite image for:', address);

    // Get static map image from Google Maps API
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=19&size=800x600&maptype=satellite&key=${mapsApiKey.value()}`;

    // Download map image
    const response = await fetch(mapUrl);
    if (!response.ok) {
      const error = `Failed to fetch map image: ${response.statusText}`;
      console.error('[getMapData]', error);
      throw new Error(error);
    }
    
    console.log('[getMapData] Successfully fetched from Maps API');
    const imageBuffer = await response.buffer();
    const base64Image = imageBuffer.toString('base64');
    
    const imageData = `data:image/jpeg;base64,${base64Image}`;
    console.log('[getMapData] Image data length:', imageData.length);
    
    // Return results wrapped in data field for Firebase Functions
    console.log('[getMapData] Returning response with image');
    res.json({
      data: {
        mapUrl,
        mapImage: imageData,
        formattedAddress: address
      }
    });

  } catch (error) {
    console.error('[getMapData] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze site image with Python function
analyzeSitePrecheckApp.post('/analyze', async (req, res) => {
  try {
    console.log('[analyzeImage] Received analysis request');
    
    const { image } = req.body.data || req.body;
    if (!image) {
      console.error('[analyzeImage] Missing image in request');
      return res.status(400).json({ error: 'Missing image' });
    }

    console.log('[analyzeImage] Image data length:', image.length);
    console.log('[analyzeImage] Calling Python analysis function...');

    // Call Python function for analysis
    const pythonResponse = await fetch('https://us-central1-gemini-med-lit-review.cloudfunctions.net/site-check-py', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image })
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error('[analyzeImage] Python function error:', errorText);
      throw new Error(`Python function error: ${errorText}`);
    }

    console.log('[analyzeImage] Received response from Python function');
    const analysisData = await pythonResponse.json();
    
    if (!analysisData.vehicle_analysis || !analysisData.annotated_image) {
      console.error('[analyzeImage] Invalid response format:', analysisData);
      throw new Error('Invalid response from analysis function');
    }

    const { vehicle_analysis, annotated_image } = analysisData;
    console.log('[analyzeImage] Analysis complete:', {
      vehicleCount: vehicle_analysis.total_count,
      hasAnnotatedImage: !!annotated_image
    });

    // Generate activity alert based on vehicle count
    const activityAlert = generateActivityAlert(vehicle_analysis.total_count);
    
    // Return results
    const result = {
      mapImage: annotated_image,
      analysis: vehicle_analysis,
      activityAlert
    };
    console.log('[analyzeImage] Returning analysis results');
    res.json(result);

  } catch (error) {
    console.error('[analyzeImage] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate activity alert
function generateActivityAlert(vehicleCount) {
  const hasActivity = vehicleCount > 0;
  return `Based on this month's aerial images, there ${hasActivity ? 'have' : 'have not'} been signs of activity and usage at this inspection site. ${hasActivity ? `The presence of ${vehicleCount} vehicle${vehicleCount > 1 ? 's' : ''} suggests ongoing operations.` : 'No vehicles were detected in the current image.'}`;
}

// Initialize Express app for Firebase config
const firebaseConfigApp = express();
firebaseConfigApp.use(cors(corsOptions));
firebaseConfigApp.use(express.json());

// Endpoint to get Firebase config
firebaseConfigApp.get('/', async (req, res) => {
  try {
    console.log('[getFirebaseConfig] Attempting to access secret');
    
    const config = {
      apiKey: process.env.APP_FIREBASE_KEY,
      authDomain: "gemini-med-lit-review.firebaseapp.com",
      projectId: "gemini-med-lit-review",
      storageBucket: "gemini-med-lit-review.firebasestorage.app",
      messagingSenderId: "934163632848",
      appId: "1:934163632848:web:621139404479e7562e44d5",
      measurementId: "G-Y4Y3EGC8KZ"
    };

    console.log('[getFirebaseConfig] Config built with apiKey:', config.apiKey ? 'Present' : 'Missing');

    // Validate required fields
    const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket'];
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
    }

    // Return validated config
    res.json({ data: config });
  } catch (error) {
    console.error('[getFirebaseConfig] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export the Cloud Functions
export const analyzeSitePrecheck = onRequest({
  memory: '2GB',
  timeoutSeconds: 540,
  params: { mapsApiKey }
}, analyzeSitePrecheckApp);

export const getFirebaseConfig = onRequest({
  memory: '256MB',
  timeoutSeconds: 60,
  secrets: ['APP_FIREBASE_KEY']
}, firebaseConfigApp);
