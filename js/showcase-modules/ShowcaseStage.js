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
    scene.fog = new THREE.FogExp2(0x080808, 0);

    // --- CAMERA SETUP ---
    const camera = new THREE.PerspectiveCamera(
        50,
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

    const directionalLight = new THREE.DirectionalLight(0xffffff, 4);
    directionalLight.position.set(10, 20, 10);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;

    // Shadow Configuration
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;

    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // --- CORE SPOTLIGHT (No Shadows, Perpendicular to Ground) ---
    // Radius of Monolith Ring is 30. Spotlight Height is ~61.5 (60 - -1.5).
    // tan(angle) = 32 / 61.5 ≈ 0.52  =>  angle ≈ Math.PI / 6
    const coreSpotLight = new THREE.SpotLight(0xffffff, 300);
    coreSpotLight.position.set(0, 60, -80);
    coreSpotLight.target.position.set(0, -10, -80);
    coreSpotLight.angle = Math.PI / 6; // Reduced to match ring size (~30 radius)
    coreSpotLight.penumbra = 0.5;
    coreSpotLight.decay = 1.0;
    coreSpotLight.distance = 200;
    coreSpotLight.castShadow = false;

    scene.add(coreSpotLight);
    scene.add(coreSpotLight.target);

    // --- NOCTURNAL PLANE (Ground) ---
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x050505,
        roughness: 0.9,
        metalness: 0.1,
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
