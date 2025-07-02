// Import modules
import { AudioManager } from './modules/audioManager.js';
import { resizeAndCompressImage } from './modules/utils.js';
import { initMap, analyzeLocation } from './modules/sitePrecheck.js';
import { 
    toggleCamera, 
    captureFrame, 
    retakePhoto, 
    handleFileUpload, 
    processInspection,
    cleanupCamera,
    getCameraState,
    setCapturedImage
} from './modules/inspection.js';
import {
    initNutritionCamera,
    captureNutritionPhoto,
    openNutritionModule,
    closeNutritionPanel,
    cleanupNutritionCamera,
    setAudioManager,
    setupGlobalNutritionFunctions,
    clearNutritionHistory,
    fetchNutritionRecommendations,
    handleNutritionChatInput,
    resetNutritionAnalysis,
    handleNutritionFileUpload
} from './modules/nutritionAssistant.js';

// DOM Elements
console.log('App.js loaded - Modularized version', new Date().toISOString());
const menuButton = document.getElementById('menuButton');
const menuPanel = document.getElementById('menuPanel');
const precheckView = document.getElementById('precheckView');
const inspectionView = document.getElementById('inspectionView');
const nutritionView = document.getElementById('nutritionView');
const cameraToggle = document.getElementById('cameraToggle');
const captureButton = document.getElementById('captureButton');
const camera = document.getElementById('camera');
const micButton = document.getElementById('micButton');
const inspectionInput = document.getElementById('inspectionInput');
const processButton = document.getElementById('processButton');
const citationResults = document.getElementById('citationResults');
const menuItems = document.querySelectorAll('.menu-item');
const retakeButton = document.getElementById('retakeButton');
const fileInput = document.getElementById('fileInput');

// Initialize AudioManager
const audioManager = new AudioManager();

// Initialize nutrition module with audio manager
setAudioManager(audioManager);

// State
let isMenuOpen = false;
let isRecording = false;
let currentView = null;
let recognition = null;

// Menu Control Functions
function openMenu() {
    menuPanel.classList.add('menu-open');
    isMenuOpen = true;
}

function closeMenu() {
    menuPanel.classList.remove('menu-open');
    isMenuOpen = false;
}

function toggleMenu() {
    if (isMenuOpen) {
        closeMenu();
    } else {
        openMenu();
    }
}

// Initialize Speech Recognition
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        micButton.classList.add('recording');
        isRecording = true;
    };

    recognition.onend = () => {
        micButton.classList.remove('recording');
        isRecording = false;
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            }
        }
        if (finalTranscript) {
            inspectionInput.value = finalTranscript;
        }
    };
}

// Microphone Controls
function toggleMicrophone() {
    if (!recognition) {
        alert('Speech recognition is not supported in this browser.');
        return;
    }

    if (!isRecording) {
        recognition.start();
    } else {
        recognition.stop();
    }
}

// View Switching
menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.target.dataset.view;
        switchView(view);
        // Close the menu after selecting an item
        closeMenu();
    });
});

// Menu button click handler
menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (isMenuOpen && !menuPanel.contains(e.target) && !menuButton.contains(e.target)) {
        closeMenu();
    }
});

function switchView(view) {
    if (currentView === view) return;
    
    // Stop any playing audio
    audioManager.stopAudio();
    
    // Hide all views
    precheckView.style.display = 'none';
    inspectionView.style.display = 'none';
    nutritionView.style.display = 'none';
    
    // Show selected view
    if (view === 'precheck') {
        precheckView.style.display = 'block';
        initMap();
    } else if (view === 'inspection') {
        inspectionView.style.display = 'block';
        // Initialize inspection view buttons
        captureButton.style.display = 'inline-flex';
        retakeButton.style.display = 'none';
        // Clear any existing preview or results
        const preview = document.getElementById('preview');
        if (preview) preview.remove();
        citationResults.innerHTML = '';
        inspectionInput.value = '';
        
        // Reset camera view to show placeholder
        camera.style.display = 'none';
        const placeholder = document.getElementById('cameraPlaceholder');
        if (placeholder) placeholder.style.display = 'flex';
        
        // If camera was on, turn it off
        const { isCameraOn, mediaStream } = getCameraState();
        if (isCameraOn) {
            cleanupCamera();
            cameraToggle.querySelector('.material-icons').textContent = 'videocam_off';
        }
    } else if (view === 'nutrition') {
        nutritionView.style.display = 'block';
        initNutritionCamera();
    }
    
    currentView = view;
    
    // Update active menu item
    menuItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });
}

// Event Listeners
cameraToggle.addEventListener('click', toggleCamera);
micButton.addEventListener('click', toggleMicrophone);
captureButton.addEventListener('click', () => captureFrame(resizeAndCompressImage));
retakeButton.addEventListener('click', retakePhoto);
processButton.addEventListener('click', () => processInspection(audioManager));

// Handle file upload
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file, resizeAndCompressImage);
    }
});

// Setup global nutrition functions
setupGlobalNutritionFunctions();

// Override global nutrition functions to include necessary parameters
window.captureNutritionPhoto = () => captureNutritionPhoto(resizeAndCompressImage);
window.handleNutritionChatInput = (event) => handleNutritionChatInput(event);
window.handleNutritionFileUpload = (file) => handleNutritionFileUpload(file, resizeAndCompressImage);

// Override switchView to handle nutrition cleanup
const originalSwitchView = switchView;
switchView = function(view) {
    if (currentView === 'nutrition') {
        cleanupNutritionCamera();
    }
    originalSwitchView(view);
};

// Wait for Firebase to initialize before starting the app
window.addEventListener('firebaseReady', () => {
    // Initialize first view
    switchView('precheck');

    // Handle location selection for precheck
    document.getElementById('coordinates').addEventListener('change', async (e) => {
        const address = e.target.value;
        if (!address) return;
        
        audioManager.stopAudio(); // Stop any playing audio immediately
        
        // The analyzeLocation function will handle cancelling any ongoing analysis
        await analyzeLocation(address, audioManager);
    });
});

// Add event listener for page navigation
window.addEventListener('popstate', () => {
    audioManager.stopAudio();
});

// Add error handling for Firebase initialization
window.addEventListener('error', (event) => {
    if (event.error?.message?.includes('Firebase')) {
        console.error('Firebase initialization error:', event.error);
        const resultElement = document.getElementById('precheckResult');
        if (resultElement) {
            resultElement.innerHTML = `
                <div style="padding: 16px; color: var(--error);">
                    Error initializing application. Please try refreshing the page.
                </div>
            `;
        }
    }
});
