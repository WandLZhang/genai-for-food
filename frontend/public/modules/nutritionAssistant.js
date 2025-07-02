// Nutrition Assistant module - handles nutrition analysis and chat functionality

let nutritionMediaStream = null;
let nutritionCapturedImage = null;
let foodHistory = JSON.parse(localStorage.getItem('foodHistory') || '[]');
let chatMessages = [
    { type: 'bot', text: "Hi! I'm here to help verify food claims and answer nutrition questions. What would you like to know?" }
];

// Initialize nutrition camera
export async function initNutritionCamera() {
    const nutritionVideo = document.getElementById('nutritionVideo');
    
    try {
        nutritionMediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        nutritionVideo.srcObject = nutritionMediaStream;
    } catch (err) {
        console.error('Error accessing camera:', err);
        nutritionVideo.style.background = '#333';
        nutritionVideo.innerHTML = '<div style="color: white; text-align: center; padding-top: 45%; font-size: 18px;">Camera not available</div>';
    }
    
    // Set "Analyze a Food Item" as active by default
    setTimeout(() => {
        const analyzeButton = Array.from(document.querySelectorAll('.nutrition-module-btn'))
            .find(btn => btn.textContent.includes('Analyze'));
        if (analyzeButton) {
            analyzeButton.classList.add('active');
        }
    }, 100);
    
    // Set up file input handler
    const fileInput = document.getElementById('nutritionFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file && window.handleNutritionFileUpload) {
                await window.handleNutritionFileUpload(file);
            }
        });
    }
}

// Capture nutrition photo
export async function captureNutritionPhoto(resizeAndCompressImage) {
    const nutritionVideo = document.getElementById('nutritionVideo');
    
    if (!nutritionVideo.srcObject) {
        alert('Camera not available');
        return;
    }
    
    // Create canvas to capture frame
    const canvas = document.createElement('canvas');
    canvas.width = nutritionVideo.videoWidth;
    canvas.height = nutritionVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(nutritionVideo, 0, 0);
    
    // Get base64 image
    const originalImageBase64 = canvas.toDataURL('image/jpeg');
    
    try {
        // Resize image for better performance
        nutritionCapturedImage = await resizeAndCompressImage(originalImageBase64, 1280, 1280, 0.75);
        
        // Visual feedback
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 1000;
            pointer-events: none;
            opacity: 0.8;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => document.body.removeChild(overlay), 300);
        }, 150);
        
        // Show analysis overlay instead of panel
        showAnalysisOverlay();
        
        // Start analysis
        analyzeNutritionFood();
    } catch (error) {
        console.error('Error capturing photo:', error);
        alert('Failed to capture photo');
    }
}

// Handle file upload for nutrition
export async function handleNutritionFileUpload(file, resizeAndCompressImage) {
    if (file) {
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
            try {
                // Resize image for better performance
                nutritionCapturedImage = await resizeAndCompressImage(loadEvent.target.result, 1280, 1280, 0.75);
                
                // Visual feedback
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: white;
                    z-index: 1000;
                    pointer-events: none;
                    opacity: 0.8;
                    transition: opacity 0.3s ease;
                `;
                document.body.appendChild(overlay);
                
                setTimeout(() => {
                    overlay.style.opacity = '0';
                    setTimeout(() => document.body.removeChild(overlay), 300);
                }, 150);
                
                // Show analysis overlay instead of panel
                showAnalysisOverlay();
                
                // Start analysis
                analyzeNutritionFood();
            } catch (error) {
                console.error('Error processing uploaded image:', error);
                nutritionCapturedImage = loadEvent.target.result; // Fallback to original
                
                // Still show the overlay and try to analyze
                showAnalysisOverlay();
                
                analyzeNutritionFood();
                alert('Could not resize image. Proceeding with original if possible.');
            }
        };
        reader.readAsDataURL(file);
    }
}

// Open nutrition module
export function openNutritionModule(moduleName) {
    // Remove active class from all buttons
    document.querySelectorAll('.nutrition-module-btn').forEach(btn => btn.classList.remove('active'));
    
    // Find and activate the clicked button
    const buttons = document.querySelectorAll('.nutrition-module-btn');
    buttons.forEach(btn => {
        if (btn.textContent.includes('Analyze') && moduleName === 'analyze' ||
            btn.textContent.includes('History') && moduleName === 'history' ||
            btn.textContent.includes('Recommendations') && moduleName === 'recommendations' ||
            btn.textContent.includes('Chat') && moduleName === 'chat') {
            btn.classList.add('active');
        }
    });
    
    // For analyze module, just update the active state without opening overlay
    if (moduleName === 'analyze') {
        // Close any open overlays
        closeAllNutritionOverlays();
        return;
    }
    
    // Show the appropriate overlay
    switch(moduleName) {
        case 'history':
            const historyContent = document.getElementById('nutritionHistoryContent');
            if (historyContent) {
                historyContent.innerHTML = generateNutritionHistoryContent();
            }
            showNutritionOverlay('history');
            break;
        case 'recommendations':
            const recoContent = document.getElementById('nutritionRecommendationsContent');
            if (recoContent) {
                recoContent.innerHTML = generateNutritionRecommendationsContent();
            }
            showNutritionOverlay('recommendations');
            // Load recommendations if not already loaded
            if (!window.nutritionRecommendations) {
                fetchNutritionRecommendations();
            }
            break;
        case 'chat':
            const chatContent = document.getElementById('nutritionChatContent');
            if (chatContent) {
                chatContent.innerHTML = generateNutritionChatContent();
            }
            showNutritionOverlay('chat');
            break;
    }
}

// Close nutrition panel
export function closeNutritionPanel() {
    document.getElementById('nutritionContentPanel').classList.remove('active');
    
    // Re-activate "Analyze a Food Item" button when closing panel
    const analyzeButton = Array.from(document.querySelectorAll('.nutrition-module-btn'))
        .find(btn => btn.textContent.includes('Analyze'));
    if (analyzeButton) {
        document.querySelectorAll('.nutrition-module-btn').forEach(btn => btn.classList.remove('active'));
        analyzeButton.classList.add('active');
    }
}

// Generate content functions
function generateNutritionHistoryContent() {
    return `
        <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 15px; color: #333;">Recent Food Items</h3>
            ${foodHistory.length ? foodHistory.map(item => `
                <div class="nutrition-food-item">
                    <h3>${item.name}</h3>
                    <p><strong>Date:</strong> ${new Date(item.date).toLocaleString()}</p>
                    <p><strong>Health Rating:</strong> <span style="color: ${item.healthRating === 'Healthy' ? '#4CAF50' : '#f44336'}">${item.healthRating}</span></p>
                    <p><strong>Safety Rating:</strong> <span style="color: ${item.safetyRating === 'Safe' ? '#4CAF50' : '#f44336'}">${item.safetyRating}</span></p>
                </div>
            `).join('') : '<p style="color: #666;">No food history yet. Start by analyzing some food items!</p>'}
        </div>
        <button class="nutrition-analyze-btn" onclick="window.clearNutritionHistory()">Clear History</button>
    `;
}

function generateNutritionRecommendationsContent() {
    return `
        <div id="nutritionRecommendationsContainer" style="margin-bottom: 20px;">
            <div style="text-align: center; padding: 40px;">
                <div class="loading-dots">
                    <span>.</span><span>.</span><span>.</span>
                </div>
                <p style="margin-top: 20px; color: #666;">Loading personalized recommendations...</p>
            </div>
        </div>
    `;
}

function generateNutritionAnalyzeContent() {
    if (nutritionCapturedImage) {
        // Show captured image and analysis options
        return `
            <div class="nutrition-analyze-controls">
                <div style="margin-bottom: 20px;">
                    <img src="${nutritionCapturedImage}" style="width: 100%; border-radius: 8px; margin-bottom: 10px;">
                </div>
                <div id="nutritionAnalysisResult">
                    <div style="text-align: center; padding: 20px;">
                        <div class="loading-dots">
                            <span>.</span><span>.</span><span>.</span>
                        </div>
                        <p style="margin-top: 20px; color: #666;">Analyzing food item...</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="nutrition-analyze-controls">
                <p style="color: #666; text-align: center; padding: 40px;">
                    Capture a photo of a food item using the camera button to start analysis.
                </p>
            </div>
        `;
    }
}

function generateNutritionChatContent() {
    return `
        <div class="nutrition-chat-container">
            <div class="nutrition-chat-messages" id="nutritionChatMessages">
                ${chatMessages.map(msg => `
                    <div class="nutrition-message ${msg.type}">
                        ${msg.text}
                    </div>
                `).join('')}
            </div>
            <div class="nutrition-chat-input-container">
                <input type="text" class="nutrition-chat-input" id="nutritionChatInput" placeholder="Ask about food claims, nutrition facts..." onkeypress="window.handleNutritionChatInput(event)">
            </div>
        </div>
    `;
}

// Clear nutrition history
export function clearNutritionHistory() {
    if (confirm('Are you sure you want to clear your food history?')) {
        foodHistory = [];
        localStorage.setItem('foodHistory', JSON.stringify(foodHistory));
        // Update the history overlay content
        const historyContent = document.getElementById('nutritionHistoryContent');
        if (historyContent) {
            historyContent.innerHTML = generateNutritionHistoryContent();
        }
    }
}

// Fetch nutrition recommendations
export async function fetchNutritionRecommendations() {
    try {
        // Get user settings
        const userSettings = localStorage.getItem('userSettings') || 'General health-conscious individual';
        const userPreferences = localStorage.getItem('userPreferences') || 'No specific dietary restrictions';
        
        const response = await fetch('https://us-central1-gemini-med-lit-review.cloudfunctions.net/get-food-recommendations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_settings: userSettings,
                user_preferences: userPreferences
            })
        });
        
        if (!response.ok) throw new Error('Failed to fetch recommendations');
        
        const data = await response.json();
        window.nutritionRecommendations = data;
        
        // Update UI
        const container = document.getElementById('nutritionRecommendationsContainer');
        if (container) {
            container.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 15px; color: #333;">Your Personalized Meal Plan</h3>
                    ${Object.entries(data).filter(([key]) => key !== 'Summary').map(([meal, details]) => `
                        <div class="nutrition-food-item">
                            <h3>${meal}: ${details.Name}</h3>
                            <p>${details.Description}</p>
                        </div>
                    `).join('')}
                    ${data.Summary ? `
                        <div style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                            <h4 style="margin-bottom: 10px;">Summary</h4>
                            <p style="color: #666;">${data.Summary}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        const container = document.getElementById('nutritionRecommendationsContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f44336;">
                    <p>Failed to load recommendations. Please try again.</p>
                    <button class="nutrition-analyze-btn" onclick="window.fetchNutritionRecommendations()" style="margin-top: 20px;">Retry</button>
                </div>
            `;
        }
    }
}

// Analyze nutrition food
async function analyzeNutritionFood() {
    if (!nutritionCapturedImage) return;
    
    try {
        // Get user settings
        const userSettings = localStorage.getItem('userSettings') || 'General health-conscious individual';
        const userPreferences = localStorage.getItem('userPreferences') || 'No specific dietary restrictions';
        
        const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/function-food-analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageData: nutritionCapturedImage,
                mimeType: 'image/jpeg',
                user_settings: userSettings,
                user_preferences: userPreferences
            })
        });
        
        if (!response.ok) throw new Error('Failed to analyze image');
        
        const data = await response.json();
        
        // Add to history
        const foodItem = {
            name: 'Food Item ' + (foodHistory.length + 1),
            date: new Date().toISOString(),
            healthRating: data.healthRating,
            safetyRating: data.safetyRating,
            healthSummary: data.healthSummary,
            safetySummary: data.safetySummary,
            image: nutritionCapturedImage
        };
        
        foodHistory.unshift(foodItem);
        localStorage.setItem('foodHistory', JSON.stringify(foodHistory));
        
        // Update UI
        const resultContainer = document.getElementById('nutritionAnalysisResult');
        if (resultContainer) {
            // Process summaries to add citation tooltips
            const healthSummaryWithTooltips = addCitationTooltips(data.healthSummary, data.healthCitations);
            const safetySummaryWithTooltips = addCitationTooltips(data.safetySummary, data.safetyCitations);
            
            resultContainer.innerHTML = `
                <div class="nutrition-food-item">
                    <h3>Analysis Results</h3>
                    <div style="margin: 15px 0;">
                        <h4>Health Rating: <span style="color: ${data.healthRating === 'Healthy' ? '#4CAF50' : '#f44336'}">${data.healthRating}</span></h4>
                        <p class="citation-text">${healthSummaryWithTooltips}</p>
                    </div>
                    <div style="margin: 15px 0;">
                        <h4>Safety Rating: <span style="color: ${data.safetyRating === 'Safe' ? '#4CAF50' : '#f44336'}">${data.safetyRating}</span></h4>
                        <p class="citation-text">${safetySummaryWithTooltips}</p>
                    </div>
                </div>
                <button class="nutrition-analyze-btn" onclick="window.resetNutritionAnalysis()">Analyze Another</button>
            `;
            
            // Add click event listeners to citation markers
            setupCitationListeners();
        }
        
        // Play audio summary
        const audioText = `Health Rating: ${data.healthRating}. ${data.healthSummary} Safety Rating: ${data.safetyRating}. ${data.safetySummary}`;
        if (nutritionAudioManager) {
            nutritionAudioManager.playStreamedAudio(audioText);
        }
    } catch (error) {
        console.error('Error analyzing food:', error);
        const resultContainer = document.getElementById('nutritionAnalysisResult');
        if (resultContainer) {
            resultContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f44336;">
                    <p>Failed to analyze food item. Please try again.</p>
                    <button class="nutrition-analyze-btn" onclick="window.retryNutritionAnalysis()" style="margin-top: 20px;">Retry</button>
                </div>
            `;
        }
    }
}

// Handle nutrition chat input
export async function handleNutritionChatInput(event) {
    if (event.key === 'Enter') {
        const input = document.getElementById('nutritionChatInput');
        const message = input.value.trim();
        
        if (message) {
            // Add user message
            chatMessages.push({ type: 'user', text: message });
            
            // Clear input
            input.value = '';
            
            // Update chat display
            updateNutritionChatDisplay();
            
            try {
                // Get user settings
                const userSettings = localStorage.getItem('userSettings') || 'General health-conscious individual';
                const userPreferences = localStorage.getItem('userPreferences') || 'No specific dietary restrictions';
                
                // Send to API
                const response = await fetch('https://us-central1-gemini-med-lit-review.cloudfunctions.net/food-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_settings: userSettings,
                        user_preferences: userPreferences,
                        chat_history: chatMessages.slice(-10), // Last 10 messages
                        query: message
                    })
                });
                
                if (!response.ok) throw new Error('Failed to get response');
                
                const data = await response.json();
                
                // Add bot response
                chatMessages.push({ type: 'bot', text: data.response });
                
                // Update chat display
                updateNutritionChatDisplay();
                
                // Play response audio
                if (nutritionAudioManager) {
                    nutritionAudioManager.playStreamedAudio(data.response);
                }
            } catch (error) {
                console.error('Error in chat:', error);
                chatMessages.push({ type: 'bot', text: 'Sorry, I encountered an error. Please try again.' });
                updateNutritionChatDisplay();
            }
        }
    }
}

// Update nutrition chat display
function updateNutritionChatDisplay() {
    const chatContainer = document.getElementById('nutritionChatMessages');
    if (chatContainer) {
        chatContainer.innerHTML = chatMessages.map(msg => `
            <div class="nutrition-message ${msg.type}">
                ${msg.text}
            </div>
        `).join('');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Clean up nutrition camera when leaving view
export function cleanupNutritionCamera() {
    if (nutritionMediaStream) {
        nutritionMediaStream.getTracks().forEach(track => track.stop());
        nutritionMediaStream = null;
    }
}

// Show analysis overlay
function showAnalysisOverlay() {
    const overlay = document.getElementById('nutritionAnalysisOverlay');
    const content = document.getElementById('nutritionAnalysisContent');
    
    if (overlay && content && nutritionCapturedImage) {
        // Set initial content with loading state
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <img src="${nutritionCapturedImage}" style="width: 100%; border-radius: 8px; margin-bottom: 10px;">
            </div>
            <div id="nutritionAnalysisResult">
                <div style="text-align: center; padding: 20px;">
                    <div class="loading-dots">
                        <span>.</span><span>.</span><span>.</span>
                    </div>
                    <p style="margin-top: 20px; color: #666;">Analyzing food item...</p>
                </div>
            </div>
        `;
        
        // Show overlay
        overlay.classList.add('active');
    }
}

// Hide analysis overlay
function hideAnalysisOverlay() {
    const overlay = document.getElementById('nutritionAnalysisOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Show nutrition overlay
function showNutritionOverlay(overlayType) {
    closeAllNutritionOverlays();
    const overlayId = `nutrition${overlayType.charAt(0).toUpperCase() + overlayType.slice(1)}Overlay`;
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        overlay.classList.add('active');
    }
}

// Close all nutrition overlays
function closeAllNutritionOverlays() {
    document.querySelectorAll('.nutrition-overlay, .nutrition-analysis-overlay').forEach(overlay => {
        overlay.classList.remove('active');
    });
}

// Close specific nutrition overlay
export function closeNutritionOverlay(overlayType) {
    const overlayId = `nutrition${overlayType.charAt(0).toUpperCase() + overlayType.slice(1)}Overlay`;
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    // Re-activate "Analyze a Food Item" button
    const analyzeButton = Array.from(document.querySelectorAll('.nutrition-module-btn'))
        .find(btn => btn.textContent.includes('Analyze'));
    if (analyzeButton) {
        document.querySelectorAll('.nutrition-module-btn').forEach(btn => btn.classList.remove('active'));
        analyzeButton.classList.add('active');
    }
}

// Reset nutrition analysis for another photo
export function resetNutritionAnalysis() {
    nutritionCapturedImage = null;
    // Hide the overlay to return to camera view
    hideAnalysisOverlay();
}

// Retry nutrition analysis
export function retryNutritionAnalysis() {
    analyzeNutritionFood();
}

// Helper function to add citation tooltips to text
function addCitationTooltips(text, citations) {
    if (!citations || citations.length === 0) return text;
    
    // Create a map of citation id to citation data
    const citationMap = {};
    citations.forEach(citation => {
        citationMap[citation.id] = citation;
    });
    
    // Replace [n] with interactive citation markers
    return text.replace(/\[(\d+)\]/g, (match, citationId) => {
        const citation = citationMap[citationId];
        if (!citation) return match;
        
        // Build tooltip content
        let tooltipContent = `<strong>${citation.source}</strong><br>`;
        tooltipContent += `${citation.context}`;
        
        // Add additional details based on citation type
        if (citation.page) {
            tooltipContent += `<br><em>Page: ${citation.page}</em>`;
        }
        if (citation.url) {
            tooltipContent += `<br><a href="${citation.url}" target="_blank" rel="noopener">View Source</a>`;
        }
        if (citation.substance) {
            tooltipContent += `<br><strong>Substance:</strong> ${citation.substance}`;
        }
        if (citation.cas_number) {
            tooltipContent += `<br><strong>CAS:</strong> ${citation.cas_number}`;
        }
        if (citation.year_of_report) {
            tooltipContent += `<br><strong>Year:</strong> ${citation.year_of_report}`;
        }
        
        return `<span class="citation-marker" data-citation-id="${citationId}" tabindex="0">[${citationId}]<span class="citation-tooltip">${tooltipContent}</span></span>`;
    });
}

// Setup event listeners for citation markers
function setupCitationListeners() {
    const citationMarkers = document.querySelectorAll('.citation-marker');
    
    citationMarkers.forEach(marker => {
        // Click to toggle tooltip
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            const tooltip = marker.querySelector('.citation-tooltip');
            tooltip.classList.toggle('show');
            
            // Hide other tooltips
            document.querySelectorAll('.citation-tooltip.show').forEach(other => {
                if (other !== tooltip) {
                    other.classList.remove('show');
                }
            });
        });
        
        // Keyboard accessibility
        marker.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                marker.click();
            }
        });
    });
    
    // Close tooltips when clicking elsewhere
    document.addEventListener('click', () => {
        document.querySelectorAll('.citation-tooltip.show').forEach(tooltip => {
            tooltip.classList.remove('show');
        });
    });
}

// Initialize audio manager for nutrition module
let nutritionAudioManager = null;
export function setAudioManager(audioManager) {
    nutritionAudioManager = audioManager;
    
    // Update global functions to use the audio manager
    window.analyzeNutritionFood = analyzeNutritionFood;
    window.retryNutritionAnalysis = retryNutritionAnalysis;
}

// Export functions for global access
export function setupGlobalNutritionFunctions() {
    window.captureNutritionPhoto = captureNutritionPhoto;
    window.openNutritionModule = openNutritionModule;
    window.closeNutritionPanel = closeNutritionPanel;
    window.closeNutritionOverlay = closeNutritionOverlay;
    window.clearNutritionHistory = clearNutritionHistory;
    window.fetchNutritionRecommendations = fetchNutritionRecommendations;
    window.handleNutritionChatInput = handleNutritionChatInput;
    window.resetNutritionAnalysis = resetNutritionAnalysis;
}
