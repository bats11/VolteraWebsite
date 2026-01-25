/**
 * ShowcaseStage Module
 * Handles Scene, Camera, Renderer, Post-Processing, Lights, Ground, Backdrop, and Resize
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import ResizeManager from '../resize-manager.js';

// --- BACKDROP GLSL SHADERS ---
const backdropVertexShader = `
    varying float vWorldY;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldY = worldPosition.y;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const backdropFragmentShader = `
    uniform float uHeight;
    uniform float uOffset;
    uniform vec3 uColorTop;
    uniform vec3 uColorBottom;

    varying float vWorldY;

    // Funzione per generare rumore granulare (Dithering)
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
        float adjustedY = vWorldY + uOffset;
        float gradientFactor = smoothstep(0.0, uHeight, adjustedY);
        vec3 finalColor = mix(uColorBottom, uColorTop, gradientFactor);

        // Applica dithering per rompere le bande di colore (attenuato solo nell'ultimo 20%)
        float noise = (random(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);
        float ditherFade = 1.0 - smoothstep(0.8, 1.0, gradientFactor);
        finalColor += noise * ditherFade;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

/**
 * Generates procedural Roughness and Normal maps for the ground
 * Combined noise algorithm (Fine + Coarse) with Range Clamping (0.4-0.9)
 * @param {number} size - Texture size (default 1024)
 * @returns {Object} { roughnessMap, normalMap }
 */
function generateProceduralTextures(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Buffer to store height values for normal calculation
    const buffer = new Float32Array(size * size);

    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);

        // Normalized coordinates (0 to 1) for Seamless Logic
        const u = x / size;
        const v = y / size;

        // --- LAYER 1: Fine Noise (Asphalt Grain) ---
        // Attenuated random to reduce "TV Static" look
        const fineNoise = (Math.random() * 0.5) + 0.5;

        // --- LAYER 2: Coarse Noise (Prime Chaos) ---
        // Using 3 waves with prime frequencies to break symmetry and patterns.
        const wave1 = Math.sin(u * Math.PI * 2 * 1.8 + v * Math.PI * 2 * 1.4);
        const wave2 = Math.cos(u * Math.PI * 2 * 3.5 - v * Math.PI * 2 * 2.5);
        const wave3 = Math.sin((u + v) * Math.PI * 2 * 3.0);

        // Normalize coarse noise to 0-1 range
        // Sum range is [-3, 3] approx -> /3 -> [-1, 1] -> *0.5+0.5 -> [0, 1]
        const coarseNoise = ((wave1 + wave2 + wave3) / 3.0) * 0.5 + 0.5;

        // --- COMPOSITION ---
        // Reduced Contrast: 85% Fine Noise, 15% Coarse Noise (just for subtle variation)
        let rawValue = (fineNoise * 0.85) + (coarseNoise * 0.15);

        // --- RANGE CLAMPING ---
        // Map Result -> [0.4, 0.9] to avoid mirrors (0.0) or flat matte (1.0)
        let finalValue = 0.1 + (rawValue * 0.7);
        finalValue = Math.max(0.1, Math.min(0.9, finalValue));

        buffer[i] = finalValue;

        // Write Roughness (Grayscale)
        const pixelIdx = i * 4;
        const gray = Math.floor(finalValue * 255);
        data[pixelIdx] = gray;     // R
        data[pixelIdx + 1] = gray; // G
        data[pixelIdx + 2] = gray; // B
        data[pixelIdx + 3] = 255;  // A
    }

    ctx.putImageData(imgData, 0, 0);
    const roughnessMap = new THREE.CanvasTexture(canvas);

    // --- GENERATE NORMAL MAP ---
    // Calculate normals from the height buffer
    const canvasNormal = document.createElement('canvas');
    canvasNormal.width = size;
    canvasNormal.height = size;
    const ctxNormal = canvasNormal.getContext('2d');
    const normalImgData = ctxNormal.createImageData(size, size);
    const normalData = normalImgData.data;

    const strength = 3.0; // Bump strength

    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);

        // Neighbor lookups (wrapping)
        const xL = (x - 1 + size) % size;
        const xR = (x + 1) % size;
        const yU = (y - 1 + size) % size;
        const yD = (y + 1) % size;

        const hL = buffer[y * size + xL];
        const hR = buffer[y * size + xR];
        const hU = buffer[yU * size + x];
        const hD = buffer[yD * size + x];

        // Differentiate (Sobel-like)
        const dx = (hL - hR) * strength;
        const dy = (hU - hD) * strength;

        // Construct Normal Vector
        const nz = 1.0;
        const len = Math.sqrt(dx * dx + dy * dy + nz * nz);

        // Pack into [0, 255]
        const nx = ((dx / len) + 1.0) * 0.5 * 255;
        const ny = ((dy / len) + 1.0) * 0.5 * 255;
        const n_z = ((nz / len) + 1.0) * 0.5 * 255;

        const pixelIdx = i * 4;
        normalData[pixelIdx] = Math.floor(nx);
        normalData[pixelIdx + 1] = Math.floor(ny);
        normalData[pixelIdx + 2] = Math.floor(n_z);
        normalData[pixelIdx + 3] = 255;
    }

    ctxNormal.putImageData(normalImgData, 0, 0);
    const normalMap = new THREE.CanvasTexture(canvasNormal);

    return { roughnessMap, normalMap };
}

/**
 * Creates the complete stage infrastructure for the Showcase scene
 * @param {HTMLElement} containerElement - The container element for the renderer
 * @param {Object} config - Configuration object
 * @param {number} config.startZ - Initial camera Z position
 * @param {number} [config.cameraY=2] - Camera Y position
 * @returns {Object} Stage object with scene, camera, renderer, composer, outlinePass, dispose
 */
export function createStage(uiConfig, config) {
    const { container } = uiConfig;
    const startZ = config.startZ;
    const cameraY = config.cameraY ?? 2;

    // Track disposables for cleanup
    const disposables = [];
    let resizeUnsubscribe = null;

    // --- SCENE SETUP ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);
    scene.fog = new THREE.FogExp2(0x080808, 0.01);

    // --- CAMERA SETUP ---
    const camera = new THREE.PerspectiveCamera(
        35,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, cameraY, startZ);
    camera.lookAt(0, 0, 0);

    // --- RENDERER SETUP ---
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x080808, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; // Stabilized exposure
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // --- EFFECT COMPOSER ---
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearColor = new THREE.Color(0x080808);
    renderPass.clearAlpha = 1;
    composer.addPass(renderPass);

    // --- OUTLINE PASS (Active Penumbra) ---
    // Must be added BEFORE Bloom to allow bloom to soften the edges
    const outlinePass = new OutlinePass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        scene,
        camera
    );
    outlinePass.edgeStrength = 0.0; // Animated via GSAP
    outlinePass.edgeGlow = 0.6;
    outlinePass.edgeThickness = 0.01;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.set('#FFFFFF');
    outlinePass.hiddenEdgeColor.set('#000000');
    composer.addPass(outlinePass);

    // --- BLOOM PASS ---
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.6,   // strength
        0.3,   // radius
        0.85   // threshold
    );
    composer.addPass(bloomPass);

    // --- LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0);
    directionalLight.position.set(10, 20, 10);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = false;

    // Shadow Configuration
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -200;
    directionalLight.shadow.camera.right = 200;
    directionalLight.shadow.camera.top = 200;
    directionalLight.shadow.camera.bottom = -200;

    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // --- CORE SPOTLIGHT (No Shadows, Perpendicular to Ground) ---
    // Radius of Monolith Ring is 30. Spotlight Height is ~61.5 (60 - -1.5).
    // tan(angle) = 32 / 61.5 ≈ 0.52  =>  angle ≈ Math.PI / 6
    const coreSpotLight = new THREE.SpotLight(0xffffff, 600);
    coreSpotLight.position.set(0, 60, -110);
    coreSpotLight.target.position.set(0, -10, -110);
    coreSpotLight.angle = THREE.MathUtils.degToRad(60); // Wider cone covers everything
    coreSpotLight.penumbra = 0.4; // Sharper edge, more intensity at the ring radius
    coreSpotLight.decay = 1.0;
    coreSpotLight.distance = 200;
    coreSpotLight.castShadow = true;

    // Shadow Configuration for Spotlight
    coreSpotLight.shadow.mapSize.width = 2048;
    coreSpotLight.shadow.mapSize.height = 2048;
    coreSpotLight.shadow.camera.near = 10;
    coreSpotLight.shadow.camera.far = 200;
    coreSpotLight.shadow.bias = -0.001; // Reduce shadow acne

    scene.add(coreSpotLight);
    scene.add(coreSpotLight.target);

    // --- NOCTURNAL PLANE (Ground) ---
    // Generate Procedural Maps
    const { roughnessMap, normalMap } = generateProceduralTextures(1024);

    // Configure Maps (Anisotropy & Tiling)
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    [roughnessMap, normalMap].forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(6, 6); // Wider tiling (6x6) to hide repetition
        t.anisotropy = maxAnisotropy;
    });

    const groundGeometry = new THREE.PlaneGeometry(400, 400);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x080808,       // Very dark base
        roughness: 1.0,        // Controlled by map
        metalness: 0.7,        // High metalness for specular highlights
        roughnessMap: roughnessMap,
        normalMap: normalMap,
        dithering: true,
        transparent: true,
        opacity: 1.0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);
    disposables.push(groundGeometry, groundMaterial);

    // --- BACKDROP SPHERE (Vertical Gradient Shader) ---
    const backdropGeometry = new THREE.SphereGeometry(500, 32, 32);
    const backdropUniforms = {
        uHeight: { value: 200.0 },
        uOffset: { value: 50.0 },
        uColorTop: { value: new THREE.Color(0x1a1a1a) },
        uColorBottom: { value: new THREE.Color(0x000000) }
    };
    const backdropMaterial = new THREE.ShaderMaterial({
        uniforms: backdropUniforms,
        vertexShader: backdropVertexShader,
        fragmentShader: backdropFragmentShader,
        side: THREE.BackSide,
        fog: false,
        toneMapped: false
    });
    const backdropMesh = new THREE.Mesh(backdropGeometry, backdropMaterial);
    backdropMesh.name = 'backdrop';
    scene.add(backdropMesh);
    // Track manually for strict disposal
    // disposables.push(backdropGeometry, backdropMaterial); // Adding them to generic disposables too just in case

    // --- RESIZE HANDLER ---
    resizeUnsubscribe = ResizeManager.subscribe(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        composer.setSize(width, height);

        if (outlinePass) {
            outlinePass.setSize(width, height);
        }
    });

    // --- DISPOSE METHOD ---
    function dispose() {
        // Unsubscribe from resize
        if (resizeUnsubscribe) {
            resizeUnsubscribe();
        }

        // Dispose generic tracked resources
        disposables.forEach(resource => {
            if (resource && resource.dispose) {
                resource.dispose();
            }
        });

        // Strict Disposal for Backdrop
        if (backdropGeometry) backdropGeometry.dispose();
        if (backdropMaterial) {
            // backdropMaterial.uniforms... nothing to dispose in uniforms usually unless textures
            backdropMaterial.dispose();
        }

        // Dispose renderer
        renderer.dispose();

        // Remove canvas from DOM
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }

        console.log('[ShowcaseStage] Disposed');
    }

    console.log('[ShowcaseStage] Stage created');

    return {
        scene,
        camera,
        renderer,
        composer,
        outlinePass,
        ground,
        dispose
    };
}
