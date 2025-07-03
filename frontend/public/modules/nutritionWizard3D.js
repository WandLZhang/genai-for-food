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

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class NutritionWizard3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.sphere = null;
        this.particles = null;
        this.audioAnalyser = null;
        this.dataArray = null;
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.z = 5;
        
        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        // Create gradient background
        this.createGradientBackground();
        
        // Create main sphere
        this.createSphere();
        
        // Create particle system
        this.createParticles();
        
        // Lighting
        this.setupLighting();
        
        // Post-processing
        this.setupPostProcessing();
        
        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Start animation
        this.animate();
    }
    
    createGradientBackground() {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, '#1a0f2e');
        gradient.addColorStop(0.5, '#2d1b69');
        gradient.addColorStop(1, '#0a0a0a');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 2, 512);
        
        const texture = new THREE.CanvasTexture(canvas);
        this.scene.background = texture;
    }
    
    createSphere() {
        // Create main sphere geometry
        const geometry = new THREE.IcosahedronGeometry(1, 10);
        
        // Custom shader material for animated effect
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                audioData: { value: 0 },
                color1: { value: new THREE.Color('#667eea') },
                color2: { value: new THREE.Color('#764ba2') },
                glowColor: { value: new THREE.Color('#8b5cf6') }
            },
            vertexShader: `
                uniform float time;
                uniform float audioData;
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    
                    vec3 pos = position;
                    float displacement = sin(pos.x * 10.0 + time) * 0.05;
                    displacement += sin(pos.y * 10.0 + time * 0.8) * 0.05;
                    displacement += sin(pos.z * 10.0 + time * 1.2) * 0.05;
                    displacement *= (1.0 + audioData * 2.0);
                    
                    pos += normal * displacement;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color1;
                uniform vec3 color2;
                uniform vec3 glowColor;
                uniform float audioData;
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    vec3 color = mix(color1, color2, vPosition.y * 0.5 + 0.5);
                    color = mix(color, glowColor, intensity * (0.5 + audioData * 0.5));
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            transparent: true
        });
        
        this.sphere = new THREE.Mesh(geometry, material);
        this.scene.add(this.sphere);
        
        // Add wireframe overlay
        const wireframeGeometry = new THREE.IcosahedronGeometry(1.02, 2);
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0xc084fc,
            wireframe: true,
            transparent: true,
            opacity: 0.1
        });
        const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
        this.sphere.add(wireframe);
    }
    
    createParticles() {
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        const color1 = new THREE.Color('#c084fc');
        const color2 = new THREE.Color('#e9d5ff');
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Random positions in a sphere
            const radius = 3 + Math.random() * 2;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
            
            // Random colors
            const color = Math.random() > 0.5 ? color1 : color2;
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            sizes[i] = Math.random() * 3 + 1;
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                audioData: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;
                uniform float time;
                uniform float audioData;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float scaledSize = size * (1.0 + audioData * 0.5);
                    gl_PointSize = scaledSize * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    float r = distance(gl_PointCoord, vec2(0.5, 0.5));
                    if (r > 0.5) discard;
                    
                    float opacity = 1.0 - (r * 2.0);
                    gl_FragColor = vec4(vColor, opacity * 0.6);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });
        
        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x667eea, 0.4);
        this.scene.add(ambientLight);
        
        // Point lights for dynamic lighting
        const pointLight1 = new THREE.PointLight(0x764ba2, 2, 10);
        pointLight1.position.set(5, 5, 5);
        this.scene.add(pointLight1);
        
        const pointLight2 = new THREE.PointLight(0x8b5cf6, 2, 10);
        pointLight2.position.set(-5, -5, 5);
        this.scene.add(pointLight2);
    }
    
    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, // strength
            0.4, // radius
            0.85 // threshold
        );
        bloomPass.threshold = 0.21;
        bloomPass.strength = 2;
        bloomPass.radius = 0.55;
        this.composer.addPass(bloomPass);
    }
    
    connectAudio(audioContext, audioSource) {
        this.audioAnalyser = audioContext.createAnalyser();
        this.audioAnalyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
        
        audioSource.connect(this.audioAnalyser);
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Get audio data
        let audioLevel = 0;
        if (this.audioAnalyser) {
            this.audioAnalyser.getByteFrequencyData(this.dataArray);
            audioLevel = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length / 255;
        }
        
        // Update time uniforms
        const time = performance.now() * 0.001;
        
        // Update sphere
        if (this.sphere) {
            this.sphere.rotation.x += 0.001;
            this.sphere.rotation.y += 0.002;
            this.sphere.material.uniforms.time.value = time;
            this.sphere.material.uniforms.audioData.value = audioLevel;
            
            // Scale based on audio
            const scale = 1 + audioLevel * 0.3;
            this.sphere.scale.set(scale, scale, scale);
        }
        
        // Update particles
        if (this.particles) {
            this.particles.rotation.y += 0.0005;
            this.particles.material.uniforms.time.value = time;
            this.particles.material.uniforms.audioData.value = audioLevel;
        }
        
        // Render
        this.composer.render();
    }
    
    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        window.removeEventListener('resize', this.onWindowResize);
        
        if (this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
        
        // Clean up Three.js resources
        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }
}
