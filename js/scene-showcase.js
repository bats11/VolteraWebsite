import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import ResizeManager from './resize-manager.js';


/**
 * Showcase "The Infinite Map" - Three.js Scene Module
 * @param {HTMLElement} containerElement - The container element for the scene
 */
export function initShowcaseMap(containerElement) {
    // --- DOM ELEMENTS ---
    const container = containerElement;
    if (!container) return;
    const section = document.getElementById('showcase');
    const hud = document.getElementById('showcase-hud');
    const hudRef = hud?.querySelector('.hud-ref');
    const hudStatus = hud?.querySelector('.hud-status');
    const projectDetail = document.getElementById('project-detail');
    const projectTitle = projectDetail?.querySelector('.project-title');
    const projectMeta = projectDetail?.querySelector('.project-meta');
    const projectClose = projectDetail?.querySelector('.project-close');

    if (!container || !section) return;

    // --- UI INIT ---
    // Camera reset will be handled by the global orchestrator response
    window.addEventListener('vltProjectClose', () => {
        resetCamera();
    });

    // --- CONSTANTS ---
    const TRAVEL_CONFIG = {
        startZ: 20,
        endZ: -60,
        travelFinishThreshold: 0.8
    };
    const NEON_CONFIG = {
        baseIntensity: 0.7,    // Punto di partenza (luminosità media)
        pulseAmplitude: 1,   // Quantità di variazione (+/- rispetto alla base)
        pulseSpeed: 1.5        // Velocità dell'oscillazione
    };
    const VOLTERA_EASE = "power4.out"; // Fallback

    // Register custom Voltera ease if GSAP is available
    if (typeof gsap !== 'undefined' && gsap.registerEase) {
        // Try to register CustomEase, otherwise fallback to cubic-bezier approximate
        try {
            if (CustomEase) {
                CustomEase.create("voltera", "0.16, 1, 0.3, 1");
            }
        } catch (e) {
            console.warn("CustomEase not found, using generic power4.out");
        }
    }
    const EASE_ACTIVE = typeof CustomEase !== 'undefined' ? "voltera" : VOLTERA_EASE;
    const PULSE_DECAY = 0.8; // Long Decay duration

    // --- PULSE BEHAVIORS (Modular Heartbeat System) ---
    const pulseBehaviors = {
        defaultBeat: (monolith, materials, gsap) => {
            const tl = gsap.timeline({ repeat: -1 });
            // Systole (Espansione rapida + Emissive Burst)
            tl.to(monolith.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.1, ease: 'power2.out' }, 0)
                .to(materials, { emissiveIntensity: 1.8, duration: 0.1, ease: 'power2.out' }, 0); // Base 0.1 * 2

            // Diastole (Contrazione lenta + Emissive Normal)
            tl.to(monolith.scale, { x: 0.98, y: 0.98, z: 0.98, duration: 0.4, ease: 'power2.inOut' }, 0.1)
                .to(materials, { emissiveIntensity: 0.1, duration: 0.4, ease: 'power2.inOut' }, 0.1);

            // Return (Assestamento inerziale)
            tl.to(monolith.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.3, ease: 'voltera' }, 0.5);

            return tl;
        },
        ghostBeat: (monolith, materials, gsap) => {
            // Future implementation
            return gsap.timeline();
        },
        glitchBeat: (monolith, materials, gsap) => {
            // Future implementation
            return gsap.timeline();
        }
    };

    // --- DEVICE DETECTION ---
    const isTouchDevice = window.matchMedia('(hover: none)').matches;

    // --- PROJECT DATA ---
    // --- PROJECT DATA ---
    // Projects will be loaded dynamicall from data/projects.json


    // --- SCENE STATE ---
    let scene, camera, renderer, composer, outlinePass;
    let directionalLight, ambientLight;
    let monoliths = [];


    let raycaster, mouse;
    let isZooming = false;
    let cameraSnapshot = new THREE.Vector3(); // Snapshot for exact return
    let currentHoveredMonolith = null;
    let scrollProgress = 0;
    let isRunning = false;
    let rafId = null;
    let pulseTriggered = false;
    let pulseTimeline = null;

    // --- CSS2D LABEL SYSTEM ---
    let labelRenderer;
    let projectLabels = []; // { object: CSS2DObject, element: HTMLElement }

    // --- CAMERA DRAG STATE ---
    let isDragging = false;
    const dragStart = { x: 0, y: 0 };
    const cameraRotation = {
        targetX: 0,
        targetY: 0,
        currentX: 0,
        currentY: 0
    };
    const DRAG_LIMIT = 0.25; // Radians (~14 degrees) - aumentato
    const DRAG_SENSITIVITY = 0.001; // dimezzato per renderlo più lento
    let initialCameraQuaternion = new THREE.Quaternion();

    // --- PROPS STATE ---
    let propsGroup;
    let propMaterials = [];

    // --- VIDEO SOURCE FOR CORE ---
    const videoEl = document.createElement('video');
    videoEl.src = './assets/video/showcase-monolith.mp4';
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.crossOrigin = 'anonymous';
    videoEl.play().catch(err => console.warn('[Showcase] Video autoplay blocked:', err));

    // --- VIDEO TEXTURE & CORE MATERIAL ---
    const videoTexture = new THREE.VideoTexture(videoEl);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBAFormat;
    videoTexture.colorSpace = THREE.SRGBColorSpace; // Codifica colore corretta

    // NOTE: anisotropy sarà impostata dopo la creazione del renderer

    const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x080808,           // Base nera profonda
        emissive: 0xffffff,        // White to modulate
        emissiveMap: videoTexture, // Video texture
        emissiveIntensity: 5,    // Idle state: 0.15 (Voltera Physics)
        side: THREE.DoubleSide,
        fog: true,
        toneMapped: false          // Evita compressione ACES
    });

    // --- SCENE SETUP ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);
    scene.fog = new THREE.FogExp2(0x080808, 0.025);

    camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 2, TRAVEL_CONFIG.startZ);
    camera.lookAt(0, 0, 0);
    initialCameraQuaternion.copy(camera.quaternion); // Capture base rotation

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x080808, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // --- CSS2D LABEL RENDERER ---
    const cssLayer = document.getElementById('showcase-css-layer');
    if (cssLayer) {
        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(container.clientWidth, container.clientHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0';
        labelRenderer.domElement.style.left = '0';
        labelRenderer.domElement.style.pointerEvents = 'none';
        cssLayer.appendChild(labelRenderer.domElement);
    }

    // Imposta anisotropia massima per video nitido di taglio
    videoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // --- EFFECT COMPOSER (Bloom) ---
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearColor = new THREE.Color(0x080808);
    renderPass.clearAlpha = 1;
    composer.addPass(renderPass);

    // --- OUTLINE PASS (Active Penumbra) ---
    // Must be added BEFORE Bloom to allow bloom to soften the edges
    outlinePass = new OutlinePass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        scene,
        camera
    );
    outlinePass.edgeStrength = 0.0; // Animated via GSAP
    outlinePass.edgeGlow = 0.6;
    outlinePass.edgeThickness = 0.01;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.set('#FFFFFF'); // Restored White
    outlinePass.hiddenEdgeColor.set('#000000');
    composer.addPass(outlinePass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.6,   // Adjusted strength for visibility
        0.3,   // radius
        0.85   // threshold
    );
    composer.addPass(bloomPass);

    // --- LIGHTING ---
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 4);
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

    // --- NOCTURNAL PLANE ---
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({
            color: 0x050505,
            roughness: 0.9,
            metalness: 0.1,
            dithering: true,
            transparent: true,
            opacity: 1.0
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);



    // --- BACKDROP SPHERE (Vertical Gradient Shader for Bloom compatibility) ---
    const backdropGeometry = new THREE.SphereGeometry(500, 32, 32);

    const backdropUniforms = {
        uHeight: { value: 200.0 },
        uOffset: { value: 50.0 },
        uColorTop: { value: new THREE.Color(0x1a1a1a) },
        uColorBottom: { value: new THREE.Color(0x000000) }
    };

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

    // --- SHARED MATERIAL ---
    const sharedMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0x222222,
        emissiveIntensity: 0,
        dithering: true
    });

    // --- GEOMETRY FACTORIES ---
    function createFragmentedGeometry() {
        const group = new THREE.Group();
        for (let i = 0; i < 5; i++) {
            const size = 0.3 + Math.random() * 0.5;
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(size, size * 2, size),
                sharedMaterial
            );
            box.position.set(
                (Math.random() - 0.5) * 1.5,
                Math.random() * 2,
                (Math.random() - 0.5) * 1.5
            );
            box.rotation.set(
                Math.random() * 0.5,
                Math.random() * Math.PI,
                Math.random() * 0.5
            );
            group.add(box);
        }
        return group;
    }

    function createPlatesGeometry() {
        const group = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(2, 0.15, 1.5),
                sharedMaterial
            );
            plate.position.y = i * 0.5;
            plate.position.x = (i % 2) * 0.3;
            group.add(plate);
        }
        return group;
    }

    function createTowerGeometry() {
        const group = new THREE.Group();
        // Main tower
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(1, 4, 1),
            sharedMaterial
        );
        tower.position.y = 2;
        group.add(tower);

        // Central cut (emissive gap)
        const gapMaterial = new THREE.MeshStandardMaterial({
            color: 0x080808,
            emissive: 0x334455,
            emissiveIntensity: 40
        });
        const gap = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.3, 0.3),
            gapMaterial
        );
        gap.position.y = 2;
        group.add(gap);

        return group;
    }

    function createOctahedronGeometry() {
        return new THREE.Mesh(
            new THREE.OctahedronGeometry(1, 0),
            sharedMaterial
        );
    }

    function createTetrahedronGeometry() {
        return new THREE.Mesh(
            new THREE.TetrahedronGeometry(1.2, 0),
            sharedMaterial
        );
    }

    // --- PROJECT LABEL FACTORY ---
    function createProjectLabel(project) {
        const container = document.createElement('div');
        container.className = 'project-tag';

        container.innerHTML = `
            <span class="project-tag__title">${project.title}</span>
            <div class="project-tag__line"></div>
            <div class="project-tag__meta">
                ${project.ref} • ${project.status}
            </div>
        `;

        container.dataset.projectId = project.id;

        const label = new CSS2DObject(container);
        label.userData.currentOpacity = 0;
        label.userData.targetOpacity = 0;

        return { object: label, element: container };
    }

    // --- NEON STRUT FACTORY ---
    function createStrut(vStart, vEnd, thickness) {
        const direction = new THREE.Vector3().subVectors(vEnd, vStart);
        const length = direction.length();

        const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: NEON_CONFIG.baseIntensity,
            toneMapped: false,
            fog: true
        });
        propMaterials.push(material);

        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.position.copy(vStart).add(vEnd).multiplyScalar(0.5);
        cylinder.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.clone().normalize()
        );
        return cylinder;
    }

    // --- VIDEO TEXTURE CACHE ---
    const textureCache = new Map();

    function getVideoTexture(url, rendererRef) {
        if (textureCache.has(url)) {
            return textureCache.get(url);
        }

        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.play().catch(err => console.warn(`[Showcase] Video autoplay blocked for ${url}:`, err));

        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        texture.colorSpace = THREE.SRGBColorSpace;

        if (rendererRef) {
            texture.anisotropy = rendererRef.capabilities.getMaxAnisotropy();
        }

        textureCache.set(url, texture);
        return texture;
    }

    // --- TECHNICAL BEACON FACTORY (Light only) ---

    function applyMatterStream(monolith, sourceTexture, config) {
        if (!monolith) return;
        monolith.userData.disposables = monolith.userData.disposables || [];

        const children = [];
        monolith.traverse(child => {
            if (child.isMesh) children.push(child);
        });

        const childCount = children.length;
        if (childCount === 0) return;

        const intensity = config.intensity ?? 2.0;

        // Grid Calculation
        const columns = Math.ceil(Math.sqrt(childCount));
        const rows = Math.ceil(childCount / columns);

        children.forEach((child, index) => {
            // UV Math
            const uOffset = (index % columns) / columns;
            const vOffset = Math.floor(index / columns) / rows;

            // Clone Texture for unique offset
            // We clone the object to have different offsets, but it shares the source (video)
            const childTexture = sourceTexture.clone();
            childTexture.repeat.set(1 / columns, 1 / rows);
            childTexture.offset.set(uOffset, vOffset);
            childTexture.generateMipmaps = false;
            childTexture.minFilter = THREE.LinearFilter;
            childTexture.magFilter = THREE.LinearFilter;

            monolith.userData.disposables.push(childTexture);

            // Create Material (Dark Matter)
            const material = new THREE.MeshStandardMaterial({
                color: 0x444444,
                roughness: 0.9,
                metalness: 0.1,
                emissive: 0xffffff,
                emissiveMap: childTexture,
                emissiveIntensity: 0,
                toneMapped: false,
                side: THREE.FrontSide
            });

            monolith.userData.disposables.push(material);

            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
        });
    }




    // --- BEACONS GROUP (World Space, independent from monolith rotation) ---


    // --- CREATE MONOLITHS ---
    // --- LOAD DATA & CREATE MONOLITHS ---
    // --- LOAD DATA & CREATE MONOLITHS ---
    async function loadProjectsData() {
        try {
            const response = await fetch('data/projects.json');
            const data = await response.json();
            const basePath = './assets/video/';

            data.projects.forEach(project => {
                let monolith;
                const position = new THREE.Vector3(project.position.x, project.position.y, project.position.z);

                // Instantiate Geometry based on type
                switch (project.geometry) {
                    case 'fragmented':
                        monolith = createFragmentedGeometry();
                        break;
                    case 'plates':
                        monolith = createPlatesGeometry();
                        break;
                    case 'tower':
                        monolith = createTowerGeometry();
                        break;
                    case 'octahedron':
                        monolith = createOctahedronGeometry();
                        break;
                    case 'tetrahedron':
                        monolith = createTetrahedronGeometry();
                        break;
                    default:
                        monolith = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), sharedMaterial);
                }

                monolith.position.copy(position);

                // DATA BINDING: Store all project data including INTENSITY for interaction
                monolith.userData = { ...project };

                // Get distinct video texture
                const videoUrl = basePath + (project.videoUrl || 'showcase-monolith.mp4');
                const projectTexture = getVideoTexture(videoUrl, renderer);

                // Apply Matter Stream System
                applyMatterStream(monolith, projectTexture, {
                    intensity: project.intensity
                });

                scene.add(monolith);
                monoliths.push(monolith);

                // --- CREATE PROJECT LABEL ---
                const labelData = createProjectLabel(project);
                labelData.object.position.set(0, 2.5, 0); // Offset above monolith
                monolith.add(labelData.object); // Parented to monolith
                projectLabels.push(labelData);
            });
            console.log(`[Showcase] Loaded ${data.projects.length} projects from JSON.`);

        } catch (err) {
            console.error('[Showcase] Failed to load projects data:', err);
        }
    }

    // Trigger Data Loading
    loadProjectsData();

    // --- NEON TETRAHEDRON PROPS ---
    propsGroup = new THREE.Group();
    const V0 = new THREE.Vector3(0, -4, 0);
    const V1 = new THREE.Vector3(4, 2, 0);
    const V2 = new THREE.Vector3(-2, 2, 3.46);
    const V3 = new THREE.Vector3(-2, 2, -3.46);

    const edges = [[V0, V1], [V0, V2], [V0, V3], [V1, V2], [V2, V3], [V3, V1]];
    edges.forEach(([a, b]) => propsGroup.add(createStrut(a, b, 0.08)));



    // --- VIDEO CORE (Custom BufferGeometry from neon vertices) ---
    // Calculate centroid for 98% inward scaling
    const centroid = new THREE.Vector3()
        .add(V0).add(V1).add(V2).add(V3)
        .multiplyScalar(0.25);

    // Clone and scale vertices 98% toward centroid
    const p0 = V0.clone().lerp(centroid, 0.2);
    const p1 = V1.clone().lerp(centroid, 0.2);
    const p2 = V2.clone().lerp(centroid, 0.2);
    const p3 = V3.clone().lerp(centroid, 0.2);

    // Define 4 triangular faces (3 vertices each, CCW winding)
    // Face 1 (Base): V1, V2, V3
    // Face 2: V0, V2, V1
    // Face 3: V0, V3, V2
    // Face 4: V0, V1, V3
    const positions = new Float32Array([
        // Face 1: Base (p1, p2, p3)
        p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
        // Face 2: (p0, p2, p1)
        p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z,
        // Face 3: (p0, p3, p2)
        p0.x, p0.y, p0.z, p3.x, p3.y, p3.z, p2.x, p2.y, p2.z,
        // Face 4: (p0, p1, p3)
        p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p3.x, p3.y, p3.z
    ]);

    // Strategic UV mapping: "Data Crystal" effect
    // Each face maps to a different quadrant of the video texture
    // Base triangle UVs (CCW winding: top-center, bottom-left, bottom-right)
    const baseTriUV = [
        [0.5, 1.0],  // top-center
        [0.0, 0.0],  // bottom-left
        [1.0, 0.0]   // bottom-right
    ];

    // Quadrant anchors (offsets) for each of the 4 faces
    const quadrantAnchors = [
        [0.0, 0.0],   // Face 1: top-left quadrant
        [0.5, 0.0],   // Face 2: top-right quadrant
        [0.0, 0.5],   // Face 3: bottom-left quadrant
        [0.5, 0.5]    // Face 4: bottom-right quadrant
    ];

    const uvScale = 0.45; // Scale to ~45% to fit within quadrant
    const jitterMax = 0.05; // Small random offset for organic feel

    // Build UV array: 4 faces × 3 vertices × 2 components
    const uvData = [];
    for (let face = 0; face < 4; face++) {
        const anchor = quadrantAnchors[face];
        // Add small random jitter per face (computed once at init)
        const jitterU = Math.random() * jitterMax;
        const jitterV = Math.random() * jitterMax;

        for (let vert = 0; vert < 3; vert++) {
            const [baseU, baseV] = baseTriUV[vert];
            // Scale, offset to quadrant, add jitter
            const u = baseU * uvScale + anchor[0] + jitterU;
            const v = baseV * uvScale + anchor[1] + jitterV;
            uvData.push(u, v);
        }
    }

    const uvs = new Float32Array(uvData);

    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    coreGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    coreGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage); // Enable frequent updates
    coreGeometry.computeVertexNormals(); // Vital for FogExp2 interaction

    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    // No position/rotation needed - geometry already aligned to neon vertices
    propsGroup.add(coreMesh);

    // --- OSCILLATION REFERENCE DATA (fixed references for animation, no allocations) ---
    const coreOscillation = {
        // Original neon vertices (fixed)
        refV0: { x: V0.x, y: V0.y, z: V0.z },
        refV1: { x: V1.x, y: V1.y, z: V1.z },
        refV2: { x: V2.x, y: V2.y, z: V2.z },
        refV3: { x: V3.x, y: V3.y, z: V3.z },
        // Centroid (fixed)
        cx: centroid.x,
        cy: centroid.y,
        cz: centroid.z,
        // Speed and phase offset per vertex (asymmetric)
        speeds: [1.2, 0.9, 1.5, 1.1],
        offsets: [0, 1.5, 3.0, 4.5],
        // Inward scale factor (20% lerp toward centroid)
        inwardLerp: 0.2
    };

    // --- LIGHTNING DISCHARGE SYSTEM ---
    const LIGHTNING_COUNT = 6; // Max concurrent discharges
    const LIGHTNING_SEGMENTS = 8; // Points per discharge (creates more jaggedness)

    const lightningMaterial = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['fog'],
            {
                uColor: { value: new THREE.Color(3.0, 3.5, 5.0) } // High intensity electric blue/white
            }
        ]),
        vertexShader: `
            #include <fog_pars_vertex>
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }
        `,
        fragmentShader: `
            #include <fog_pars_fragment>
            uniform vec3 uColor;
            void main() {
                // Base electric color
                gl_FragColor = vec4(uColor, 1.0);
                
                #include <fog_fragment>
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: true
    });

    // Pre-allocate geometry buffer for all lightning bolts
    // Each bolt: LIGHTNING_SEGMENTS lines × 2 points each × 3 components (x,y,z)
    const lightningPositions = new Float32Array(LIGHTNING_COUNT * LIGHTNING_SEGMENTS * 2 * 3);
    const lightningGeometry = new THREE.BufferGeometry();
    lightningGeometry.setAttribute('position', new THREE.BufferAttribute(lightningPositions, 3));
    lightningGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

    const lightningMesh = new THREE.LineSegments(lightningGeometry, lightningMaterial);
    lightningMesh.frustumCulled = false;
    propsGroup.add(lightningMesh);

    // Lightning state
    const lightningState = {
        active: false,
        flickerChance: 0.18, // Increased flicker frequency (was 0.10)
        // Reference to edges for random source point
        edges: edges,
        // Cached current core vertex positions (updated by updateCoreOscillation)
        coreVerts: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 }
        ]
    };

    propsGroup.position.set(0, 3, -80);
    scene.add(propsGroup);

    // --- RAYCASTER ---
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // --- MOUSE TRACKING (Desktop) ---
    let mouseWorld = new THREE.Vector3(0, 0, 0);

    function onMouseMove(event) {
        if (isZooming) return; // Block HUD/Light updates during zoom/return

        if (isDragging) {
            const dx = event.clientX - dragStart.x;
            const dy = event.clientY - dragStart.y;

            cameraRotation.targetY -= dx * DRAG_SENSITIVITY;
            cameraRotation.targetX -= dy * DRAG_SENSITIVITY;

            // Clamp rotation
            cameraRotation.targetY = Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, cameraRotation.targetY));
            cameraRotation.targetX = Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, cameraRotation.targetX));

            dragStart.x = event.clientX;
            dragStart.y = event.clientY;
        }

        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Project mouse to XZ plane for light position
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.setFromCamera(mouse, camera);
        raycaster.ray.intersectPlane(planeZ, mouseWorld);

        // Mouse light tracking (disabled for Beacons system)
        /*
        if (!isTouchDevice && typeof gsap !== 'undefined') {
            gsap.to(pointLight.position, {
                x: mouseWorld.x,
                z: mouseWorld.z,
                duration: 0.8,
                ease: "power2.out"
            });
        }
        */

        // Raycast for hover detection
        updateHoverState();
    }

    // --- BEACON HOVER STATE SYNC ---

    function updateBeaconHoverState(projectId, isHovered) {
        // Voltera Eases
        const EASE_IGNITION = "cubic-bezier(0.16, 1, 0.3, 1)"; // Voltera Inertia
        const EASE_DECAY = "power2.out"; // Exponential cooling

        const monolith = monoliths.find(m => m.userData.id === projectId);
        if (monolith) {
            // Set selection immediately
            if (isHovered && outlinePass.selectedObjects[0] !== monolith) {
                outlinePass.selectedObjects = [monolith];
            }

            if (typeof gsap !== 'undefined') {
                // Collect materials from direct children or fallback to stored activeMaterials (though we use disposables mostly now)
                // Better to traverse to find our Matter Stream materials
                const materials = [];
                monolith.traverse(child => {
                    if (child.isMesh && child.material) materials.push(child.material);
                });

                const targetIntensity = isHovered ? (monolith.userData.intensity ?? 2.0) : 0;
                const duration = isHovered ? 0.6 : 1.5;
                const ease = isHovered ? EASE_IGNITION : EASE_DECAY;

                // Animate Emissive Intensity (Ignition / Cooling)
                gsap.to(materials, {
                    emissiveIntensity: targetIntensity,
                    duration: duration,
                    ease: ease,
                    overwrite: true
                });

                // Outline Strength Animation & VLT_BREATH Physics
                if (isHovered) {
                    gsap.to(outlinePass, {
                        edgeStrength: 2.5,
                        duration: 0.6,
                        ease: EASE_IGNITION,
                        overwrite: true
                    });

                    // --- VLT_BREATH: Hover Enter ---
                    // Safety check to prevent overlaps
                    if (monolith.userData.breathTimeline) monolith.userData.breathTimeline.kill();

                    // Create infinite breathing timeline
                    monolith.userData.breathTimeline = gsap.timeline({ repeat: -1, yoyo: true });
                    monolith.userData.breathTimeline.to(monolith.scale, {
                        x: 1.05,
                        y: 1.05,
                        z: 1.05,
                        duration: 2.0,
                        ease: "sine.inOut",
                        overwrite: 'auto'
                    });

                } else {
                    if (outlinePass.selectedObjects[0] === monolith) {
                        gsap.to(outlinePass, {
                            edgeStrength: 0.0,
                            duration: 0.4,
                            ease: "power2.out",
                            overwrite: true
                        });
                    }

                    // --- VLT_BREATH: Hover Exit ---
                    // Kill breathing timeline immediately
                    if (monolith.userData.breathTimeline) {
                        monolith.userData.breathTimeline.kill();
                        monolith.userData.breathTimeline = null;
                    }

                    // Restore natural scale smoothly
                    gsap.to(monolith.scale, {
                        x: 1.0,
                        y: 1.0,
                        z: 1.0,
                        duration: 1.5,
                        ease: "power2.out",
                        overwrite: 'auto'
                    });
                }
            }
        }

        // 2. Label Technical Brackets (HUD)
        projectLabels.forEach(label => {
            if (label.element.dataset.projectId === projectId) {
                label.element.classList.toggle('is-active', isHovered);
            }
        });
    }

    function updateHoverState() {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(monoliths, true);

        // --- SMART INTERRUPTION (System Blink) ---
        if (intersects.length > 0 && pulseTimeline && pulseTimeline.isActive()) {
            pulseTimeline.kill();
            pulseTimeline = null;
            outlinePass.selectedObjects = [];
            outlinePass.edgeStrength = 0;
        }

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            // Traverse up to find the group/mesh with userData
            while (obj.parent && !obj.userData.id) {
                obj = obj.parent;
            }

            if (obj.userData.id && currentHoveredMonolith !== obj) {
                // Unhover previous
                if (currentHoveredMonolith) {
                    updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
                }
                currentHoveredMonolith = obj;
                showHUD(obj.userData);
                updateBeaconHoverState(obj.userData.id, true);
            }
        } else if (currentHoveredMonolith) {
            updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
            currentHoveredMonolith = null;
            hideHUD();
        }
    }

    // --- HUD CONTROLS ---
    function showHUD(data) {
        if (!hud || !hudRef || !hudStatus) return;
        hudRef.textContent = data.ref;
        hudStatus.textContent = data.status;
        hud.classList.add('active');
    }

    function hideHUD() {
        if (!hud) return;
        hud.classList.remove('active');
    }

    // --- CLICK / TAP HANDLING ---
    let tapStartTime = 0;
    let tapStartPos = { x: 0, y: 0 };

    function onPointerDown(event) {
        tapStartTime = Date.now();
        tapStartPos.x = event.clientX;
        tapStartPos.y = event.clientY;

        if (!isTouchDevice && !isZooming) {
            isDragging = true;
            dragStart.x = event.clientX;
            dragStart.y = event.clientY;
            container.style.cursor = 'grabbing';
        }
    }

    function onPointerUp(event) {
        isDragging = false;
        container.style.cursor = 'grab';

        const tapDuration = Date.now() - tapStartTime;
        const tapDistance = Math.hypot(
            event.clientX - tapStartPos.x,
            event.clientY - tapStartPos.y
        );

        // Debounce: only trigger if quick tap without much movement
        if (tapDuration < 300 && tapDistance < 10) {
            handleClick(event);
        }
    }

    function handleClick(event) {
        if (isZooming) return;

        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(monoliths, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) {
                obj = obj.parent;
            }

            if (obj.userData.id) {
                zoomToProject(obj);
            }
        }
    }

    // --- DOLLY ZOOM ---
    function zoomToProject(monolith) {
        if (!projectDetail) return; // Only strictly needed for internal checks, UI handles the DOM

        // Save current camera position before zoom
        cameraSnapshot.copy(camera.position);

        isZooming = true;

        const targetPos = monolith.position.clone();
        targetPos.z += 5;
        targetPos.y += 1;

        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z,
                duration: 1.5,
                ease: VOLTERA_EASE,
                onComplete: () => {
                    // Dispatch Global Event acting as "Project Select"
                    window.dispatchEvent(new CustomEvent('vltProjectSelect', { detail: monolith.userData }));
                }
            });
        }
    }

    function resetCamera() {
        // Smooth return to snapshot
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: cameraSnapshot.x,
                y: cameraSnapshot.y,
                z: cameraSnapshot.z,
                duration: 1.2,
                ease: VOLTERA_EASE,
                onComplete: () => {
                    isZooming = false;
                    // Sync with scroll only after animation finishes to prevent jumps
                    updateCameraFromScroll();
                }
            });
        } else {
            // Fallback
            isZooming = false;
            updateCameraFromScroll();
        }
    }



    // --- SYNCHRONIZED SYSTEM BLINK ---
    function triggerSystemBlink() {
        if (typeof gsap === 'undefined') return;

        // Select ALL monoliths immediately (synchronized)
        outlinePass.selectedObjects = monoliths;

        pulseTimeline = gsap.timeline({
            onComplete: () => {
                outlinePass.selectedObjects = [];
                pulseTimeline = null;
            }
        })
            .to(outlinePass, { edgeStrength: 4.0, duration: 0.1 })
            .to(outlinePass, { edgeStrength: 1.0, duration: 0.2 })
            .to(outlinePass, { edgeStrength: 4.0, duration: 0.1 })
            .to(outlinePass, { edgeStrength: 0.0, duration: 2.0, ease: EASE_ACTIVE });
    }

    // --- SCROLL-DRIVEN CAMERA ---
    function updateCameraFromScroll() {
        const rect = section.getBoundingClientRect();
        const sectionHeight = section.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;

        scrollProgress = Math.max(0, Math.min(1, scrolled / sectionHeight));

        // Trigger Wave Pulse
        if (scrollProgress > 0.0001 && !pulseTriggered) {
            triggerSystemBlink();
            pulseTriggered = true;
        }

        // --- GROUND FADE LOGIC ---
        const fadeStart = TRAVEL_CONFIG.travelFinishThreshold; // 0.8
        const fadeEnd = 0.95;
        let groundAlpha = 1.0;

        if (scrollProgress >= fadeStart) {
            // Rimappa il progresso nel range 0-1 per la finestra di dissolvenza
            const fadeProgress = (scrollProgress - fadeStart) / (fadeEnd - fadeStart);
            groundAlpha = Math.max(0, 1 - fadeProgress);
        }

        if (ground && ground.material) {
            ground.material.opacity = groundAlpha;
        }

        if (!isZooming) {
            const { startZ, endZ, travelFinishThreshold } = TRAVEL_CONFIG;
            let targetZ;

            if (scrollProgress < travelFinishThreshold) {
                // Normalized travel progress (0 to 1 within travel range)
                const travelProgress = scrollProgress / travelFinishThreshold;

                // Apply easeOutQuad for smooth damping approaching endZ
                const easedProgress = 1 - (1 - travelProgress) * (1 - travelProgress);
                targetZ = startZ + (endZ - startZ) * easedProgress;
            } else {
                // Buffer zone: camera stays fixed at endZ
                targetZ = endZ;
            }

            camera.position.z = targetZ;




            // Mobile: Check for monolith proximity for HUD
            if (isTouchDevice) {
                checkMobileHUDTrigger();
            }
        }
    }

    function checkMobileHUDTrigger() {
        // Find monolith closest to camera Z position
        let closestMonolith = null;
        let closestDist = Infinity;

        monoliths.forEach(m => {
            const dist = Math.abs(m.position.z - camera.position.z);
            if (dist < closestDist && dist < 8) {
                closestDist = dist;
                closestMonolith = m;
            }
        });

        if (closestMonolith && closestMonolith !== currentHoveredMonolith) {
            // Mobile "Lock-on" - Deactivate previous
            if (currentHoveredMonolith) {
                updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
            }

            currentHoveredMonolith = closestMonolith;
            showHUD(closestMonolith.userData);

            // Activate new "Lock-on"
            updateBeaconHoverState(closestMonolith.userData.id, true);

        } else if (!closestMonolith && currentHoveredMonolith) {
            updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
            currentHoveredMonolith = null;
            hideHUD();
        }
    }

    // --- EVENT LISTENERS ---
    if (!isTouchDevice) {
        container.addEventListener('mousemove', onMouseMove);
    }
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);



    window.addEventListener('scroll', updateCameraFromScroll);

    // --- RESIZE ---
    ResizeManager.subscribe(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        composer.setSize(width, height);
        if (labelRenderer) {
            labelRenderer.setSize(width, height);
        }
        if (outlinePass) {
            outlinePass.setSize(width, height);
        }
    });

    // --- CORE OSCILLATION UPDATE (optimized: no allocations in loop) ---
    function updateCoreOscillation(time) {
        const posArr = coreGeometry.attributes.position.array;
        const { refV0, refV1, refV2, refV3, cx, cy, cz, speeds, offsets, inwardLerp } = coreOscillation;
        const refs = [refV0, refV1, refV2, refV3];

        // Temporary storage for oscillated + inward-scaled vertices (reused each frame)
        let ox0, oy0, oz0, ox1, oy1, oz1, ox2, oy2, oz2, ox3, oy3, oz3;

        // Calculate oscillated positions for each vertex
        for (let i = 0; i < 4; i++) {
            const ref = refs[i];
            // Oscillation factor: 0.2 to 0.8
            const factor = 0.5 + Math.sin(time * speeds[i] + offsets[i]) * 0.3;
            // Glitch: small random disturbance
            const glitch = (Math.random() - 0.5) * 0.05;

            // Lerp from original vertex toward centroid by factor, add glitch
            const oscX = ref.x + (cx - ref.x) * factor + glitch;
            const oscY = ref.y + (cy - ref.y) * factor + glitch;
            const oscZ = ref.z + (cz - ref.z) * factor + glitch;

            // Apply inward scaling (20% lerp toward centroid)
            const finalX = oscX + (cx - oscX) * inwardLerp;
            const finalY = oscY + (cy - oscY) * inwardLerp;
            const finalZ = oscZ + (cz - oscZ) * inwardLerp;

            // Store in temp variables
            if (i === 0) { ox0 = finalX; oy0 = finalY; oz0 = finalZ; }
            else if (i === 1) { ox1 = finalX; oy1 = finalY; oz1 = finalZ; }
            else if (i === 2) { ox2 = finalX; oy2 = finalY; oz2 = finalZ; }
            else { ox3 = finalX; oy3 = finalY; oz3 = finalZ; }
        }

        // Write directly to position buffer (12 vertices = 4 faces × 3 verts)
        // Face 1: Base (p1, p2, p3)
        posArr[0] = ox1; posArr[1] = oy1; posArr[2] = oz1;
        posArr[3] = ox2; posArr[4] = oy2; posArr[5] = oz2;
        posArr[6] = ox3; posArr[7] = oy3; posArr[8] = oz3;
        // Face 2: (p0, p2, p1)
        posArr[9] = ox0; posArr[10] = oy0; posArr[11] = oz0;
        posArr[12] = ox2; posArr[13] = oy2; posArr[14] = oz2;
        posArr[15] = ox1; posArr[16] = oy1; posArr[17] = oz1;
        // Face 3: (p0, p3, p2)
        posArr[18] = ox0; posArr[19] = oy0; posArr[20] = oz0;
        posArr[21] = ox3; posArr[22] = oy3; posArr[23] = oz3;
        posArr[24] = ox2; posArr[25] = oy2; posArr[26] = oz2;
        // Face 4: (p0, p1, p3)
        posArr[27] = ox0; posArr[28] = oy0; posArr[29] = oz0;
        posArr[30] = ox1; posArr[31] = oy1; posArr[32] = oz1;
        posArr[33] = ox3; posArr[34] = oy3; posArr[35] = oz3;

        // Update lightning state with current oscillated vertices
        lightningState.coreVerts[0].x = ox0; lightningState.coreVerts[0].y = oy0; lightningState.coreVerts[0].z = oz0;
        lightningState.coreVerts[1].x = ox1; lightningState.coreVerts[1].y = oy1; lightningState.coreVerts[1].z = oz1;
        lightningState.coreVerts[2].x = ox2; lightningState.coreVerts[2].y = oy2; lightningState.coreVerts[2].z = oz2;
        lightningState.coreVerts[3].x = ox3; lightningState.coreVerts[3].y = oy3; lightningState.coreVerts[3].z = oz3;

        // Flag GPU update
        coreGeometry.attributes.position.needsUpdate = true;
        // Recalculate normals for proper fog/reflection interaction
        coreGeometry.computeVertexNormals();
    }

    // --- LIGHTNING PATH GENERATOR (no allocations) ---
    function generateLightningPath(boltIndex) {
        const posArr = lightningGeometry.attributes.position.array;
        // baseIdx: boltIndex * segments * 2 points * 3 floats
        const baseIdx = boltIndex * LIGHTNING_SEGMENTS * 6;

        // Pick random edge and random point along it
        const edgeIdx = Math.floor(Math.random() * lightningState.edges.length);
        const [edgeA, edgeB] = lightningState.edges[edgeIdx];
        const t = Math.random();
        const startX = edgeA.x + (edgeB.x - edgeA.x) * t;
        const startY = edgeA.y + (edgeB.y - edgeA.y) * t;
        const startZ = edgeA.z + (edgeB.z - edgeA.z) * t;

        // Pick random core vertex as target
        const targetVert = lightningState.coreVerts[Math.floor(Math.random() * 4)];
        const endX = targetVert.x;
        const endY = targetVert.y;
        const endZ = targetVert.z;

        let prevX = startX;
        let prevY = startY;
        let prevZ = startZ;

        // Generate connected path
        for (let i = 0; i < LIGHTNING_SEGMENTS; i++) {
            const segT = (i + 1) / LIGHTNING_SEGMENTS;

            // Calculate next point base positioning
            let nextX = startX + (endX - startX) * segT;
            let nextY = startY + (endY - startY) * segT;
            let nextZ = startZ + (endZ - startZ) * segT;

            // Add jagged offset (except for the final target vertex)
            if (i < LIGHTNING_SEGMENTS - 1) {
                const jitter = 0.4; // Slightly increased for more electricity feel
                nextX += (Math.random() - 0.5) * jitter;
                nextY += (Math.random() - 0.5) * jitter;
                nextZ += (Math.random() - 0.5) * jitter;
            } else {
                // Ensure last segment snaps exactly to core
                nextX = endX; nextY = endY; nextZ = endZ;
            }

            const idx = baseIdx + i * 6;
            // Point 1 (Start of segment)
            posArr[idx] = prevX;
            posArr[idx + 1] = prevY;
            posArr[idx + 2] = prevZ;
            // Point 2 (End of segment)
            posArr[idx + 3] = nextX;
            posArr[idx + 4] = nextY;
            posArr[idx + 5] = nextZ;

            // Move the pointer for the next segment to touch exactly this one
            prevX = nextX;
            prevY = nextY;
            prevZ = nextZ;
        }
    }

    // --- LIGHTNING UPDATE (flicker logic) ---
    function updateLightning() {
        const shouldFlicker = Math.random() < lightningState.flickerChance;

        if (shouldFlicker) {
            // Generate new paths for all bolts
            for (let i = 0; i < LIGHTNING_COUNT; i++) {
                generateLightningPath(i);
            }
            lightningGeometry.attributes.position.needsUpdate = true;
            lightningMesh.visible = true;
        } else {
            lightningMesh.visible = false;
        }
    }

    // --- LABEL OPACITY CALCULATION (Distance-based with Voltera Inertia) ---
    const LABEL_VISIBILITY = {
        fadeInStart: 25,   // opacity 0 above this distance
        fadeInEnd: 10,     // opacity 1 below this distance
        inertiaFactor: 0.08 // Smooth interpolation (expo.out feel)
    };
    const labelWorldPos = new THREE.Vector3(); // Reusable vector (no allocations)

    function updateLabelOpacity(labelData, cameraPos) {
        labelData.object.getWorldPosition(labelWorldPos);

        const distance = cameraPos.distanceTo(labelWorldPos);

        // Calculate target opacity based on distance
        let targetOpacity;
        if (distance >= LABEL_VISIBILITY.fadeInStart) {
            targetOpacity = 0;
        } else if (distance <= LABEL_VISIBILITY.fadeInEnd) {
            targetOpacity = 1;
        } else {
            // Linear interpolation between fade points
            targetOpacity = 1 - (distance - LABEL_VISIBILITY.fadeInEnd) /
                (LABEL_VISIBILITY.fadeInStart - LABEL_VISIBILITY.fadeInEnd);
        }

        // Check if behind camera (Z-axis perspective exit)
        if (labelWorldPos.z > cameraPos.z + 5) {
            targetOpacity = 0;
        }

        // Apply Voltera inertia (expo.out-like smoothing)
        const current = labelData.object.userData.currentOpacity;
        const newOpacity = current + (targetOpacity - current) * LABEL_VISIBILITY.inertiaFactor;
        labelData.object.userData.currentOpacity = newOpacity;

        // Apply to DOM element
        labelData.element.style.opacity = newOpacity.toFixed(3);
    }

    // --- ANIMATION LOOP ---
    function animate() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);

        const time = performance.now() * 0.001; // Convert to seconds

        // Slow rotation for monoliths
        monoliths.forEach((m, i) => {
            m.rotation.y += 0.001 * (i % 2 === 0 ? 1 : -1);
        });

        // Props rotation (Y-axis only)
        propsGroup.rotation.y += 0.001;


        // --- CORE OSCILLATION ---
        updateCoreOscillation(time);

        // --- LIGHTNING FLICKER ---
        updateLightning();



        // --- UPDATE LABEL VISIBILITY ---
        projectLabels.forEach(labelData => {
            updateLabelOpacity(labelData, camera.position);
        });

        // --- RENDER CSS2D LAYER ---
        if (labelRenderer) {
            labelRenderer.render(scene, camera);
        }

        // --- APPLY MOUSE DRAG ROTATION ---
        // Smooth interpolation
        cameraRotation.currentX += (cameraRotation.targetX - cameraRotation.currentX) * 0.1;
        cameraRotation.currentY += (cameraRotation.targetY - cameraRotation.currentY) * 0.1;

        // Apply rotation on top of base quaternion
        if (!isZooming) {
            camera.quaternion.copy(initialCameraQuaternion);
            camera.rotateY(cameraRotation.currentY);
            camera.rotateX(cameraRotation.currentX);
        }

        composer.render();
    }

    // Initial scroll position
    updateCameraFromScroll();

    console.log('[Showcase] The Infinite Map initialized');

    return {
        start: () => {
            if (!isRunning) {
                isRunning = true;
                animate();
            }
        },
        stop: () => {
            isRunning = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;

            // Dispose resources
            monoliths.forEach(monolith => {
                if (monolith.userData.disposables) {
                    monolith.userData.disposables.forEach(resource => {
                        if (resource.dispose) resource.dispose();
                    });
                    monolith.userData.disposables = [];
                }
                // Dispose mesh geometry/materials if needed, but geometries are shared/factory based
            });
            console.log('[Showcase] Scene stopped and resources disposed');
        }
    };

}
