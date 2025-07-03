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
