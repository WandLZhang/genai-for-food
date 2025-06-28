document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let foodHistoryData = [
        { 
            text: '<strong>Mon, Jun 9, 7:38 PM:</strong> Large pepperoni pizza with soda', 
            colorClass: 'bg-red-200 text-red-800',
            explanation: 'This meal is high in saturated fat and sodium, which can contribute to cardiovascular issues [1]. The soda is a source of empty calories and added sugars [2].',
            citations: [
                { id: 1, source: 'Dietary Guidelines for Americans', context: 'Limit saturated fat to less than 10 percent of calories per day.', page: 'Page 45' },
                { id: 2, source: 'Dietary Guidelines for Americans', context: 'Limit added sugars to less than 10 percent of calories per day.', page: 'Page 47' }
            ]
        },
        { 
            text: '<strong>Mon, Jun 9, 2:38 PM:</strong> Grilled chicken salad with mixed vegetables', 
            colorClass: 'bg-green-100 text-green-800',
            explanation: 'A balanced meal with lean protein, fiber, and vitamins. Grilled chicken is a healthier choice than fried [1].',
            citations: [
                { id: 1, source: 'Dietary Guidelines for Americans', context: 'Choose lean protein sources.', page: 'Page 42' }
            ]
        },
        { 
            text: '<strong>Mon, Jun 9, 10:38 AM:</strong> Chocolate chip cookies (3 pieces)', 
            colorClass: 'bg-yellow-100 text-yellow-800',
            explanation: 'Contains high amounts of added sugars and refined flour [1].',
            citations: [
                { id: 1, source: 'Dietary Guidelines for Americans', context: 'Limit foods high in added sugars.', page: 'Page 47' }
            ]
        },
        { 
            text: '<strong>Mon, Jun 9, 7:38 AM:</strong> Greek yogurt with berries and granola', 
            colorClass: 'bg-green-100 text-green-800',
            explanation: 'A nutrient-dense breakfast with protein, calcium, and antioxidants from berries [1]. Granola can be high in sugar, so portion control is important [2].',
            citations: [
                { id: 1, source: 'Dietary Guidelines for Americans', context: 'Choose nutrient-dense foods.', page: 'Page 31' },
                { id: 2, source: 'Dietary Guidelines for Americans', context: 'Be mindful of portion sizes for high-calorie foods.', page: 'Page 55' }
            ]
        },
    ];

    // Voice Setup State
    let voiceSetupState = {
        isActive: false,
        currentStep: 0,
        questions: [
            {
                text: "Let's start with basic information. What is your age and gender?",
                key: "basic_info",
                example: "For example: I am 34 years old and male"
            },
            {
                text: "Do you have any food allergies or intolerances? Please list them.",
                key: "allergies",
                example: "For example: I'm allergic to peanuts and lactose intolerant, or say 'none' if you don't have any"
            },
            {
                text: "Do you have any chronic health conditions or illnesses I should know about?",
                key: "health_conditions",
                example: "For example: I have diabetes and high blood pressure, or say 'none' if you don't have any"
            },
            {
                text: "What are your dietary preferences or restrictions?",
                key: "dietary_preferences",
                example: "For example: I'm vegetarian, or I follow a low-sodium diet, or say 'none' if you don't have any specific preferences"
            },
            {
                text: "What are your health and fitness goals?",
                key: "health_goals",
                example: "For example: I want to lose weight, build muscle, or maintain my current health"
            }
        ],
        answers: {},
        recognition: null,
        synthesis: null
    };

    // Speech Recognition and Synthesis Setup
    let speechRecognition = null;
    let speechSynthesis = window.speechSynthesis;
    
    if ('webkitSpeechRecognition' in window) {
        speechRecognition = new webkitSpeechRecognition();
    } else if ('SpeechRecognition' in window) {
        speechRecognition = new SpeechRecognition();
    }

    if (speechRecognition) {
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;
        speechRecognition.lang = 'en-US';
    }

    // Update the state section at the top of the file
    let recommendationsData = {
        "Breakfast": {
            "Name": "Berry & Almond Butter Oatmeal",
            "Description": "Cook 1/2 cup of rolled oats with 1 cup of water or unsweetened fortified soy milk until creamy. Stir in 1/2 cup of mixed berries (fresh or frozen). Top with 1 tablespoon of almond butter (ensure it's peanut-free) and a sprinkle of 1 teaspoon of chia seeds. This meal provides whole grains, fruit, protein, and healthy fats while being low in added sugars and sodium."
        },
        "Lunch": {
            "Name": "Mediterranean Chickpea & Veggie Quinoa Bowl",
            "Description": "Prepare 1/2 cup cooked quinoa or brown rice as a base. Roast 1.5 cups of mixed vegetables such as bell peppers, zucchini, and cherry tomatoes with 1 tablespoon of olive oil and dried herbs (like oregano and basil). Add 3/4 cup of cooked chickpeas and 1/4 cup of crumbled low-fat feta cheese. Dress with a simple lemon-tahini dressing (2 tbsp tahini, juice of 1/2 lemon, 1 tbsp water, salt to taste – use low sodium salt or limit). This meal is rich in vegetables, whole grains, and plant-based protein."
        },
        "Dinner": {
            "Name": "Hearty Lentil & Spinach Stew with Whole-Wheat Bread",
            "Description": "In a large pot, sauté 1 cup of diced carrots, 1/2 cup of diced celery, and 1/2 cup of chopped onion in 1 tablespoon of olive oil until softened. Add 1.5 cups of brown or green lentils, 4 cups of low-sodium vegetable broth, 1 cup of diced potatoes, and a bay leaf. Bring to a boil, then reduce heat and simmer until lentils are tender (about 25-30 minutes). Stir in 2 cups of fresh spinach until wilted. Season with black pepper and a pinch of salt (or salt-free seasoning). Serve with one slice of 100% whole-wheat crusty bread. This offers robust plant-based protein, diverse vegetables, and whole grains."
        },
        "Snack Idea 1": {
            "Name": "Greek Yogurt with Sliced Apple",
            "Description": "Combine 1 cup of plain, low-fat Greek yogurt with one medium sliced apple. This snack is a good source of dairy, fruit, and protein, with no added sugars or saturated fat."
        },
        "Snack Idea 2": {
            "Name": "Hummus & Veggie Sticks",
            "Description": "Serve 1/4 cup of plain hummus with 1 cup of carrot sticks and 1 cup of red bell pepper strips. This snack provides fiber, vitamins from the vegetables, and protein and healthy fats from the hummus. Ensure hummus is from a peanut-free facility if severe allergy concerns."
        }
    };

    // Add new state variables for storing fetched recommendation data
    let fetchedRecommendations = null;
    
    let recommendationDetailsData = "The recommended meal plan for this 34-year-old vegetarian male aligns with the FDA's 'Updated 'Healthy' Claim' and the Dietary Guidelines for Americans 2020-2025 by emphasizing nutrient-dense foods across all recommended food groups. Each meal incorporates a variety of vegetables and fruits, ensuring a broad spectrum of vitamins, minerals, and dietary fiber, crucial for overall health and chronic disease prevention. Whole grains are a cornerstone of the diet, providing complex carbohydrates and fiber, while diverse plant-based protein sources like lentils, chickpeas, eggs, and soy products are utilized to meet protein needs within a vegetarian framework. \n\nFurthermore, these meal choices strictly adhere to the dietary limits on saturated fat, sodium, and added sugars, as highlighted by the FDA guidelines. By focusing on fresh ingredients, homemade preparations, and naturally occurring flavors, the plan helps manage calorie intake to stay within the 2000 kcal/day goal. Critically, all recommendations meticulously avoid peanuts to accommodate the user's allergy, substituting with other healthy nut and seed options. This comprehensive approach promotes a balanced, safe, and enjoyable eating pattern that supports the user's fitness and long-term health objectives.";

    let userProfileData = "";

    let settingsData = [];

    let chatHistory = [];

    // --- TAB SWITCHING FUNCTIONALITY ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(targetTab) {
        // Remove active class from all buttons
        tabButtons.forEach(btn => {
            btn.classList.remove('bg-blue-100', 'text-blue-700', 'font-medium');
            btn.classList.add('text-gray-600');
        });

        // Hide all content
        tabContents.forEach(content => {
            content.classList.add('hidden');
        });

        // Activate clicked button
        const activeButton = document.getElementById(`tab-${targetTab}`);
        activeButton.classList.add('bg-blue-100', 'text-blue-700', 'font-medium');
        activeButton.classList.remove('text-gray-600');

        // Show corresponding content
        document.getElementById(`content-${targetTab}`).classList.remove('hidden');
    }

    // Add click listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.id.replace('tab-', '');
            switchTab(tabName);
        });
    });

    // Default to "Analyze a Food Item" tab
    switchTab('analyze');

    // --- DOM ELEMENTS ---
    const foodHistoryContainer = document.getElementById('foodHistoryContainer');
    const addFoodBtn = document.getElementById('addFoodBtn');
    const addFoodModal = document.getElementById('addFoodModal');
    const closeAddFoodModalBtn = document.getElementById('closeAddFoodModalBtn');
    const saveFoodBtn = document.getElementById('saveFoodBtn');
    const addFoodForm = document.getElementById('addFoodForm');

    const recommendationsContainer = document.getElementById('recommendationsContainer');
    const detailsBtn = document.getElementById('detailsBtn');
    const refreshRecommendationsBtn = document.getElementById('refreshRecommendationsBtn');
    const recommendationDetailsModal = document.getElementById('recommendationDetailsModal');
    const closeRecommendationDetailsModalBtn = document.getElementById('closeRecommendationDetailsModalBtn');
    const saveRecommendationDetailsBtn = document.getElementById('saveRecommendationDetailsBtn');
    const recommendationDetailsContent = document.getElementById('recommendationDetailsContent');

    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveAndCloseBtn = document.getElementById('saveAndCloseBtn');
    const addSettingBtn = document.getElementById('addSettingBtn');
    const modalSettingsList = document.getElementById('modalSettingsList');
    const userProfileTextarea = document.getElementById('userProfile');

    const cookingInstructionsModal = document.getElementById('cookingInstructionsModal');
    const closeCookingInstructionsModalBtn = document.getElementById('closeCookingInstructionsModalBtn');
    const cookingInstructionsTitle = document.getElementById('cookingInstructionsTitle');
    const cookingInstructionsContent = document.getElementById('cookingInstructionsContent');
    
    const fileInput = document.getElementById('fileInput');

    // --- FUNCTIONS ---

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Get the upload area in the analyze tab
        const uploadArea = document.querySelector('#content-analyze .upload-area');
        
        // Clear the upload area and set up the split layout with fixed height
        uploadArea.innerHTML = `
            <div class="flex h-full gap-4 w-full">
                <!-- Left side: Image preview -->
                <div class="w-1/2 flex flex-col">
                    <div class="flex-grow bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                        <img id="uploadedImage" src="" alt="Uploaded food" class="max-w-full max-h-full object-contain">
                    </div>
                    <button id="uploadNewImageBtn" class="mt-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors duration-200 font-medium">
                        Upload New Image
                    </button>
                </div>
                
                <!-- Right side: Analysis results -->
                <div class="w-1/2 flex flex-col h-full">
                    <div id="analysisResults" class="flex-grow bg-gray-50 rounded-lg p-4 overflow-y-auto max-h-full">
                        <div class="flex items-center justify-center h-full">
                            <div class="text-center">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-3"></div>
                                <p class="text-gray-600">Analyzing image...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Display the image
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('uploadedImage').src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Add event listener for new upload button
        document.getElementById('uploadNewImageBtn').addEventListener('click', () => {
            fileInput.value = '';
            fileInput.click();
        });

        // Prepare form data for the API call
        const formData = new FormData();
        formData.append('evidence_file', file);
        formData.append('user_settings', userProfileData);
        formData.append('user_preferences', settingsData.join('\n'));

        try {
            // Call the img_analysis endpoint
            const response = await fetch('http://localhost:5000/img_analysis', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ Image analysis received:', data);
            console.log('Health Citations:', data.healthCitations);
            console.log('Safety Citations:', data.safetyCitations);

            // Display the results with scrollable content
            const analysisResults = document.getElementById('analysisResults');
            analysisResults.innerHTML = `
                <div class="space-y-3 h-full">
                    <h4 class="font-semibold text-gray-700 mb-2 sticky top-0 bg-gray-50 pb-2">Analysis Results</h4>
                    <div class="prose prose-sm max-w-none overflow-y-auto">
                        ${formatAnalysisResults(data)}
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Error analyzing image:', error);
            
            // Display error message with more details
            const analysisResults = document.getElementById('analysisResults');
            let errorMessage = 'Unable to analyze the image.';
            let helpText = '';
            
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Cannot connect to the backend server.';
                helpText = 'Please ensure the backend server is running on http://localhost:5000';
            } else if (error.message.includes('404')) {
                errorMessage = 'Image analysis endpoint not found.';
                helpText = 'The backend server may be outdated or misconfigured.';
            } else if (error.message.includes('500')) {
                errorMessage = 'Server error during analysis.';
                helpText = 'This could be due to missing API keys or required files. Check the backend logs.';
            }
            
            analysisResults.innerHTML = `
                <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <p class="font-bold mb-2">Analysis Failed</p>
                    <p class="text-sm">${errorMessage}</p>
                    ${helpText ? `<p class="text-xs mt-2 text-red-600">${helpText}</p>` : ''}
                    <button onclick="location.reload()" class="mt-3 text-xs bg-red-200 hover:bg-red-300 px-3 py-1 rounded">
                        Refresh Page
                    </button>
                </div>
            `;
        }
    };

    // Helper function to format text with citations
    const formatTextWithCitations = (text, citations) => {
        // If no citations provided, create fallback citations based on text markers
        if (!citations || citations.length === 0) {
            citations = [];
            // Find all citation markers in the text
            const citationMatches = text.match(/\[(\d+)\]/g);
            if (citationMatches) {
                citationMatches.forEach(match => {
                    const id = parseInt(match.match(/\d+/)[0]);
                    if (!citations.find(c => c.id === id)) {
                        citations.push({
                            id: id,
                            source: "FDA/USDA Guidelines",
                            context: "Reference to official dietary and safety guidelines. Full citation details pending.",
                            page: ""
                        });
                    }
                });
            }
        }
        
        let formattedText = text;
        
        // Replace citation markers [1], [2], etc. with styled spans
        citations.forEach(citation => {
            const citationRegex = new RegExp(`\\[${citation.id}\\]`, 'g');
            formattedText = formattedText.replace(citationRegex, 
                `<span class="citation-marker" data-citation-id="${citation.id}">[${citation.id}]</span>`
            );
        });
        
        return formattedText;
    };

    // Helper function to create citation tooltip content
    const createCitationTooltipContent = (citation) => {
        // Determine the display title and URL
        let displaySource = citation.source;
        let sourceUrl = citation.url; // Default to citation's URL

        if (citation.source) {
            const lowerSource = citation.source.toLowerCase();
            // Normalize source string for robust matching by removing spaces and non-alphanumeric characters
            const normalizedSource = lowerSource.replace(/[^a-z0-9]/gi, '');

            if (lowerSource.includes('scogs') || lowerSource.includes('gras')) {
                displaySource = 'GRAS Substances';
                sourceUrl = 'https://www.fda.gov/food/food-ingredients-packaging/generally-recognized-safe-gras';
            } else if (lowerSource.includes('fda news release')) {
                sourceUrl = 'https://www.fda.gov/news-events/press-announcements/hhs-fda-phase-out-petroleum-based-synthetic-dyes-nations-food-supply';
            } else if (lowerSource.includes('dietary guidelines for americans')) {
                sourceUrl = 'https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf';
            } else if (normalizedSource.includes('updatedhealthyclaim')) {
                sourceUrl = 'https://www.fda.gov/media/184535/download';
            }
        }
        
        let content = `
            <div class="citation-tooltip-content">
                <div class="citation-tooltip-header">
                    <span class="citation-tooltip-source">${displaySource}</span>
                    ${citation.page ? `<span class="citation-tooltip-page">${citation.page}</span>` : ''}
                </div>
                <div class="citation-tooltip-context">"${citation.context}"</div>
                ${citation.substance ? `<div class="citation-tooltip-substance">Substance: ${citation.substance}</div>` : ''}
                ${(citation.cas_number && citation.cas_number !== 'N/A') ? `<div class="citation-tooltip-cas">CAS No: ${citation.cas_number}</div>` : ''}
                ${(citation.year_of_report && citation.year_of_report !== 'N/A') ? `<div class="citation-tooltip-year">Year of Report: ${citation.year_of_report}</div>` : ''}
                ${sourceUrl ? `<div class="citation-tooltip-link"><a href="${sourceUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 text-xs underline">View Source Document</a></div>` : ''}
            </div>
        `;
        return content;
    };

    // Helper function to attach citation tooltips
    const attachCitationTooltips = (containerElement, citations) => {
        const citationMarkers = containerElement.querySelectorAll('.citation-marker');
        
        console.log('Attaching tooltips for citations:', citations);
        console.log('Found citation markers:', citationMarkers.length);
        
        // Keep track of currently open tooltip
        let currentlyOpenTooltip = null;
        
        citationMarkers.forEach(marker => {
            const citationId = parseInt(marker.dataset.citationId);
            const citation = citations.find(c => c.id === citationId);
            
            console.log(`Citation ${citationId}:`, citation);
            
            if (citation) {
                // Create tooltip element
                const tooltip = document.createElement('div');
                tooltip.className = 'citation-tooltip';
                tooltip.innerHTML = createCitationTooltipContent(citation);
                tooltip.style.position = 'fixed';
                tooltip.style.display = 'none';
                tooltip.style.zIndex = '1000';
                document.body.appendChild(tooltip);
                
                // Add cursor pointer style to indicate clickable
                marker.style.cursor = 'pointer';
                
                // Track if this tooltip is open
                let isOpen = false;
                
                // Position and toggle tooltip on click
                marker.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent event bubbling
                    
                    // Close any other open tooltip
                    if (currentlyOpenTooltip && currentlyOpenTooltip !== tooltip) {
                        currentlyOpenTooltip.style.display = 'none';
                        currentlyOpenTooltip.isOpen = false;
                    }
                    
                    // Toggle this tooltip
                    if (isOpen) {
                        tooltip.style.display = 'none';
                        isOpen = false;
                        currentlyOpenTooltip = null;
                    } else {
                        const rect = marker.getBoundingClientRect();
                        
                        tooltip.style.display = 'block';
                        
                        // Get tooltip dimensions
                        const tooltipHeight = tooltip.offsetHeight;
                        const tooltipWidth = tooltip.offsetWidth;
                        
                        // Get viewport dimensions
                        const viewportWidth = window.innerWidth;
                        const viewportHeight = window.innerHeight;
                        
                        // Calculate available space in all directions
                        const spaceAbove = rect.top;
                        const spaceBelow = viewportHeight - rect.bottom;
                        const spaceLeft = rect.left + rect.width / 2;
                        const spaceRight = viewportWidth - (rect.left + rect.width / 2);
                        
                        // Minimum padding from viewport edges
                        const edgePadding = 15;
                        
                        // Determine vertical position
                        let top;
                        let showAbove = true; // Track position for arrow adjustment
                        
                        if (spaceAbove >= tooltipHeight + edgePadding && spaceAbove >= spaceBelow) {
                            // Prefer above if there's enough space
                            top = rect.top - tooltipHeight - 10;
                            showAbove = true;
                        } else if (spaceBelow >= tooltipHeight + edgePadding) {
                            // Show below if more space there
                            top = rect.bottom + 10;
                            showAbove = false;
                        } else {
                            // If neither has enough space, show where there's more room
                            if (spaceAbove > spaceBelow) {
                                top = Math.max(edgePadding, rect.top - tooltipHeight - 10);
                                showAbove = true;
                            } else {
                                top = rect.bottom + 10;
                                // Ensure it doesn't go off bottom
                                if (top + tooltipHeight > viewportHeight - edgePadding) {
                                    top = viewportHeight - tooltipHeight - edgePadding;
                                }
                                showAbove = false;
                            }
                        }
                        
                        // Determine horizontal position
                        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                        
                        // Adjust horizontal position to keep tooltip within viewport
                        if (left < edgePadding) {
                            left = edgePadding;
                        } else if (left + tooltipWidth > viewportWidth - edgePadding) {
                            left = viewportWidth - tooltipWidth - edgePadding;
                        }
                        
                        // Apply positions
                        tooltip.style.top = `${top}px`;
                        tooltip.style.left = `${left}px`;
                        
                        // Adjust tooltip arrow position based on where tooltip appears
                        if (showAbove) {
                            tooltip.classList.remove('tooltip-below');
                            tooltip.classList.add('tooltip-above');
                        } else {
                            tooltip.classList.remove('tooltip-above');
                            tooltip.classList.add('tooltip-below');
                        }
                        
                        // If tooltip is horizontally offset, adjust arrow position
                        const markerCenterX = rect.left + rect.width / 2;
                        const tooltipCenterX = left + tooltipWidth / 2;
                        const arrowOffset = markerCenterX - tooltipCenterX;
                        
                        // Set CSS variable for arrow position adjustment
                        tooltip.style.setProperty('--arrow-offset', `${arrowOffset}px`);
                        
                        isOpen = true;
                        currentlyOpenTooltip = tooltip;
                        tooltip.isOpen = true;
                    }
                });
                
                // Close tooltip when clicking anywhere else on the page
                document.addEventListener('click', (e) => {
                    if (isOpen && !marker.contains(e.target) && !tooltip.contains(e.target)) {
                        tooltip.style.display = 'none';
                        isOpen = false;
                        if (currentlyOpenTooltip === tooltip) {
                            currentlyOpenTooltip = null;
                        }
                    }
                });
                
                // Clean up tooltip when marker is removed from DOM
                const observer = new MutationObserver(() => {
                    if (!document.body.contains(marker)) {
                        tooltip.remove();
                        observer.disconnect();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                console.log(`No citation found for ID ${citationId}`);
            }
        });
    };

    // Helper function to format analysis results
    const formatAnalysisResults = (data) => {
        // Determine health and safety ratings
        let healthRating = data["healthRating"] || 'Unknown';
        let safetyRating = data["safetyRating"] || 'Unknown';
        let healthSummary = data["healthSummary"] || "No health summary provided.";
        let safetySummary = data["safetySummary"] || "No safety summary provided.";
        let healthCitations = data["healthCitations"] || [];
        let safetyCitations = data["safetyCitations"] || [];
        
        // Create rating boxes HTML
        const ratingsHTML = `
            <div class="rating-boxes grid grid-cols-2 gap-3 mb-4">
                <!-- Health Rating Box -->
                <div id="healthRatingBox" class="rating-box ${healthRating === 'Healthy' ? 'bg-green-100 border-green-400' : healthRating === 'Unhealthy' ? 'bg-red-100 border-red-400' : 'bg-gray-100 border-gray-400'} border-2 rounded-lg p-3 text-center transform transition-all duration-200 hover:scale-105 cursor-pointer">
                    <div class="rating-icon mb-1">
                        ${healthRating === 'Healthy' ? 
                            '<svg class="w-8 h-8 mx-auto text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>' : 
                          healthRating === 'Unhealthy' ? 
                            '<svg class="w-8 h-8 mx-auto text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>' :
                            '<svg class="w-8 h-8 mx-auto text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"></path></svg>'}
                    </div>
                    <div class="rating-label text-xs font-semibold text-gray-600 uppercase tracking-wide">Health Rating</div>
                    <div class="rating-value text-lg font-bold ${healthRating === 'Healthy' ? 'text-green-700' : healthRating === 'Unhealthy' ? 'text-red-700' : 'text-gray-700'}">${healthRating}</div>
                </div>
                
                <!-- Safety Rating Box -->
                <div id="safetyRatingBox" class="rating-box ${safetyRating === 'Safe' ? 'bg-blue-100 border-blue-400' : safetyRating === 'Unsafe' ? 'bg-orange-100 border-orange-400' : 'bg-gray-100 border-gray-400'} border-2 rounded-lg p-3 text-center transform transition-all duration-200 hover:scale-105 cursor-pointer">
                    <div class="rating-icon mb-1">
                        ${safetyRating === 'Safe' ? 
                            '<svg class="w-8 h-8 mx-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>' : 
                          safetyRating === 'Unsafe' ? 
                            '<svg class="w-8 h-8 mx-auto text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>' :
                            '<svg class="w-8 h-8 mx-auto text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"></path></svg>'}
                    </div>
                    <div class="rating-label text-xs font-semibold text-gray-600 uppercase tracking-wide">Safety Rating</div>
                    <div class="rating-value text-lg font-bold ${safetyRating === 'Safe' ? 'text-blue-700' : safetyRating === 'Unsafe' ? 'text-orange-700' : 'text-gray-700'}">${safetyRating}</div>
                </div>
            </div>
        `;
        
        // Format summaries with citations
        const formattedHealthSummary = formatTextWithCitations(healthSummary, healthCitations);
        const formattedSafetySummary = formatTextWithCitations(safetySummary, safetyCitations);
        
        const fullHTML = ratingsHTML + `
            <h4 class="font-semibold text-gray-700 mt-4 mb-2">Health Summary</h4>
            <div id="healthSummaryContainer" class="text-gray-700 whitespace-pre-wrap leading-relaxed">${formattedHealthSummary}</div>
            <h4 class="font-semibold text-gray-700 mt-4 mb-2">Safety Summary</h4>
            <div id="safetySummaryContainer" class="text-gray-700 whitespace-pre-wrap leading-relaxed">${formattedSafetySummary}</div>
        `;

        // Use a timeout to ensure the DOM is updated before adding event listeners
        setTimeout(() => {
            const healthBox = document.getElementById('healthRatingBox');
            const safetyBox = document.getElementById('safetyRatingBox');
            const healthSummaryContainer = document.getElementById('healthSummaryContainer');
            const safetySummaryContainer = document.getElementById('safetySummaryContainer');

            if (healthBox) {
                healthBox.addEventListener('click', () => {
                    window.open('https://www.dietaryguidelines.gov/', '_blank');
                });
            }

            if (safetyBox) {
                safetyBox.addEventListener('click', () => {
                    window.open('https://www.fda.gov/food/food-ingredients-packaging/generally-recognized-safe-gras', '_blank');
                });
            }
            
            // Attach citation tooltips
            if (healthSummaryContainer && healthCitations.length > 0) {
                attachCitationTooltips(healthSummaryContainer, healthCitations);
            }
            if (safetySummaryContainer && safetyCitations.length > 0) {
                attachCitationTooltips(safetySummaryContainer, safetyCitations);
            }
        }, 0);

        return fullHTML;
    };

    // Add the event listener for file input
    fileInput.addEventListener('change', handleImageUpload);

    const openCookingInstructions = (name, description) => {
        cookingInstructionsTitle.textContent = name;
        cookingInstructionsContent.textContent = description;
        cookingInstructionsModal.classList.remove('hidden');
    };

    const closeCookingInstructions = () => {
        cookingInstructionsModal.classList.add('hidden');
    };

    const renderFoodHistory = () => {
        foodHistoryContainer.innerHTML = '';
        foodHistoryData.forEach((item, index) => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'history-item-container mb-2';

            const mainDiv = document.createElement('div');
            mainDiv.className = `history-item p-3 rounded-lg ${item.colorClass} flex justify-between items-center`;
            
            const textSpan = document.createElement('span');
            textSpan.innerHTML = item.text;
            
            const infoIconContainer = document.createElement('div');
            infoIconContainer.className = 'flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 cursor-pointer transition-colors duration-200';
            infoIconContainer.title = 'Click for explanation';
            
            const infoIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            infoIcon.setAttribute('class', 'w-5 h-5 text-gray-600');
            infoIcon.setAttribute('fill', 'none');
            infoIcon.setAttribute('viewBox', '0 0 24 24');
            infoIcon.setAttribute('stroke', 'currentColor');
            infoIcon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            `;
            
            infoIconContainer.appendChild(infoIcon);

            infoIconContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleExplanation(index);
            });

            mainDiv.appendChild(textSpan);
            mainDiv.appendChild(infoIconContainer);
            
            const explanationDiv = document.createElement('div');
            explanationDiv.id = `explanation-${index}`;
            explanationDiv.className = 'explanation-content p-3 mt-1 rounded-lg bg-gray-50 border border-gray-200 hidden';
            
            itemContainer.appendChild(mainDiv);
            itemContainer.appendChild(explanationDiv);
            foodHistoryContainer.appendChild(itemContainer);
        });
    };

    const toggleExplanation = (index) => {
        const explanationDiv = document.getElementById(`explanation-${index}`);
        const item = foodHistoryData[index];

        if (explanationDiv.classList.contains('hidden')) {
            const formattedText = formatTextWithCitations(item.explanation, item.citations);
            explanationDiv.innerHTML = formattedText;
            attachCitationTooltips(explanationDiv, item.citations);
            explanationDiv.classList.remove('hidden');
        } else {
            explanationDiv.classList.add('hidden');
            explanationDiv.innerHTML = '';
        }
    };
    
    const openAddFoodModal = () => {
        addFoodForm.reset();
        
        // Set default date to today
        const foodTimeInput = document.getElementById('foodTime');
        if (foodTimeInput) {
            const now = new Date();
            // Format as datetime-local input value (YYYY-MM-DDTHH:MM)
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            
            foodTimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        
        addFoodModal.classList.remove('hidden');
    };

    const closeAddFoodModal = () => {
        addFoodModal.classList.add('hidden');
    };

    const saveFoodEntry = async () => {
        const timeInput = document.getElementById('foodTime').value;
        const itemInput = document.getElementById('foodItem').value;

        if (!timeInput || !itemInput) {
            console.error('Please fill out both time and item fields.');
            return;
        }

        // Show loading overlay with custom message
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingText = loadingOverlay.querySelector('p');
        const originalText = loadingText.textContent;
        loadingText.textContent = 'Evaluating Food Health';
        loadingOverlay.classList.remove('hidden');

        const date = new Date(timeInput);
        const formattedTime = date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

        // Default color class
        let colorClass = 'bg-green-100 text-green-800';
        let healthData = {};

        try {
            // Get current user settings
            const user_settings = userProfileData;
            
            // Get current user preferences from settingsData
            const user_preferences = settingsData.join('\n');

            const description = itemInput;

            console.log("Sending health check data:", { user_settings, user_preferences, description });

            // Call health endpoint to determine color
            const response = await fetch('http://localhost:5000/health', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_settings,
                    user_preferences,
                    description
                }),
            });

            if (response.ok) {
                healthData = await response.json();
                console.log('✅ Health response received:', healthData);
                
                // Determine color based on health response
                if (healthData.rating === 'Healthy' || healthData.score >= 7) {
                    colorClass = 'bg-green-100 text-green-800';
                } else if (healthData.rating === 'Moderate' || (healthData.score >= 4 && healthData.score < 7)) {
                    colorClass = 'bg-yellow-100 text-yellow-800';
                } else if (healthData.rating === 'Unhealthy' || healthData.score < 4) {
                    colorClass = 'bg-red-200 text-red-800';
                } else {
                    colorClass = 'bg-gray-100 text-gray-800';
                }
                
                // Alternative: if API returns color directly
                if (healthData.color) {
                    switch(healthData.color.toLowerCase()) {
                        case 'green':
                            colorClass = 'bg-green-100 text-green-800';
                            break;
                        case 'yellow':
                            colorClass = 'bg-yellow-100 text-yellow-800';
                            break;
                        case 'red':
                            colorClass = 'bg-red-200 text-red-800';
                            break;
                        default:
                            colorClass = 'bg-gray-100 text-gray-800';
                    }
                }
            } else {
                console.error('Health check failed, using default green color');
            }
        } catch (error) {
            console.error('❌ Error checking health:', error);
        } finally {
            // Hide loading overlay and restore original text
            loadingText.textContent = originalText;
            loadingOverlay.classList.add('hidden');
        }

        const newEntry = {
            text: `<strong>${formattedTime}:</strong> ${itemInput}`,
            colorClass: colorClass,
            explanation: healthData.explanation || 'No explanation provided.',
            citations: healthData.citations || []
        };
        
        foodHistoryData.unshift(newEntry);
        renderFoodHistory();
        closeAddFoodModal();
    };

    const renderDashboardRecommendations = () => {
        recommendationsContainer.innerHTML = '';
        
        const dataToRender = fetchedRecommendations || recommendationsData;
        
        Object.entries(dataToRender).forEach(([key, value]) => {
            if (key !== 'Summary' && value.Name) {
                const div = document.createElement('div');
                div.className = 'recommendation-item p-3 mb-2 rounded-lg bg-blue-100 border-l-4 border-blue-500 cursor-pointer hover:bg-blue-200 transition-colors';
                
                // Format the display text based on whether it's fetched data or initial data
                let displayText = '';
                if (fetchedRecommendations) {
                    displayText = `<strong>${key}:</strong> ${value.Name}`;
                } else {
                    // For initial data, use the key as the label
                    displayText = `<strong>${key}:</strong> ${value.Name}`;
                }
                
                div.innerHTML = displayText;
                div.onclick = () => openCookingInstructions(value.Name, value.Description);
                recommendationsContainer.appendChild(div);
            }
        });
    };

    const fetchRecommendations = async () => {
        console.log("Fetching new recommendations...");
        
        // Show loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.classList.remove('hidden');
        
        try {
            // Use the current values from the state variables
            const user_settings = userProfileData;
            const user_preferences = settingsData.join('\n');

            console.log("Sending data:", { user_settings, user_preferences });

            // Send data to the backend endpoint
            const response = await fetch('http://localhost:5000/recommendations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_settings,
                    user_preferences,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ Recommendations received:', data);
            
            fetchedRecommendations = data;
            
            if (data['Summary']) {
                recommendationDetailsData = data['Summary'];
            }
            
            renderDashboardRecommendations();

        } catch (error) {
            console.error('❌ Error fetching recommendations:', error);
            // Test data fallback...
            fetchedRecommendations = {
                "Breakfast": {
                    "Name": "Berry Almond Overnight Oats with Fortified Soy Milk",
                    "Description": "In a jar or container, combine ½ cup rolled oats, 1 cup unsweetened fortified soy milk, ½ cup mixed berries (fresh or frozen), and 1 tablespoon sliced almonds. Stir well, cover, and refrigerate overnight. In the morning, add a very small drizzle of maple syrup or a pinch of cinnamon for flavor if desired."
                },
                "Lunch": {
                    "Name": "Mediterranean Lentil & Veggie Power Bowl",
                    "Description": "In a bowl, combine 1 cup cooked brown rice. Add ½ cup cooked lentils, 1 cup chopped romaine lettuce, ½ cup diced cucumbers, and ¼ cup diced tomatoes. Dress with 1 tablespoon olive oil and a squeeze of fresh lemon juice. Top with 2 tablespoons crumbled low-fat feta cheese."
                },
                "Dinner": {
                    "Name": "Tofu and Mixed Vegetable Stir-fry with Brown Rice",
                    "Description": "Press 4 ounces of firm or extra-firm tofu to remove excess water, then cut into cubes. Heat 1 tablespoon of olive oil in a large wok or skillet over medium-high heat. Add tofu and stir-fry until lightly browned. Add 2 cups of mixed vegetables (e.g., broccoli florets, sliced bell peppers, shredded carrots, snap peas) and stir-fry until tender-crisp. Season with 1-2 tablespoons of low-sodium tamari or soy sauce, grated ginger, and minced garlic to taste. Serve immediately over 1 cup of cooked brown rice."
                },
                "Snack Idea 1": {
                    "Name": "Apple Slices with Sunflower Seed Butter",
                    "Description": "Slice 1 medium apple. Serve with 2 tablespoons of natural sunflower seed butter (ensure no added sugars or hydrogenated oils and confirm peanut-free)."
                },
                "Snack Idea 2": {
                    "Name": "Plain Greek Yogurt with Walnuts",
                    "Description": "Combine 1 cup plain low-fat Greek yogurt with ¼ cup walnuts. No added sugar is recommended for this snack."
                },
                "Summary": "Generated description of why this is good"
            };
            
            if (fetchedRecommendations['Summary']) {
                recommendationDetailsData = fetchedRecommendations['Summary'];
            }
            
            renderDashboardRecommendations();
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    };

    const openRecommendationDetailsModal = () => {
        const recommendationDetailsContent = document.getElementById('recommendationDetailsContent');
        recommendationDetailsContent.textContent = recommendationDetailsData;
        recommendationDetailsModal.classList.remove('hidden');
    };

    const closeRecommendationDetailsModal = () => {
        const recommendationDetailsContent = document.getElementById('recommendationDetailsContent');
        recommendationDetailsData = recommendationDetailsContent.textContent;
        console.log("Updated Recommendation Details:", recommendationDetailsData);
        recommendationDetailsModal.classList.add('hidden');
    };

    const renderModalList = () => {
        modalSettingsList.innerHTML = '';
        settingsData.forEach((setting, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex items-center space-x-2';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = setting;
            input.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'flex-shrink-0 h-8 w-8 text-lg text-red-500 hover:bg-red-100 rounded-full focus:outline-none';
            deleteBtn.onclick = () => deleteSettingItem(index);
            itemDiv.appendChild(input);
            itemDiv.appendChild(deleteBtn);
            modalSettingsList.appendChild(itemDiv);
        });
    };
    
    const openModal = () => {
        userProfileTextarea.value = userProfileData;
        renderModalList();
        settingsModal.classList.remove('hidden');
    };

    const closeModalAndSave = () => {
        // Save user profile
        userProfileData = userProfileTextarea.value;
        console.log("Updated User Profile:", userProfileData);

        // Save all settings from the modal inputs
        const inputs = modalSettingsList.querySelectorAll('input[type="text"]');
        settingsData = Array.from(inputs).map(input => input.value).filter(value => value.trim() !== '');
        console.log("Updated Settings:", settingsData);
        
        settingsModal.classList.add('hidden');
    };
    
    const deleteSettingItem = (index) => {
        settingsData.splice(index, 1);
        renderModalList();
        console.log("Settings after deletion:", settingsData);
    };

    const addSettingItem = () => {
        settingsData.push('New Setting: Enter value');
        renderModalList();
        modalSettingsList.scrollTop = modalSettingsList.scrollHeight;
        
        // Focus on the new input
        setTimeout(() => {
            const inputs = modalSettingsList.querySelectorAll('input[type="text"]');
            if (inputs.length > 0) {
                inputs[inputs.length - 1].focus();
                inputs[inputs.length - 1].select();
            }
        }, 100);
    };

    // Chat functions
    const handleEnter = (event) => {
        if (event.key === 'Enter') sendMessage();
    };

    const sendMessage = async () => {
        const input = document.getElementById('chatInput');
        const chatMessages = document.getElementById('chatMessages');
        const chatLoadingOverlay = document.getElementById('chatLoadingOverlay');
        
        if (!input.value.trim()) return;
        
        const userMessage = input.value.trim();
        
        // Add user message to chat history
        chatHistory.push(`User: ${userMessage}`);
        
        // Display user message on the right
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'flex justify-end mb-4';
        userMessageDiv.innerHTML = `
            <div class="bg-blue-500 text-white p-3 rounded-lg max-w-xs lg:max-w-md">
                ${userMessage}
            </div>
        `;
        chatMessages.appendChild(userMessageDiv);
        
        // Clear input
        input.value = '';
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Show chat loading overlay
        chatLoadingOverlay.classList.remove('hidden');
        
        try {
            // Use the current state variables
            const user_settings = userProfileData;
            const user_preferences = settingsData.join('\n');
            const chat_history = chatHistory.join('\n');
            const query = userMessage;
            
            console.log("Sending chat data:", { user_settings, user_preferences, chat_history, query });
            
            // Call the chat endpoint
            const response = await fetch('http://localhost:5000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_settings,
                    user_preferences,
                    chat_history,
                    query
                }),
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ Chat response received:', data);
            
            const botResponseText = data.response || "Sorry, I couldn't find a response.";
            const citations = data.citations || [];
            
            // Add bot response to chat history
            chatHistory.push(`Bot: ${botResponseText}`);
            
            // Format the response with citation markers
            const formattedResponse = formatTextWithCitations(botResponseText, citations);
            
            // Display bot message on the left
            const botMessageDiv = document.createElement('div');
            botMessageDiv.className = 'flex justify-start mb-4';
            botMessageDiv.innerHTML = `
                <div class="bg-gray-200 text-gray-800 p-3 rounded-lg max-w-xs lg:max-w-md prose prose-sm max-w-none">
                    ${formattedResponse}
                </div>
            `;
            chatMessages.appendChild(botMessageDiv);
            
            // Attach tooltips to the new message
            if (citations.length > 0) {
                // Use the inner div as the container for tooltip attachment
                const messageContentDiv = botMessageDiv.querySelector('.prose');
                attachCitationTooltips(messageContentDiv, citations);
            }
            
        } catch (error) {
            console.error('❌ Error sending message:', error);
            
            // Display error message
            const errorMessageDiv = document.createElement('div');
            errorMessageDiv.className = 'flex justify-start mb-4';
            errorMessageDiv.innerHTML = `
                <div class="bg-red-200 text-red-800 p-3 rounded-lg max-w-xs lg:max-w-md">
                    Sorry, I'm having trouble connecting right now. Please try again later.
                </div>
            `;
            chatMessages.appendChild(errorMessageDiv);
            
            chatHistory.push(`Bot: Sorry, I'm having trouble connecting right now. Please try again later.`);
        } finally {
            chatLoadingOverlay.classList.add('hidden');
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    };

    const openCamera = () => {
        document.getElementById('fileInput').click();
    };

    // Voice Setup Functions
    const speakText = async (text) => {
        try {
            // Call our backend Text-to-Speech endpoint
            const response = await fetch('http://localhost:5000/text-to-speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Text-to-Speech API error:', errorData);
                // Fallback to browser's native speech synthesis
                speakTextNative(text);
                return;
            }

            const data = await response.json();
            const audioContent = data.audioContent;
            
            if (audioContent) {
                // Decode base64 audio and play it
                const audioSource = `data:audio/mp3;base64,${audioContent}`;
                const audio = new Audio(audioSource);
                
                // Add event listeners for better error handling
                audio.addEventListener('error', (e) => {
                    console.error('Audio playback error:', e);
                    // Fallback to native speech synthesis
                    speakTextNative(text);
                });
                
                audio.addEventListener('canplaythrough', () => {
                    audio.play().catch((e) => {
                        console.error('Failed to play audio:', e);
                        speakTextNative(text);
                    });
                });
                
                audio.load();
            } else {
                console.error('No audio content received');
                speakTextNative(text);
            }

        } catch (error) {
            console.error('Error with Text-to-Speech:', error);
            // Fallback to browser's native speech synthesis on error
            speakTextNative(text);
        }
    };

    // Native browser speech synthesis as a fallback
    const speakTextNative = (text) => {
        if (speechSynthesis && speechSynthesis.speak) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.8;
            utterance.pitch = 1;
            utterance.volume = 0.8;
            speechSynthesis.speak(utterance);
        }
    };

    const updateVoiceStatus = (status, isListening = false) => {
        const voiceIndicator = document.getElementById('voiceIndicator');
        const voiceStatusText = document.getElementById('voiceStatusText');
        
        if (voiceIndicator && voiceStatusText) {
            voiceStatusText.textContent = status;
            
            if (isListening) {
                voiceIndicator.className = 'w-3 h-3 rounded-full bg-green-400 animate-pulse';
            } else {
                voiceIndicator.className = 'w-3 h-3 rounded-full bg-gray-400';
            }
        }
    };

    const updateProgress = () => {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const completeBtn = document.getElementById('completeVoiceSetupBtn');
        
        if (progressBar && progressText) {
            const progress = (voiceSetupState.currentStep) / voiceSetupState.questions.length * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${voiceSetupState.currentStep}/${voiceSetupState.questions.length}`;
            
            if (completeBtn) {
                completeBtn.disabled = voiceSetupState.currentStep < voiceSetupState.questions.length;
            }
        }
    };

    const updateCollectedInfo = () => {
        const infoList = document.getElementById('infoList');
        if (infoList) {
            if (Object.keys(voiceSetupState.answers).length === 0) {
                infoList.innerHTML = '<p class="text-gray-500 italic">Information will appear here as you answer questions...</p>';
            } else {
                let html = '';
                for (const [key, value] of Object.entries(voiceSetupState.answers)) {
                    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                    html += `
                        <div class="p-2 bg-white rounded border-l-4 border-green-500">
                            <strong class="text-green-700">${formattedKey}:</strong>
                            <span class="text-gray-700">${value}</span>
                        </div>
                    `;
                }
                infoList.innerHTML = html;
            }
        }
    };

    const showCurrentQuestion = () => {
        const currentQuestion = document.getElementById('currentQuestion');
        if (currentQuestion && voiceSetupState.currentStep < voiceSetupState.questions.length) {
            const question = voiceSetupState.questions[voiceSetupState.currentStep];
            currentQuestion.innerHTML = `
                ${question.text}<br>
                <small class="text-blue-600 italic">${question.example}</small>
            `;
        }
    };

    const processAnswer = (answer) => {
        if (voiceSetupState.currentStep < voiceSetupState.questions.length) {
            const question = voiceSetupState.questions[voiceSetupState.currentStep];
            voiceSetupState.answers[question.key] = answer;
            voiceSetupState.currentStep++;
            
            updateProgress();
            updateCollectedInfo();
            
            if (voiceSetupState.currentStep < voiceSetupState.questions.length) {
                setTimeout(() => {
                    showCurrentQuestion();
                    const nextQuestion = voiceSetupState.questions[voiceSetupState.currentStep];
                    speakText(nextQuestion.text + " " + nextQuestion.example);
                }, 1000);
            } else {
                // All questions completed
                document.getElementById('currentQuestion').textContent = "Great! You've completed all the questions. Click 'Complete Setup' to save your health profile.";
                speakText("Great! You've completed all the questions. Click Complete Setup to save your health profile.");
                stopVoiceRecognition();
            }
        }
    };

    const startVoiceRecognition = () => {
        if (!speechRecognition) {
            alert('Voice recognition is not supported in your browser. Please use the manual input option.');
            document.getElementById('manualInput').classList.remove('hidden');
            return;
        }

        voiceSetupState.isActive = true;
        updateVoiceStatus('Listening...', true);
        
        document.getElementById('startVoiceBtn').classList.add('hidden');
        document.getElementById('stopVoiceBtn').classList.remove('hidden');
        document.getElementById('manualInput').classList.remove('hidden');

        speechRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            console.log('Voice input received:', transcript);
            
            updateVoiceStatus('Processing...', false);
            processAnswer(transcript);
            
            // Continue listening if not finished
            if (voiceSetupState.currentStep < voiceSetupState.questions.length) {
                setTimeout(() => {
                    if (voiceSetupState.isActive) {
                        updateVoiceStatus('Listening...', true);
                        speechRecognition.start();
                    }
                }, 2000);
            }
        };

        speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            updateVoiceStatus('Error occurred, please try again', false);
            
            setTimeout(() => {
                if (voiceSetupState.isActive && voiceSetupState.currentStep < voiceSetupState.questions.length) {
                    updateVoiceStatus('Listening...', true);
                    speechRecognition.start();
                }
            }, 2000);
        };

        speechRecognition.onend = () => {
            if (voiceSetupState.isActive && voiceSetupState.currentStep < voiceSetupState.questions.length) {
                setTimeout(() => {
                    speechRecognition.start();
                }, 500);
            }
        };

        speechRecognition.start();
    };

    const stopVoiceRecognition = () => {
        voiceSetupState.isActive = false;
        
        if (speechRecognition) {
            speechRecognition.stop();
        }
        
        updateVoiceStatus('Voice setup paused', false);
        
        document.getElementById('startVoiceBtn').classList.remove('hidden');
        document.getElementById('stopVoiceBtn').classList.add('hidden');
    };

    const openVoiceSetupModal = () => {
        // Reset state
        voiceSetupState.currentStep = 0;
        voiceSetupState.answers = {};
        voiceSetupState.isActive = false;
        
        // Update UI
        updateProgress();
        updateCollectedInfo();
        showCurrentQuestion();
        updateVoiceStatus('Voice assistant ready', false);
        
        // Reset buttons
        document.getElementById('startVoiceBtn').classList.remove('hidden');
        document.getElementById('stopVoiceBtn').classList.add('hidden');
        document.getElementById('manualInput').classList.add('hidden');
        
        // Clear manual input
        document.getElementById('manualAnswer').value = '';
        
        document.getElementById('voiceSetupModal').classList.remove('hidden');
        
        // Welcome speech
        speakText('Welcome to voice health setup! I will ask you 5 questions to create your personalized health profile. Click Start Voice Setup when you are ready.');
    };

    const closeVoiceSetupModal = () => {
        stopVoiceRecognition();
        speechSynthesis.cancel();
        document.getElementById('voiceSetupModal').classList.add('hidden');
    };

    const completeVoiceSetup = () => {
        // Update user profile and settings based on collected answers
        let profileText = '';
        let newSettings = [];
        
        if (voiceSetupState.answers.basic_info) {
            profileText += voiceSetupState.answers.basic_info + '. ';
        }
        
        if (voiceSetupState.answers.health_goals) {
            newSettings.push('Health goals: ' + voiceSetupState.answers.health_goals);
        }
        
        if (voiceSetupState.answers.allergies && voiceSetupState.answers.allergies.toLowerCase() !== 'none') {
            newSettings.push('Allergies: ' + voiceSetupState.answers.allergies);
        }
        
        if (voiceSetupState.answers.health_conditions && voiceSetupState.answers.health_conditions.toLowerCase() !== 'none') {
            newSettings.push('Health Conditions: ' + voiceSetupState.answers.health_conditions);
        }
        
        if (voiceSetupState.answers.dietary_preferences && voiceSetupState.answers.dietary_preferences.toLowerCase() !== 'none') {
            newSettings.push('Dietary Preferences: ' + voiceSetupState.answers.dietary_preferences);
        }
        
        // Update global state
        userProfileData = profileText.trim();
        settingsData = [...settingsData, ...newSettings];
        
        console.log('Voice setup completed!');
        console.log('Updated Profile:', userProfileData);
        console.log('Updated Settings:', settingsData);
        
        speakText('Voice setup completed successfully! Your health profile has been saved.');
        
        closeVoiceSetupModal();
        
        // Show success message
        setTimeout(() => {
            alert('Voice setup completed! Your health profile has been updated. You can now get personalized food recommendations.');
        }, 1000);
    };

    const submitManualAnswer = () => {
        const manualAnswer = document.getElementById('manualAnswer');
        if (manualAnswer.value.trim()) {
            processAnswer(manualAnswer.value.trim());
            manualAnswer.value = '';
        }
    };

    // Voice Setup DOM Elements
    const voiceSetupBtn = document.getElementById('voiceSetupBtn');
    const voiceSetupModal = document.getElementById('voiceSetupModal');
    const closeVoiceSetupModalBtn = document.getElementById('closeVoiceSetupModalBtn');
    const startVoiceBtn = document.getElementById('startVoiceBtn');
    const stopVoiceBtn = document.getElementById('stopVoiceBtn');
    const completeVoiceSetupBtn = document.getElementById('completeVoiceSetupBtn');
    const skipVoiceSetupBtn = document.getElementById('skipVoiceSetupBtn');
    const submitManualBtn = document.getElementById('submitManualBtn');
    const manualAnswer = document.getElementById('manualAnswer');

    // Make functions available globally for onclick handlers
    window.handleEnter = handleEnter;
    window.sendMessage = sendMessage;
    window.openCamera = openCamera;

    // --- EVENT LISTENERS ---
    addFoodBtn.addEventListener('click', openAddFoodModal);
    closeAddFoodModalBtn.addEventListener('click', closeAddFoodModal);
    saveFoodBtn.addEventListener('click', saveFoodEntry);

    closeCookingInstructionsModalBtn.addEventListener('click', closeCookingInstructions);
    cookingInstructionsModal.addEventListener('click', (e) => {
        if (e.target === cookingInstructionsModal) closeCookingInstructions();
    });
    
    detailsBtn.addEventListener('click', openRecommendationDetailsModal);
    refreshRecommendationsBtn.addEventListener('click', fetchRecommendations);
    closeRecommendationDetailsModalBtn.addEventListener('click', closeRecommendationDetailsModal);
    saveRecommendationDetailsBtn.addEventListener('click', closeRecommendationDetailsModal);
    recommendationDetailsModal.addEventListener('click', (e) => {
        if (e.target === recommendationDetailsModal) closeRecommendationDetailsModal();
    });

    settingsBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModalAndSave);
    saveAndCloseBtn.addEventListener('click', closeModalAndSave);
    addSettingBtn.addEventListener('click', addSettingItem);
    
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeModalAndSave();
    });
    addFoodModal.addEventListener('click', (e) => {
        if (e.target === addFoodModal) closeAddFoodModal();
    });

    // Voice Setup Event Listeners
    voiceSetupBtn.addEventListener('click', openVoiceSetupModal);
    closeVoiceSetupModalBtn.addEventListener('click', closeVoiceSetupModal);
    startVoiceBtn.addEventListener('click', () => {
        showCurrentQuestion();
        const firstQuestion = voiceSetupState.questions[0];
        speakText(firstQuestion.text + " " + firstQuestion.example);
        setTimeout(() => {
            startVoiceRecognition();
        }, 3000); // Give time for the question to be spoken
    });
    stopVoiceBtn.addEventListener('click', stopVoiceRecognition);
    completeVoiceSetupBtn.addEventListener('click', completeVoiceSetup);
    skipVoiceSetupBtn.addEventListener('click', closeVoiceSetupModal);
    submitManualBtn.addEventListener('click', submitManualAnswer);
    
    // Allow Enter key in manual input
    manualAnswer.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitManualAnswer();
        }
    });

    voiceSetupModal.addEventListener('click', (e) => {
        if (e.target === voiceSetupModal) closeVoiceSetupModal();
    });

    // --- INITIAL RENDER ---
    renderFoodHistory();
    renderDashboardRecommendations();



    //WELCOME section
    const welcomeModal = document.getElementById('welcomeModal');
    const closeWelcomeModalBtn = document.getElementById('closeWelcomeModalBtn');
    const setupProfileBtn = document.getElementById('setupProfileBtn');
    const skipSetupBtn = document.getElementById('skipSetupBtn');
    const welcomeUsername = document.getElementById('welcomeUsername');
    //const voiceSetupModal = document.getElementById('voiceSetupModal');
    
    // Function to get or generate username
    function getUsername() {
        let username = localStorage.getItem('username');
        if (!username) {
            // Generate a simple username or use a default
            username = 'User';
            localStorage.setItem('username', username);
        }
        return username;
    }
    
    // Function to check if user has seen welcome popup
    function hasSeenWelcome() {
        return localStorage.getItem('hasSeenWelcome') === 'true';
    }
    
    // Function to mark welcome as seen
    function markWelcomeAsSeen() {
        localStorage.setItem('hasSeenWelcome', 'true');
    }
    
    // Function to show welcome modal
    function showWelcomeModal() {
        const username = getUsername();
        welcomeUsername.textContent = username;
        welcomeModal.classList.remove('hidden');
        // Disable scrolling on body
        document.body.style.overflow = 'hidden';
    }
    
    // Function to hide welcome modal
    function hideWelcomeModal() {
        welcomeModal.classList.add('hidden');
        markWelcomeAsSeen();
        // Re-enable scrolling on body
        document.body.style.overflow = '';
    }
    
    // Function to open voice setup modal
    function openVoiceSetup() {
        hideWelcomeModal();
        // Trigger the voice setup modal (same as voiceSetupBtn)
        voiceSetupModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    // Show welcome modal if user hasn't seen it
    if (!hasSeenWelcome()) {
        showWelcomeModal();
    }
    
    // Event listeners for welcome modal
    closeWelcomeModalBtn.addEventListener('click', hideWelcomeModal);
    skipSetupBtn.addEventListener('click', hideWelcomeModal);
    setupProfileBtn.addEventListener('click', openVoiceSetup);
    
    // Close modal when clicking outside of it
    welcomeModal.addEventListener('click', (e) => {
        if (e.target === welcomeModal) {
            hideWelcomeModal();
        }
    });

});
