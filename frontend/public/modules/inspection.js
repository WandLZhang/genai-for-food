// Inspection module - handles food inspection functionality

let mediaStream = null;
let isCameraOn = false;
let capturedImage = null;

// Camera Controls
export async function toggleCamera() {
    const camera = document.getElementById('camera');
    const cameraToggle = document.getElementById('cameraToggle');
    const placeholder = document.getElementById('cameraPlaceholder');
    
    if (!isCameraOn) {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment'
                }
            });
            camera.srcObject = mediaStream;
            isCameraOn = true;
            cameraToggle.querySelector('.material-icons').textContent = 'videocam';
            
            // Hide placeholder and show camera
            if (placeholder) placeholder.style.display = 'none';
            camera.style.display = 'block';
        } catch (err) {
            console.error('Error accessing camera:', err);
            alert('Unable to access camera. Please ensure you have granted camera permissions.');
        }
    } else {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            camera.srcObject = null;
        }
        isCameraOn = false;
        cameraToggle.querySelector('.material-icons').textContent = 'videocam_off';
        
        // Show placeholder and hide camera
        camera.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
    }
}

// Capture frame
export async function captureFrame(resizeAndCompressImage) {
    const camera = document.getElementById('camera');
    
    if (!isCameraOn) {
        alert('Please turn on the camera first.');
        return;
    }

    // Create a canvas to capture the current video frame
    const canvas = document.createElement('canvas');
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(camera, 0, 0);

    // Get base64 image data
    const originalImageBase64 = canvas.toDataURL('image/jpeg');
    try {
        // Max width/height 1280px, JPEG quality 0.75
        const resizedImageBase64 = await resizeAndCompressImage(originalImageBase64, 1280, 1280, 0.75);
        capturedImage = resizedImageBase64;
        showPreview(capturedImage);
    } catch (error) {
        console.error("Error resizing image from camera:", error);
        capturedImage = originalImageBase64; // Fallback to original
        showPreview(capturedImage);
        alert("Could not resize image. Proceeding with original if possible.");
    }
}

// Show preview
function showPreview(imageData) {
    const camera = document.getElementById('camera');
    const captureButton = document.getElementById('captureButton');
    const cameraToggle = document.getElementById('cameraToggle');
    const retakeButton = document.getElementById('retakeButton');
    
    // Show preview
    const preview = document.createElement('img');
    preview.src = imageData;
    preview.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; z-index: 10;';
    preview.id = 'preview';
    
    // Remove any existing preview
    const existingPreview = document.getElementById('preview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    // Hide the camera and placeholder
    camera.style.display = 'none';
    const placeholder = document.getElementById('cameraPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    
    // Add preview to the camera container
    const cameraContainer = camera.parentElement;
    cameraContainer.appendChild(preview);
    
    // Update button visibility
    captureButton.style.display = 'none';
    cameraToggle.style.display = 'none';
    retakeButton.style.display = 'flex';
}

// Retake photo
export function retakePhoto() {
    const camera = document.getElementById('camera');
    const captureButton = document.getElementById('captureButton');
    const cameraToggle = document.getElementById('cameraToggle');
    const retakeButton = document.getElementById('retakeButton');
    const fileInput = document.getElementById('fileInput');
    const citationResults = document.getElementById('citationResults');
    const inspectionInput = document.getElementById('inspectionInput');
    
    // Remove preview
    const preview = document.getElementById('preview');
    if (preview) {
        preview.remove();
    }
    
    // Update button visibility
    captureButton.style.display = 'flex';
    cameraToggle.style.display = 'flex';
    retakeButton.style.display = 'none';
    
    // Clear captured image and file input
    capturedImage = null;
    fileInput.value = '';
    
    // Clear citation results
    citationResults.innerHTML = '';
    
    // Clear background input
    inspectionInput.value = '';
    
    // Show appropriate view based on camera state
    const placeholder = document.getElementById('cameraPlaceholder');
    if (isCameraOn) {
        camera.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    } else {
        camera.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
    }
}

// Handle file upload
export async function handleFileUpload(file, resizeAndCompressImage) {
    if (file) {
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
            try {
                // Max width/height 1280px, JPEG quality 0.75
                const resizedImageBase64 = await resizeAndCompressImage(loadEvent.target.result, 1280, 1280, 0.75);
                capturedImage = resizedImageBase64;
                showPreview(capturedImage);
            } catch (error) {
                console.error("Error resizing image from file:", error);
                capturedImage = loadEvent.target.result; // Fallback to original
                showPreview(capturedImage);
                alert("Could not resize image. Proceeding with original if possible.");
            }
        };
        reader.readAsDataURL(file);
    }
}

// Process Inspection
export async function processInspection(audioManager) {
    const inspectionInput = document.getElementById('inspectionInput');
    const processButton = document.getElementById('processButton');
    const citationResults = document.getElementById('citationResults');
    const retakeButton = document.getElementById('retakeButton');
    const captureButton = document.getElementById('captureButton');
    
    if (!capturedImage) {
        alert('Please capture a photo first.');
        return;
    }

    const background = inspectionInput.value.trim();
    if (!background) {
        alert('Please provide inspection background information.');
        return;
    }

    try {
        processButton.disabled = true;
        processButton.textContent = 'Processing...';

        // Clear previous results and show status container
        citationResults.innerHTML = `
            <div id="inspectionStatus" style="margin-bottom: 16px;">
                <div class="streaming-loading">
                    <span>Starting inspection...</span>
                    <div class="loading-dots">
                        <span>.</span><span>.</span><span>.</span>
                    </div>
                </div>
            </div>
            <div id="preliminaryCitations" style="display: none;"></div>
            <div id="verifiedCitations"></div>
        `;

        const statusElement = document.getElementById('inspectionStatus');
        const preliminaryCitationsElement = document.getElementById('preliminaryCitations');
        const verifiedCitationsElement = document.getElementById('verifiedCitations');
        
        let preliminaryCitations = [];
        let verifiedCitations = [];
        let summary = '';

        // Send the POST request first to start the analysis
        const postPromise = fetch('https://us-central1-gemini-med-lit-review.cloudfunctions.net/process-inspection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: capturedImage,
                background: background
            })
        });

        // Start streaming status updates simultaneously
        const streamUrl = 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/process-inspection/stream';
        const analysisStream = new EventSource(streamUrl);

        // Handle streaming events
        analysisStream.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received stream event:', data.type, data);
                
                switch(data.type) {
                    case 'ANALYSIS_STARTED':
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>Image inspection process initiated...</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'INITIAL_ANALYSIS_START':
                    case 'INITIAL_ANALYSIS_PROCESSING':
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>${data.content}</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'INITIAL_CITATIONS_IDENTIFIED':
                        preliminaryCitations = data.data.citations;
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>Found ${preliminaryCitations.length} potential violations. Verifying...</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        // Show preliminary citations
                        preliminaryCitationsElement.innerHTML = `
                            <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 8px;">Preliminary Findings:</h3>
                            ${preliminaryCitations.map((citation, idx) => `
                                <div class="card" style="margin-bottom: 8px; padding: 8px;">
                                    <span style="font-weight: 600;">Violation ${idx + 1}:</span> Section ${citation.section}
                                    <div style="font-size: 0.875rem; color: var(--on-surface-variant);">${citation.reason.substring(0, 100)}...</div>
                                </div>
                            `).join('')}
                        `;
                        preliminaryCitationsElement.style.display = 'block';
                        break;
                        
                    case 'VERIFICATION_PROCESS_START':
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>Cross-referencing ${data.data.citation_count} violations with FDA regulations...</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'CITATION_VERIFICATION_START':
                    case 'CITATION_CODE_LOOKUP':
                    case 'CITATION_AI_VERIFICATION':
                        const citationNum = data.data.citation_index + 1;
                        const totalCitations = data.data.total_citations || preliminaryCitations.length;
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>${data.content || `Processing violation ${citationNum} of ${totalCitations}...`}</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'SINGLE_CITATION_PROCESSED':
                        verifiedCitations.push(data.data.processed_citation);
                        // Update the verified citations display
                        displayVerifiedCitations(verifiedCitations, verifiedCitationsElement);
                        break;
                        
                    case 'SUMMARY_GENERATION_START':
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>Generating inspection summary...</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'SUMMARY_GENERATED':
                        summary = data.data.summary;
                        // Play the summary audio using streaming
                        audioManager.playStreamedAudio(summary);
                        break;
                        
                    case 'ANALYSIS_FINALIZING':
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>Finalizing analysis...</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'ANALYSIS_COMPLETE':
                        // Final update with complete data
                        analysisStream.close();
                        statusElement.innerHTML = `
                            <div style="color: var(--tertiary);">
                                ✓ Analysis complete
                            </div>
                        `;
                        // Hide preliminary citations
                        preliminaryCitationsElement.style.display = 'none';
                        // Display final results
                        displayCitations(data.data.citations, data.data.summary, audioManager);
                        break;
                        
                    case 'status':
                        // Fallback for any status messages
                        statusElement.innerHTML = `
                            <div class="streaming-loading">
                                <span>${data.content}</span>
                                <div class="loading-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        `;
                        break;
                        
                    case 'heartbeat':
                        // Ignore heartbeat messages
                        break;
                        
                    default:
                        console.log('Unknown event type:', data.type);
                }
            } catch (error) {
                console.error('Error parsing stream data:', error);
            }
        };

        analysisStream.onerror = (error) => {
            console.error('Stream error:', error);
            analysisStream.close();
        };

        // Wait for the POST request to complete
        const response = await postPromise;
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        // If stream didn't provide complete results, use POST response
        if (!verifiedCitations.length) {
            displayCitations(result.citations, result.summary, audioManager);
        }
        
        // Keep retake button visible after processing
        retakeButton.style.display = 'flex';
        captureButton.style.display = 'none';

    } catch (err) {
        console.error('Error processing inspection:', err);
        const statusElement = document.getElementById('inspectionStatus');
        if (statusElement) {
                statusElement.innerHTML = `
                    <div style="color: var(--error);">
                        An error occurred while processing the inspection: ${err.message}
                    </div>
                `;
        }
    } finally {
        processButton.disabled = false;
        processButton.textContent = 'Process';
    }
}

// Display verified citations as they come in
function displayVerifiedCitations(citations, container) {
    container.innerHTML = '';
    citations.forEach(citation => {
        const card = document.createElement('div');
        card.className = 'citation-card';
        card.innerHTML = `
            <img src="${citation.image}" alt="Citation evidence" style="width: 100%; height: auto; margin-bottom: 12px;">
            <h3><a href="${citation.url}" target="_blank">Section ${citation.section}</a></h3>
            <div style="margin-bottom: 12px;">
                <h4>Regulation:</h4>
                <p>${citation.text}</p>
            </div>
            <div>
                <h4>Reason:</h4>
                <p>${citation.reason}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

// Display Citations
function displayCitations(citations, summary, audioManager) {
    const citationResults = document.getElementById('citationResults');
    citationResults.innerHTML = '';

    // Create and add summary container
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'summary-container';
    summaryContainer.innerHTML = `
        <div id="streamingOutput">
            ${summary || 'No summary available for these citations.'}
        </div>
    `;
    citationResults.appendChild(summaryContainer);

    // Automatically play summary audio using streaming
    audioManager.playStreamedAudio(summary);

    // Add individual citation cards
    citations.forEach(citation => {
        const card = document.createElement('div');
        card.className = 'citation-card';
        card.innerHTML = `
            <img src="${citation.image}" alt="Citation evidence" style="width: 100%; height: auto; margin-bottom: 12px;">
            <h3><a href="${citation.url}" target="_blank">Section ${citation.section}</a></h3>
            <div style="margin-bottom: 12px;">
                <h4>Regulation:</h4>
                <p>${citation.text}</p>
            </div>
            <div>
                <h4>Reason:</h4>
                <p>${citation.reason}</p>
            </div>
        `;
        citationResults.appendChild(card);
    });
}

// Cleanup camera when leaving view
export function cleanupCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        const camera = document.getElementById('camera');
        camera.srcObject = null;
        mediaStream = null;
    }
    isCameraOn = false;
}

// Get current camera state
export function getCameraState() {
    return { isCameraOn, mediaStream };
}

// Get captured image
export function getCapturedImage() {
    return capturedImage;
}

// Set captured image (for file upload)
export function setCapturedImage(image) {
    capturedImage = image;
}
