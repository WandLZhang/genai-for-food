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

// Nutrition Assistant module - handles nutrition analysis and chat functionality

let nutritionMediaStream = null;
let nutritionCapturedImage = null;

// Clear nutrition setup flag on page load to always show wizard
localStorage.removeItem('nutritionSetupComplete');

// Clear all user profile data on page refresh
localStorage.removeItem('userProfile');
localStorage.removeItem('userSettings');
localStorage.removeItem('userPreferences');

// Initialize food history with example items - always reset to defaults on page refresh
let foodHistory = [
    { 
        text: 'Large pepperoni pizza with soda', 
        colorClass: 'bg-red-200 text-red-800',
        explanation: 'This meal is high in saturated fat and sodium, which can contribute to cardiovascular issues [1]. The soda is a source of empty calories and added sugars [2].',
        citations: [
            { id: 1, source: 'Dietary Guidelines for Americans', context: 'Limit saturated fat to less than 10 percent of calories per day.', page: 'Page 45', url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf' },
            { id: 2, source: 'Dietary Guidelines for Americans', context: 'Limit added sugars to less than 10 percent of calories per day.', page: 'Page 47', url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf' }
        ],
        date: new Date('2024-06-09T19:38:00').toISOString()
    },
    { 
        text: 'Grilled chicken salad with mixed vegetables', 
        colorClass: 'bg-green-100 text-green-800',
        explanation: 'A balanced meal with lean protein, fiber, and vitamins. Grilled chicken is a healthier choice than fried [1].',
        citations: [
            { id: 1, source: 'Dietary Guidelines for Americans', context: 'Choose lean protein sources.', page: 'Page 42', url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf' }
        ],
        date: new Date('2024-06-09T14:38:00').toISOString()
    },
    { 
        text: 'Chocolate chip cookies (3 pieces)', 
        colorClass: 'bg-yellow-100 text-yellow-800',
        explanation: 'Contains high amounts of added sugars and refined flour [1].',
        citations: [
            { id: 1, source: 'Dietary Guidelines for Americans', context: 'Limit foods high in added sugars.', page: 'Page 47', url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf' }
        ],
        date: new Date('2024-06-09T10:38:00').toISOString()
    },
    { 
        text: 'Greek yogurt with berries and granola', 
        colorClass: 'bg-green-100 text-green-800',
        explanation: 'A nutrient-dense breakfast with protein, calcium, and antioxidants from berries [1]. Granola can be high in sugar, so portion control is important [2].',
        citations: [
            { id: 1, source: 'Dietary Guidelines for Americans', context: 'Choose nutrient-dense foods.', page: 'Page 31', url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf' },
            { id: 2, source: 'Dietary Guidelines for Americans', context: 'Be mindful of portion sizes for high-calorie foods.', page: 'Page 55', url: 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf' }
        ],
        date: new Date('2024-06-09T07:38:00').toISOString()
    }
];

// Always save the default food history to localStorage
localStorage.setItem('foodHistory', JSON.stringify(foodHistory));

let chatMessages = [
    { type: 'bot', text: "Hi! I'm here to help verify food claims and answer nutrition questions. What would you like to know?" }
];

// Initialize nutrition camera
export async function initNutritionCamera() {
    const nutritionVideo = document.getElementById('nutritionVideo');
    
    // Check if user has completed profile setup
    const userProfile = localStorage.getItem('userProfile');
    const hasCompletedSetup = localStorage.getItem('nutritionSetupComplete');
    
    // Launch wizard if profile is not set up or if it's the default profile
    if (!userProfile || !hasCompletedSetup) {
        // Import and launch wizard
        import('./nutritionWizard.js').then(({ NutritionWizard }) => {
            window.nutritionWizard = new NutritionWizard(
                document.getElementById('nutritionView'),
                nutritionAudioManager
            );
            window.nutritionWizard.init();
            
            // Don't permanently mark setup as complete - wizard will show on refresh
            // Just use the original close function without setting the flag
        });
    }
    
    // Update profile display
    updateProfileDisplay();
    
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
                // Set up citation listeners after initial render
                setTimeout(() => {
                    setupCitationListeners();
                }, 0);
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
            <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
                <button id="addFoodBtn" onclick="window.openAddFoodModal()" style="background: none; border: none; cursor: pointer; padding: 4px; border-radius: 50%; transition: background 0.2s;" onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='none'">
                    <svg style="width: 24px; height: 24px; color: #2196F3;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
            <div id="foodHistoryContainer" style="max-height: 400px; overflow-y: auto;">
                ${renderFoodHistoryItems()}
            </div>
        </div>
        ${foodHistory.length > 0 ? '<button class="nutrition-analyze-btn" onclick="window.clearNutritionHistory()">Clear History</button>' : ''}
    `;
}

// Helper function to render food history items with expandable explanations
function renderFoodHistoryItems() {
    if (foodHistory.length === 0) {
        return '<p style="color: #666;">No food history yet. Start by analyzing some food items!</p>';
    }
    
    return foodHistory.map((item, index) => {
        // Handle backward compatibility for items with old structure
        let displayText = item.text;
        let colorClass = item.colorClass || 'bg-gray-100 text-gray-800';
        let explanation = item.explanation || '';
        let citations = item.citations || [];
        
        // If item has old structure (name, healthRating, etc.), convert it
        if (!item.text && item.name) {
            const date = new Date(item.date);
            const formattedTime = date.toLocaleString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true 
            });
            displayText = `<strong>${formattedTime}:</strong> ${item.name}`;
            
            // Determine color based on health rating
            if (item.healthRating === 'Healthy') {
                colorClass = 'bg-green-100 text-green-800';
            } else if (item.healthRating === 'Unhealthy') {
                colorClass = 'bg-red-200 text-red-800';
            }
            
            // Combine health and safety summaries
            explanation = `Health: ${item.healthSummary || 'No health summary'} Safety: ${item.safetySummary || 'No safety summary'}`;
        }
        
        // Format the date for better readability
        const date = new Date(item.date);
        const dateFormatted = date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric'
        });
        const timeFormatted = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        // Extract just the food item text (remove bold tags from old format)
        const foodItemText = displayText.replace(/<strong>.*?<\/strong>\s*/, '');
        
        return `
            <div class="history-item-container" style="margin-bottom: 8px;">
                <div class="${colorClass} history-item" style="padding: 12px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <span class="food-history-date">${dateFormatted} • ${timeFormatted}</span>
                            <div class="food-history-item-text">${foodItemText}</div>
                        </div>
                        <div style="flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0,0,0,0.1); cursor: pointer; transition: background 0.2s; margin-left: 12px;" 
                             onclick="window.toggleNutritionExplanation(${index})"
                             onmouseover="this.style.background='rgba(0,0,0,0.2)'" 
                             onmouseout="this.style.background='rgba(0,0,0,0.1)'">
                            <svg style="width: 20px; height: 20px; color: #666;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>
                <div id="nutrition-explanation-${index}" class="explanation-content" style="padding: 12px; margin-top: 4px; border-radius: 8px; background: #f5f5f5; border: 1px solid #e0e0e0; display: none;">
                    <!-- Explanation will be inserted here when toggled -->
                </div>
            </div>
        `;
    }).join('');
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
                ${chatMessages.map(msg => {
                    // Process bot messages with citations
                    if (msg.type === 'bot' && msg.citations && msg.citations.length > 0) {
                        const processedText = addCitationTooltips(msg.text, msg.citations);
                        return `
                            <div class="nutrition-message ${msg.type} citation-text">
                                ${processedText}
                            </div>
                        `;
                    } else {
                        return `
                            <div class="nutrition-message ${msg.type}">
                                ${msg.text}
                            </div>
                        `;
                    }
                }).join('')}
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
        
        const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/function-food-recommendations', {
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
            
            // Add loading indicator message
            chatMessages.push({ 
                type: 'bot', 
                text: '<div class="loading-indicator">Verifying claim<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span></div>',
                isLoading: true 
            });
            
            // Update chat display
            updateNutritionChatDisplay();
            
            try {
                // Get user settings
                const userSettings = localStorage.getItem('userSettings') || 'General health-conscious individual';
                const userPreferences = localStorage.getItem('userPreferences') || 'No specific dietary restrictions';
                
                // Send to API
                const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/function-food-chat', {
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
                
                // Remove the loading message
                chatMessages = chatMessages.filter(msg => !msg.isLoading);
                
                // Add bot response with citations
                chatMessages.push({ 
                    type: 'bot', 
                    text: data.response,
                    citations: data.citations || []
                });
                
                // Update chat display
                updateNutritionChatDisplay();
                
                // Play response audio
                if (nutritionAudioManager) {
                    nutritionAudioManager.playStreamedAudio(data.response);
                }
            } catch (error) {
                console.error('Error in chat:', error);
                
                // Remove the loading message
                chatMessages = chatMessages.filter(msg => !msg.isLoading);
                
                // Add error message
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
        chatContainer.innerHTML = chatMessages.map(msg => {
            // Process bot messages with citations
            if (msg.type === 'bot' && msg.citations && msg.citations.length > 0) {
                const processedText = addCitationTooltips(msg.text, msg.citations);
                return `
                    <div class="nutrition-message ${msg.type} citation-text">
                        ${processedText}
                    </div>
                `;
            } else {
                return `
                    <div class="nutrition-message ${msg.type}">
                        ${msg.text}
                    </div>
                `;
            }
        }).join('');
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Set up citation listeners after DOM update
        setTimeout(() => {
            setupCitationListeners();
        }, 0);
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

// Toggle nutrition explanation
export function toggleNutritionExplanation(index) {
    const explanationDiv = document.getElementById(`nutrition-explanation-${index}`);
    const item = foodHistory[index];
    
    if (explanationDiv) {
        if (explanationDiv.style.display === 'none' || !explanationDiv.innerHTML) {
            // Format explanation with citations
            const formattedText = formatTextWithCitations(item.explanation, item.citations);
            explanationDiv.innerHTML = formattedText;
            explanationDiv.style.display = 'block';
            
            // Set up citation tooltips after DOM update
            setTimeout(() => {
                attachCitationTooltips(explanationDiv, item.citations);
            }, 0);
        } else {
            explanationDiv.style.display = 'none';
        }
    }
}

// Format text with citations (similar to original app)
function formatTextWithCitations(text, citations) {
    if (!citations || citations.length === 0) return text;
    
    let formattedText = text;
    
    // Replace citation markers [1], [2], etc. with styled spans
    citations.forEach(citation => {
        const citationRegex = new RegExp(`\\[${citation.id}\\]`, 'g');
        formattedText = formattedText.replace(citationRegex, 
            `<span class="citation-marker" data-citation-id="${citation.id}" style="color: #1976d2; font-weight: 600; cursor: pointer;">[${citation.id}]</span>`
        );
    });
    
    return formattedText;
}

// Attach citation tooltips
function attachCitationTooltips(containerElement, citations) {
    const citationMarkers = containerElement.querySelectorAll('.citation-marker');
    
    citationMarkers.forEach(marker => {
        const citationId = parseInt(marker.dataset.citationId);
        const citation = citations.find(c => c.id === citationId);
        
        if (citation) {
            // Create tooltip on hover/click
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Remove any existing tooltips
                document.querySelectorAll('.nutrition-citation-tooltip').forEach(t => t.remove());
                
                // Create new tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'nutrition-citation-tooltip';
                tooltip.style.cssText = `
                    position: absolute;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    max-width: 300px;
                    z-index: 1000;
                    font-size: 13px;
                    line-height: 1.5;
                `;
                
                // Build tooltip content with proper formatting
                let tooltipContent = `<div style="margin-bottom: 8px;"><strong>${citation.source}</strong></div>`;
                tooltipContent += `<div style="margin-bottom: 8px; font-style: italic; color: #555;">"${citation.context}"</div>`;
                
                if (citation.page) {
                    tooltipContent += `<div style="margin-bottom: 8px; color: #666; font-size: 12px;">${citation.page}</div>`;
                }
                
                // Add URL if available or determine based on source
                let url = citation.url;
                if (!url && citation.source) {
                    // Auto-determine URL based on source name
                    if (citation.source.includes('Dietary Guidelines')) {
                        url = 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf';
                    } else if (citation.source.includes('FDA') && citation.source.includes('Claim')) {
                        url = 'https://www.fda.gov/media/184535/download';
                    }
                }
                
                if (url) {
                    tooltipContent += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                        <a href="${url}" target="_blank" rel="noopener" style="color: #1976d2; text-decoration: none; font-size: 12px; display: inline-flex; align-items: center;">
                            View Source Document
                            <svg style="width: 12px; height: 12px; margin-left: 4px;" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
                            </svg>
                        </a>
                    </div>`;
                }
                
                tooltip.innerHTML = tooltipContent;
                document.body.appendChild(tooltip);
                
                // Position tooltip
                const rect = marker.getBoundingClientRect();
                tooltip.style.left = rect.left + 'px';
                tooltip.style.top = (rect.bottom + 5) + 'px';
                
                // Adjust if tooltip goes off screen
                const tooltipRect = tooltip.getBoundingClientRect();
                if (tooltipRect.right > window.innerWidth) {
                    tooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
                }
                if (tooltipRect.bottom > window.innerHeight) {
                    tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
                }
                
                // Remove tooltip on click outside
                setTimeout(() => {
                    document.addEventListener('click', function removeTooltip() {
                        tooltip.remove();
                        document.removeEventListener('click', removeTooltip);
                    });
                }, 0);
            });
        }
    });
}

// Open add food modal
export function openAddFoodModal() {
    // Create modal HTML
    const modalHtml = `
        <div id="nutritionAddFoodModal" style="position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
            <div style="background: white; border-radius: 12px; width: 90%; max-width: 500px; margin: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #e0e0e0;">
                    <h3 style="margin: 0; font-size: 20px; font-weight: 600;">Add Food Entry</h3>
                    <button onclick="window.closeAddFoodModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Time</label>
                        <input type="datetime-local" id="nutritionFoodTime" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Item Consumed</label>
                        <input type="text" id="nutritionFoodItem" placeholder="e.g., Grilled chicken salad" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;">
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; padding: 20px; background: #f5f5f5; border-top: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">
                    <button onclick="window.saveFoodEntry()" style="background: #1976d2; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 16px; cursor: pointer;">Save Entry</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    document.body.appendChild(modalDiv);
    
    // Set default date/time to now
    const now = new Date();
    const dateTimeLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('nutritionFoodTime').value = dateTimeLocal;
}

// Close add food modal
export function closeAddFoodModal() {
    const modal = document.getElementById('nutritionAddFoodModal');
    if (modal) {
        modal.parentElement.remove();
    }
}

// Save food entry
export async function saveFoodEntry() {
    const timeInput = document.getElementById('nutritionFoodTime').value;
    const itemInput = document.getElementById('nutritionFoodItem').value;
    
    if (!timeInput || !itemInput) {
        alert('Please fill out both time and item fields.');
        return;
    }
    
    // Close modal
    closeAddFoodModal();
    
    // Show loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'nutritionLoadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    loadingOverlay.innerHTML = `
        <div style="background: white; padding: 24px; border-radius: 12px; text-align: center;">
            <div class="loading-dots">
                <span>.</span><span>.</span><span>.</span>
            </div>
            <p style="margin-top: 16px;">Evaluating Food Health...</p>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    
    try {
        // Get user settings
        const userSettings = localStorage.getItem('userSettings') || 'General health-conscious individual';
        const userPreferences = localStorage.getItem('userPreferences') || 'No specific dietary restrictions';
        
        // Call health analysis endpoint
        const response = await fetch('https://us-central1-fda-genai-for-food.cloudfunctions.net/analyze-food-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: itemInput,
                user_settings: userSettings,
                user_preferences: userPreferences
            })
        });
        
        if (!response.ok) throw new Error('Failed to analyze food');
        
        const data = await response.json();
        
        // Format date
        const date = new Date(timeInput);
        const formattedTime = date.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        });
        
        // Determine color class based on rating
        let colorClass = 'bg-gray-100 text-gray-800';
        if (data.rating === 'Healthy') {
            colorClass = 'bg-green-100 text-green-800';
        } else if (data.rating === 'Moderate') {
            colorClass = 'bg-yellow-100 text-yellow-800';
        } else if (data.rating === 'Unhealthy') {
            colorClass = 'bg-red-200 text-red-800';
        }
        
        // Add to history (store just the food item text, date formatting happens on render)
        const newEntry = {
            text: itemInput,
            colorClass: colorClass,
            explanation: data.explanation || 'No explanation provided.',
            citations: data.citations || [],
            date: date.toISOString()
        };
        
        foodHistory.unshift(newEntry);
        localStorage.setItem('foodHistory', JSON.stringify(foodHistory));
        
        // Update UI
        const historyContent = document.getElementById('nutritionHistoryContent');
        if (historyContent) {
            historyContent.innerHTML = generateNutritionHistoryContent();
        }
        
    } catch (error) {
        console.error('Error analyzing food:', error);
        alert('Failed to analyze food item. Please try again.');
    } finally {
        // Remove loading overlay
        document.getElementById('nutritionLoadingOverlay')?.remove();
    }
}

// Get user profile data
export function getUserProfile() {
    const defaultProfile = {
        gender: 'Female',
        age: 35,
        heightFeet: 5,
        heightInches: 5,
        weight: 140,
        goals: 'Maintain my current weight and eat healthier in general',
        restrictions: 'Nut allergy!!!',
        preferences: 'Balance of different vegetables. Like meats, especially red meat'
    };
    
    const stored = localStorage.getItem('userProfile');
    return stored ? JSON.parse(stored) : defaultProfile;
}

// Update profile display
export function updateProfileDisplay() {
    const profile = getUserProfile();
    const nameElement = document.querySelector('.nutrition-profile-name');
    const detailsElement = document.querySelector('.nutrition-profile-details');
    
    if (nameElement) {
        nameElement.textContent = `${profile.gender}, ${profile.age}`;
    }
    if (detailsElement) {
        detailsElement.textContent = `${profile.heightFeet}'${profile.heightInches}", ${profile.weight} lbs`;
    }
}

// Open profile modal
export function openProfileModal() {
    const modal = document.getElementById('nutritionProfileModal');
    if (modal) {
        modal.classList.add('active');
        
        // Load current profile data into form
        const profile = getUserProfile();
        document.getElementById('profileGender').value = profile.gender;
        document.getElementById('profileAge').value = profile.age;
        document.getElementById('profileHeightFeet').value = profile.heightFeet;
        document.getElementById('profileHeightInches').value = profile.heightInches;
        document.getElementById('profileWeight').value = profile.weight;
        document.getElementById('profileGoals').value = profile.goals;
        document.getElementById('profileRestrictions').value = profile.restrictions;
        document.getElementById('profilePreferences').value = profile.preferences;
    }
}

// Close profile modal
export function closeProfileModal() {
    const modal = document.getElementById('nutritionProfileModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Save profile
export function saveProfile() {
    const profile = {
        gender: document.getElementById('profileGender').value,
        age: parseInt(document.getElementById('profileAge').value),
        heightFeet: parseInt(document.getElementById('profileHeightFeet').value),
        heightInches: parseInt(document.getElementById('profileHeightInches').value),
        weight: parseInt(document.getElementById('profileWeight').value),
        goals: document.getElementById('profileGoals').value,
        restrictions: document.getElementById('profileRestrictions').value,
        preferences: document.getElementById('profilePreferences').value
    };
    
    // Save to localStorage
    localStorage.setItem('userProfile', JSON.stringify(profile));
    
    // Update userSettings and userPreferences for API calls
    const userSettings = `I am ${profile.gender.toLowerCase()}, ${profile.age} years old. ${profile.heightFeet}'${profile.heightInches} and ${profile.weight} lbs. Goal is to ${profile.goals.toLowerCase()}`;
    const userPreferences = `${profile.restrictions} ${profile.preferences}`;
    
    localStorage.setItem('userSettings', userSettings);
    localStorage.setItem('userPreferences', userPreferences);
    
    // Update display
    updateProfileDisplay();
    
    // Close modal
    closeProfileModal();
    
    // Show success feedback
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        font-weight: 500;
        transition: opacity 0.3s ease;
    `;
    overlay.textContent = 'Profile saved successfully!';
    document.body.appendChild(overlay);
    
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => document.body.removeChild(overlay), 300);
    }, 2000);
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
    window.toggleNutritionExplanation = toggleNutritionExplanation;
    window.openAddFoodModal = openAddFoodModal;
    window.closeAddFoodModal = closeAddFoodModal;
    window.saveFoodEntry = saveFoodEntry;
    window.openProfileModal = openProfileModal;
    window.closeProfileModal = closeProfileModal;
    window.saveProfile = saveProfile;
    window.updateProfileDisplay = updateProfileDisplay;
}
