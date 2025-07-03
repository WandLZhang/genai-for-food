import { NutritionWizard3D } from './nutritionWizard3D.js';

export class NutritionWizard {
    constructor(container, audioManager) {
        this.container = container;
        this.audioManager = audioManager;
        this.visualization = null;
        this.currentStep = 0;
        this.profileData = {
            gender: null,
            age: null,
            heightFeet: null,
            heightInches: null,
            weight: null,
            goals: null,
            restrictions: null,
            preferences: null
        };
        
        this.steps = [
            { id: 'welcome', title: 'Welcome' },
            { id: 'gender', title: 'Gender', question: 'What is your gender?' },
            { id: 'age', title: 'Age', question: 'How old are you?' },
            { id: 'height', title: 'Height', question: 'What is your height?' },
            { id: 'weight', title: 'Weight', question: 'What is your weight?' },
            { id: 'goals', title: 'Goals', question: 'What are your health and nutrition goals?' },
            { id: 'restrictions', title: 'Dietary Restrictions', question: 'Do you have any dietary restrictions or allergies?' },
            { id: 'preferences', title: 'Food Preferences', question: 'What are your food preferences?' },
            { id: 'summary', title: 'Summary' }
        ];
        
        this.audioContext = null;
        this.audioSource = null;
    }
    
    async init() {
        // Create wizard container
        this.createWizardHTML();
        
        // Initialize 3D visualization
        const visualContainer = document.getElementById('nutritionWizard3DContainer');
        this.visualization = new NutritionWizard3D(visualContainer);
        
        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ensure initial fade-in state
        const contentContainer = document.getElementById('wizardStepContent');
        contentContainer.classList.add('fade-in');
        
        // Show welcome step
        this.showStep(0);
    }
    
    createWizardHTML() {
        const wizardHTML = `
            <div id="nutritionWizardOverlay" class="nutrition-wizard-overlay">
                <div id="nutritionWizard3DContainer" class="nutrition-wizard-3d-container"></div>
                
                <div class="nutrition-wizard-content">
                    <!-- Progress indicator -->
                    <div class="nutrition-wizard-progress">
                        <div class="nutrition-wizard-progress-bar">
                            <div class="nutrition-wizard-progress-fill" id="wizardProgressFill"></div>
                        </div>
                        <div class="nutrition-wizard-progress-steps" id="wizardProgressSteps"></div>
                    </div>
                    
                    <!-- Step content -->
                    <div class="nutrition-wizard-step" id="wizardStepContent">
                        <!-- Dynamic content will be inserted here -->
                    </div>
                    
                    <!-- Navigation -->
                    <div class="nutrition-wizard-nav">
                        <button class="nutrition-wizard-btn nutrition-wizard-btn-secondary" id="wizardPrevBtn" onclick="window.nutritionWizard.previousStep()">
                            Previous
                        </button>
                        <button class="nutrition-wizard-btn nutrition-wizard-btn-primary" id="wizardNextBtn" onclick="window.nutritionWizard.nextStep()">
                            Next
                        </button>
                        <button class="nutrition-wizard-btn nutrition-wizard-btn-skip" id="wizardSkipBtn" onclick="window.nutritionWizard.skip()">
                            Skip Setup
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add wizard to nutrition view
        const nutritionView = document.getElementById('nutritionView');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = wizardHTML;
        nutritionView.querySelector('.nutrition-app-container').appendChild(tempDiv.firstElementChild);
        
        // Generate progress steps
        this.updateProgressIndicator();
    }
    
    updateProgressIndicator() {
        const stepsContainer = document.getElementById('wizardProgressSteps');
        const progressFill = document.getElementById('wizardProgressFill');
        
        // Clear existing steps
        stepsContainer.innerHTML = '';
        
        // Create step indicators
        this.steps.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'nutrition-wizard-progress-step';
            if (index < this.currentStep) {
                stepDiv.classList.add('completed');
            } else if (index === this.currentStep) {
                stepDiv.classList.add('active');
            }
            stepDiv.innerHTML = `<span>${index + 1}</span>`;
            stepsContainer.appendChild(stepDiv);
        });
        
        // Update progress bar
        const progress = (this.currentStep / (this.steps.length - 1)) * 100;
        progressFill.style.width = `${progress}%`;
    }
    
    async playStepAudio(stepIndex) {
        try {
            // Load audio file for the specific step
            const response = await fetch(`/audio/audio${stepIndex}.wav`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Stop any currently playing audio
            if (this.audioSource && this.audioSource.stop) {
                try {
                    this.audioSource.stop();
                } catch (e) {
                    // Ignore if already stopped
                }
            }
            
            // Create new audio source
            this.audioSource = this.audioContext.createBufferSource();
            this.audioSource.buffer = audioBuffer;
            
            // Connect to visualization
            this.visualization.connectAudio(this.audioContext, this.audioSource);
            
            // Connect to speakers
            this.audioSource.connect(this.audioContext.destination);
            
            // Play audio
            this.audioSource.start();
        } catch (error) {
            console.error('Error playing step audio:', error);
        }
    }
    
    showStep(stepIndex) {
        this.currentStep = stepIndex;
        const step = this.steps[stepIndex];
        const contentContainer = document.getElementById('wizardStepContent');
        
        // Add fade-out class to current content
        contentContainer.classList.add('fade-out');
        
        // Wait for fade-out to complete before updating content
        setTimeout(() => {
            // Update navigation buttons
            const prevBtn = document.getElementById('wizardPrevBtn');
            const nextBtn = document.getElementById('wizardNextBtn');
            const skipBtn = document.getElementById('wizardSkipBtn');
            
            prevBtn.style.display = stepIndex > 0 ? 'block' : 'none';
            skipBtn.style.display = stepIndex === 0 ? 'block' : 'none';
            
            // Generate step content
            let content = '';
        
        switch (step.id) {
            case 'welcome':
                content = `
                    <div class="nutrition-wizard-welcome">
                        <h1>Welcome to Your Nutrition Assistant</h1>
                        <p>I'll help you create a personalized nutrition plan by learning about your health goals and preferences.</p>
                        <button id="wizardGetStarted" class="nutrition-wizard-btn nutrition-wizard-btn-large" onclick="window.nutritionWizard.nextStep()">
                            Get Started
                        </button>
                    </div>
                `;
                nextBtn.style.display = 'none';
                break;
                
            case 'gender':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <div class="nutrition-wizard-options">
                            <button class="nutrition-wizard-option" data-value="Male" onclick="window.nutritionWizard.selectGender('Male')">
                                <span class="material-icons">male</span>
                                <span>Male</span>
                            </button>
                            <button class="nutrition-wizard-option" data-value="Female" onclick="window.nutritionWizard.selectGender('Female')">
                                <span class="material-icons">female</span>
                                <span>Female</span>
                            </button>
                            <button class="nutrition-wizard-option" data-value="Other" onclick="window.nutritionWizard.selectGender('Other')">
                                <span class="material-icons">transgender</span>
                                <span>Other</span>
                            </button>
                        </div>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                nextBtn.textContent = 'Next';
                nextBtn.disabled = !this.profileData.gender;
                break;
                
            case 'age':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <div class="nutrition-wizard-input-group">
                            <input type="number" id="wizardAge" min="1" max="120" placeholder="Enter your age" value="${this.profileData.age || ''}" onchange="window.nutritionWizard.updateAge(this.value)">
                            <span>years</span>
                        </div>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                nextBtn.disabled = !this.profileData.age;
                break;
                
            case 'height':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <div class="nutrition-wizard-input-row">
                            <div class="nutrition-wizard-input-group">
                                <input type="number" id="wizardHeightFeet" min="0" max="8" placeholder="Feet" value="${this.profileData.heightFeet || ''}" onchange="window.nutritionWizard.updateHeight()">
                                <span>ft</span>
                            </div>
                            <div class="nutrition-wizard-input-group">
                                <input type="number" id="wizardHeightInches" min="0" max="11" placeholder="Inches" value="${this.profileData.heightInches || ''}" onchange="window.nutritionWizard.updateHeight()">
                                <span>in</span>
                            </div>
                        </div>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                nextBtn.disabled = !this.profileData.heightFeet;
                break;
                
            case 'weight':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <div class="nutrition-wizard-input-group">
                            <input type="number" id="wizardWeight" min="1" max="1000" placeholder="Enter your weight" value="${this.profileData.weight || ''}" onchange="window.nutritionWizard.updateWeight(this.value)">
                            <span>lbs</span>
                        </div>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                nextBtn.disabled = !this.profileData.weight;
                break;
                
            case 'goals':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <textarea id="wizardGoals" rows="4" placeholder="e.g., Lose weight, gain muscle, eat healthier, manage diabetes..." onchange="window.nutritionWizard.updateGoals(this.value)">${this.profileData.goals || ''}</textarea>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                nextBtn.disabled = !this.profileData.goals;
                break;
                
            case 'restrictions':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <textarea id="wizardRestrictions" rows="4" placeholder="e.g., Nut allergy, lactose intolerant, vegetarian, gluten-free..." onchange="window.nutritionWizard.updateRestrictions(this.value)">${this.profileData.restrictions || ''}</textarea>
                        <p class="nutrition-wizard-hint">Leave blank if you have no restrictions</p>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                break;
                
            case 'preferences':
                content = `
                    <div class="nutrition-wizard-form">
                        <h2>${step.question}</h2>
                        <textarea id="wizardPreferences" rows="4" placeholder="e.g., Love vegetables, prefer spicy food, don't like seafood..." onchange="window.nutritionWizard.updatePreferences(this.value)">${this.profileData.preferences || ''}</textarea>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                break;
                
            case 'summary':
                content = `
                    <div class="nutrition-wizard-summary">
                        <h2>Profile Summary</h2>
                        <div class="nutrition-wizard-summary-content">
                            <div class="nutrition-wizard-summary-item">
                                <strong>Gender:</strong> ${this.profileData.gender}
                            </div>
                            <div class="nutrition-wizard-summary-item">
                                <strong>Age:</strong> ${this.profileData.age} years
                            </div>
                            <div class="nutrition-wizard-summary-item">
                                <strong>Height:</strong> ${this.profileData.heightFeet}'${this.profileData.heightInches || 0}"
                            </div>
                            <div class="nutrition-wizard-summary-item">
                                <strong>Weight:</strong> ${this.profileData.weight} lbs
                            </div>
                            <div class="nutrition-wizard-summary-item">
                                <strong>Goals:</strong> ${this.profileData.goals}
                            </div>
                            ${this.profileData.restrictions ? `
                            <div class="nutrition-wizard-summary-item">
                                <strong>Restrictions:</strong> ${this.profileData.restrictions}
                            </div>
                            ` : ''}
                            ${this.profileData.preferences ? `
                            <div class="nutrition-wizard-summary-item">
                                <strong>Preferences:</strong> ${this.profileData.preferences}
                            </div>
                            ` : ''}
                        </div>
                        <p class="nutrition-wizard-confirm">Is this information correct?</p>
                    </div>
                `;
                nextBtn.style.display = 'block'; // Ensure next button is visible
                nextBtn.textContent = 'Complete Setup';
                break;
            }
            
            contentContainer.innerHTML = content;
            
            // Remove fade-out and add fade-in class
            contentContainer.classList.remove('fade-out');
            contentContainer.classList.add('fade-in');
            
            // Update progress
            this.updateProgressIndicator();
            
            // Play audio for the current step
            this.playStepAudio(stepIndex);
        }, 300); // Match CSS transition duration
    }
    
    // Navigation methods
    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.completeWizard();
        }
    }
    
    previousStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }
    
    skip() {
        if (confirm('Are you sure you want to skip the setup? You can update your profile later.')) {
            // Load default profile when skipping
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
            
            // Save default profile
            localStorage.setItem('userProfile', JSON.stringify(defaultProfile));
            
            // Update userSettings and userPreferences for API calls
            const userSettings = `I am ${defaultProfile.gender.toLowerCase()}, ${defaultProfile.age} years old. ${defaultProfile.heightFeet}'${defaultProfile.heightInches} and ${defaultProfile.weight} lbs. Goal is to ${defaultProfile.goals.toLowerCase()}`;
            const userPreferences = `${defaultProfile.restrictions} ${defaultProfile.preferences}`;
            
            localStorage.setItem('userSettings', userSettings);
            localStorage.setItem('userPreferences', userPreferences);
            
            // Update profile display
            if (window.updateProfileDisplay) {
                window.updateProfileDisplay();
            }
            
            // Close wizard
            this.closeWizard();
        }
    }
    
    // Data update methods
    selectGender(gender) {
        this.profileData.gender = gender;
        // Update button states
        document.querySelectorAll('.nutrition-wizard-option').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.value === gender);
        });
        // Enable next button
        document.getElementById('wizardNextBtn').disabled = false;
    }
    
    updateAge(value) {
        this.profileData.age = parseInt(value) || null;
        document.getElementById('wizardNextBtn').disabled = !this.profileData.age;
    }
    
    updateHeight() {
        const feet = document.getElementById('wizardHeightFeet').value;
        const inches = document.getElementById('wizardHeightInches').value;
        this.profileData.heightFeet = parseInt(feet) || null;
        this.profileData.heightInches = parseInt(inches) || 0;
        document.getElementById('wizardNextBtn').disabled = !this.profileData.heightFeet;
    }
    
    updateWeight(value) {
        this.profileData.weight = parseInt(value) || null;
        document.getElementById('wizardNextBtn').disabled = !this.profileData.weight;
    }
    
    updateGoals(value) {
        this.profileData.goals = value || null;
        document.getElementById('wizardNextBtn').disabled = !this.profileData.goals;
    }
    
    updateRestrictions(value) {
        this.profileData.restrictions = value || '';
    }
    
    updatePreferences(value) {
        this.profileData.preferences = value || '';
    }
    
    completeWizard() {
        // Save profile data
        localStorage.setItem('userProfile', JSON.stringify(this.profileData));
        
        // Update userSettings and userPreferences for API calls
        const userSettings = `I am ${this.profileData.gender.toLowerCase()}, ${this.profileData.age} years old. ${this.profileData.heightFeet}'${this.profileData.heightInches} and ${this.profileData.weight} lbs. Goal is to ${this.profileData.goals.toLowerCase()}`;
        const userPreferences = `${this.profileData.restrictions} ${this.profileData.preferences}`;
        
        localStorage.setItem('userSettings', userSettings);
        localStorage.setItem('userPreferences', userPreferences);
        
        // Update profile display
        if (window.updateProfileDisplay) {
            window.updateProfileDisplay();
        }
        
        // Close wizard
        this.closeWizard();
    }
    
    closeWizard() {
        // Clean up visualization
        if (this.visualization) {
            this.visualization.destroy();
        }
        
        // Remove wizard overlay
        const overlay = document.getElementById('nutritionWizardOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
        
        // Clean up audio
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Make wizard accessible globally
window.NutritionWizard = NutritionWizard;
