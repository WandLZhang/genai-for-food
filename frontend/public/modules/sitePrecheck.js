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

// Site Precheck module - handles location analysis functionality

let mapContainer = null;
let currentAnalysisController = null;

// Get location details from coordinates dropdown
function getLocationDetails(address) {
    const coordinates = document.getElementById('coordinates');
    const locationData = JSON.parse(coordinates.dataset.coordinates);
    return locationData.find(location => location.address === address);
}

// Load satellite image for a location
async function loadSatelliteImage(address) {
    console.log('Fetching satellite image...');
    try {
        const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/function-get-map', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ address })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch map image:', errorText);
            throw new Error('Failed to get satellite image');
        }
        
        const imageResult = await response.json();
        const { mapUrl, mapImage } = imageResult;
        
        if (!mapImage) {
            console.error('No image data received from server');
            throw new Error('Failed to get satellite image');
        }
        
        console.log('Successfully received satellite image');
        
        // Get location details
        const locationDetails = getLocationDetails(address);
        
        // Display satellite image
        mapContainer.innerHTML = `
            <img src="${mapImage}" alt="Satellite view" style="width: 100%; height: 100%; object-fit: cover;">
        `;
        
        return { mapImage, locationDetails };
    } catch (err) {
        console.error('Error loading satellite image:', err);
        mapContainer.innerHTML = '<div style="padding: 16px; color: var(--error);">Error loading satellite image</div>';
        throw err;
    }
}

// Analyze site image
async function analyzeSite(mapImage) {
    console.log('Starting vehicle detection analysis...');
    try {
        const analysisResult = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/site-check-py', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: mapImage })
        });

        if (!analysisResult.ok) {
            const errorText = await analysisResult.text();
            console.error('Analysis failed:', errorText);
            throw new Error(`Failed to analyze image: ${errorText}`);
        }

        console.log('Received analysis response');
        const analysisData = await analysisResult.json();
        console.log('Analysis data:', {
            hasVehicleAnalysis: !!analysisData.vehicle_analysis,
            hasAnnotatedImage: !!analysisData.annotated_image,
            totalClusters: analysisData.vehicle_analysis?.total_clusters,
            clusterCount: analysisData.vehicle_analysis?.clusters?.length
        });

        const { vehicle_analysis, annotated_image } = analysisData;
        if (!vehicle_analysis || !annotated_image) {
            console.error('Invalid analysis response:', analysisData);
            throw new Error('Invalid analysis response');
        }

        // Validate cluster data
        if (!vehicle_analysis.clusters || !Array.isArray(vehicle_analysis.clusters)) {
            console.error('Missing or invalid clusters array:', vehicle_analysis);
            throw new Error('Invalid cluster data in analysis response');
        }

        if (!vehicle_analysis.activity_level || !['low', 'high', 'moderate'].includes(vehicle_analysis.activity_level)) {
            console.error('Missing or invalid activity_level:', vehicle_analysis);
            throw new Error('Invalid activity level in analysis response');
        }

        return { vehicle_analysis, annotated_image };
    } catch (err) {
        console.error('Error during analysis:', err);
        throw err;
    }
}

// Initialize map view
export async function initMap() {
    mapContainer = document.getElementById('map');
    const coordinates = document.getElementById('coordinates');
    const defaultAddress = "10 Riverside Dr, Long Prairie, MN 56347";
    
    // Set the default value
    coordinates.value = defaultAddress;
    
    // Start analysis for default address
    await analyzeLocation(defaultAddress);
}

// Analyze a location
export async function analyzeLocation(address, audioManager) {
    const resultElement = document.getElementById('precheckResult');
    resultElement.textContent = 'Loading satellite image...';

    // Create a local controller for this analysis
    const localAbortController = new AbortController();

    // Cancel any ongoing analysis
    if (currentAnalysisController) {
        currentAnalysisController.abort();
    }
    
    // Set this as the current active controller
    currentAnalysisController = localAbortController;

    // Stop any playing audio if audioManager is provided
    if (audioManager) {
        audioManager.stopAudio();
    }

    try {
        // First load the satellite image
        const { mapImage, locationDetails } = await loadSatelliteImage(address);
        
        // Show initial location info while analysis runs
        resultElement.innerHTML = `
            <div style="margin-bottom: 8px;">
                <span style="font-weight: 600;">Location:</span>
                <div style="font-size: 0.875rem; font-weight: 600;">${locationDetails.name}</div>
                <div style="font-size: 0.875rem;">${locationDetails.address}</div>
                <div style="font-size: 0.875rem; color: var(--on-surface-variant);">Coordinates: ${locationDetails.lat}, ${locationDetails.lon}</div>
            </div>
            <div style="margin-top: 16px;">
                <div style="font-size: 0.875rem;">Analyzing site activity...</div>
            </div>
        `;
        
        // Initialize streaming output
        resultElement.innerHTML = `
            <div style="margin-bottom: 8px;">
                <span style="font-weight: 600;">Location:</span>
                <div style="font-size: 0.875rem; font-weight: 600;">${locationDetails.name}</div>
                <div style="font-size: 0.875rem;">${locationDetails.address}</div>
            </div>
            <div id="streamingOutput">
                Starting analysis...
            </div>
        `;

        // Start analysis in parallel with streaming
        const analysisPromise = analyzeSite(mapImage).catch(error => {
            console.error('Analysis failed:', error);
            throw error;
        });

        // Start streaming status updates
        const streamingOutput = document.getElementById('streamingOutput');
        const analysisStream = new EventSource('https://us-central1-fda-genai-for-food.cloudfunctions.net/site-check-py/stream');
        
        // Wait for streaming to complete
        await new Promise((resolve, reject) => {
            analysisStream.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'status') {
                        streamingOutput.innerHTML = `<div class="streaming-loading">
                            <span>${data.content}</span>
                            <div class="loading-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </div>
                        </div>`;
                        
                        if (data.content.includes('Finalizing analysis')) {
                            analysisStream.close();
                            resolve();
                        }
                    }
                } catch (error) {
                    console.error('Error parsing stream data:', error);
                    analysisStream.close();
                    reject(error);
                }
            };

            analysisStream.onerror = (error) => {
                console.error('Stream error:', error);
                analysisStream.close();
                reject(new Error('Stream connection failed'));
            };

            localAbortController.signal.addEventListener('abort', () => {
                analysisStream.close();
                reject(new Error('Analysis aborted'));
            });
        });

        // Wait for analysis to complete
        const analysisResult = await analysisPromise;
        
        // Update map with annotated image
        mapContainer.innerHTML = `
            <img src="${analysisResult.annotated_image}" alt="Analyzed satellite view" style="width: 100%; height: 100%; object-fit: cover;">
        `;

        // Update streaming output with final results
        const { activity_level, clusters, observations } = analysisResult.vehicle_analysis;
        let activityDescription;
        let activityLabel;
        
        if (activity_level === "low") {
            activityDescription = "Limited vehicle activity detected, suggesting minimal or intermittent site usage.";
            activityLabel = "Low";
        } else if (activity_level === "moderate") {
            activityDescription = "Moderate vehicle activity detected.";
            activityLabel = "Moderate";
        } else { // Handles "high"
            activityDescription = "Significant vehicle activity detected, indicating active site operations.";
            activityLabel = "High";
        }

        // Add a slight delay to ensure streaming messages are visible
        await new Promise(resolve => setTimeout(resolve, 500));

        const finalResults = `
            <div style="margin-top: 16px;">
                <div style="font-weight: 600; margin-bottom: 8px;">Activity Level: ${activityLabel}</div>
                <div style="margin-bottom: 16px;">${activityDescription}</div>
                <div style="margin-top: 16px; color: var(--on-surface-variant);">
                ${observations.map(obs => `
                    <div style="margin-top: 8px;">• ${obs}</div>
                `).join('')}
                </div>
            </div>
        `;
        
        // Update with final results
        streamingOutput.innerHTML = `
            <div style="font-size: 0.875rem; color: var(--primary); margin-bottom: 8px;">Analysis complete</div>
            ${finalResults}
        `;

        // Automatically play audio using streaming if audioManager is provided
        if (audioManager) {
            const speechText = `Activity Level: ${activityLabel}. ${activityDescription} ${observations.join('. ')}`;
            audioManager.playStreamedAudio(speechText);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Analysis was cancelled');
        } else {
            console.error('Error analyzing location:', error);
            resultElement.innerHTML = `
                <div style="padding: 16px; color: var(--error);">
                    Error: ${error.message}
                </div>
            `;
        }
    } finally {
        // Only nullify if this is still the current controller
        if (currentAnalysisController === localAbortController) {
            currentAnalysisController = null;
        }
    }
}
