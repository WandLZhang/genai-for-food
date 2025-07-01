// Load environment variables from meta tags
const getEnvVar = (name) => {
    const meta = document.querySelector(`meta[name="${name}"]`);
    return meta ? meta.content : '';
};

export const config = {
    firebase: {
        apiKey: "AIzaSyA25BAdiIYLGdRtjlFAIum92J5_aq5mqgg",
        authDomain: "fda-genai-for-food.firebaseapp.com",
        projectId: "fda-genai-for-food",
        storageBucket: "fda-genai-for-food.firebasestorage.app",
        messagingSenderId: "493357598781",
        appId: "1:493357598781:web:69b065d2d67645625a8254"
    },
    googleMaps: {
        apiKey: getEnvVar('google-maps-api-key')
    }
};
