// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import express from 'express';
import cors from 'cors';

// Initialize Express app
const app = express();

// Enable CORS
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS']
};
app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Get satellite image endpoint
app.post('/', async (req, res) => {
  try {
    console.log('[getMapImage] Received request for satellite image');
    
    const { address } = req.body;
    if (!address) {
      console.error('[getMapImage] Missing address in request');
      return res.status(400).json({ error: 'Missing address' });
    }

    console.log('[getMapImage] Fetching satellite image for:', address);

    // Get API key from environment variable
    const mapsApiKey = process.env.MAPS_API_KEY;
    if (!mapsApiKey) {
      console.error('[getMapImage] MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Maps API key not configured' });
    }

    // Get static map image from Google Maps API
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=19&size=800x600&maptype=satellite&key=${mapsApiKey}`;

    // Download map image using native fetch
    const response = await fetch(mapUrl);
    if (!response.ok) {
      const error = `Failed to fetch map image: ${response.statusText}`;
      console.error('[getMapImage]', error);
      throw new Error(error);
    }
    
    console.log('[getMapImage] Successfully fetched from Maps API');
    const imageBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    const imageData = `data:image/jpeg;base64,${base64Image}`;
    console.log('[getMapImage] Image data length:', imageData.length);
    
    // Return results
    console.log('[getMapImage] Returning response with image');
    res.json({
      mapUrl,
      mapImage: imageData,
      formattedAddress: address
    });

  } catch (error) {
    console.error('[getMapImage] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export the Express app for Cloud Functions
export default app;
