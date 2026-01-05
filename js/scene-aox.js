import * as THREE from 'three';

/**
 * AOX Core 3D Scene - Morphing Particle System
 * 50,000 particles with holographic effect and JSON-based morph targets
 * @param {Array} resizeCallbacks - Global resize callbacks array
 */
export async function initAoxCore(resizeCallbacks) {
    // --- CONSTANTS ---
    const COUNT = 50000;
    const PHI = Math.PI * (3 - Math.sqrt(5));  // Golden angle
    const SPHERE_RADIUS = 3.5;

    // --- CAMERA SCALE CONFIG ---
    const BASE_Z = 11;
    const MAX_Z = 30;                  // Limite sicurezza per aspect estremi
    const THRESHOLD_ASPECT = 0.86;
    const RETREAT_SENSITIVITY = 1.0;   // >1 = arretramento più aggressivo

    // --- VARIABLES ---
    let scene, camera, renderer;
    let pointCloud, geometry, shaderMaterial;
    let isRunning = false;
    let rafId = null;

    const container = document.getElementById('aox-canvas-container');
    if (!container) return;

    // --- MORPH TARGETS: Load JSON files with silent fail ---
    const morphTargets = {};
    const ambitoFiles = ['brand', 'spazi', 'web', 'sistemi', 'immersive'];

    for (const ambito of ambitoFiles) {
        try {
            const response = await fetch(`./data/aox/${ambito}.json`);
            if (response.ok) {
                const data = await response.json();
                morphTargets[ambito] = new Float32Array(data.points);
                console.log(`[AOX] Caricato: ${ambito}.json (${data.count} punti)`);
            } else {
                console.log(`[AOX] Info: ${ambito}.json non trovato, morphing disattivato`);
            }
        } catch (e) {
            console.log(`[AOX] Info: ${ambito}.json non trovato, morphing disattivato`);
        }
    }

    // --- SCENE SETUP ---
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, BASE_Z);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // --- GEOMETRY: Fibonacci Sphere Distribution ---
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const basePositions = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
        const y = 1 - (i / (COUNT - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = PHI * i;

        positions[i * 3] = Math.cos(theta) * radius * SPHERE_RADIUS;
        positions[i * 3 + 1] = y * SPHERE_RADIUS;
        positions[i * 3 + 2] = Math.sin(theta) * radius * SPHERE_RADIUS;
    }

    // Copy to basePositions
    basePositions.set(positions);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // targetPosition: DynamicDrawUsage for frequent updates
    const targetPositionAttr = new THREE.BufferAttribute(basePositions.slice(), 3);
    targetPositionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('targetPosition', targetPositionAttr);

    // --- SHADER MATERIAL ---
    const vertexShader = `
        uniform float uTransition;
        uniform float uTime;
        attribute vec3 sourcePosition;
        attribute vec3 targetPosition;

        void main() {
            float t = uTime;
            t *= 0.3; // Rallentamento etereo (Living Flame Slow Motion)
            
            // === LIVING FLAME: Turbolenza Materica ===
            
            // Strato 1-3: Oscillazioni primarie (bassa/media frequenza)
            vec3 vTurbulence = vec3(
                sin(t * 1.3 + sourcePosition.y * 2.1) * cos(t * 0.7 + sourcePosition.z * 1.9),
                cos(t * 2.7 + sourcePosition.x * 1.7) * sin(t * 1.1 + sourcePosition.z * 2.3),
                sin(t * 3.1 + sourcePosition.x * 2.5) * cos(t * 0.9 + sourcePosition.y * 1.3)
            );
            
            // Strato 4: Micro-jitter plasma ad alta frequenza (POTENZIATO)
            vec3 microJitter = vec3(
                sin(t * 7.5 + sourcePosition.x * 10.0),
                sin(t * 8.3 + sourcePosition.y * 9.0),
                sin(t * 6.9 + sourcePosition.z * 11.0)
            ) * 0.25;
            
            vTurbulence += microJitter;
            
            vTurbulence += microJitter;
            
            // Gradiente hFactor UNIFORME: 1.0 su tutta la sfera (base = cima)
            float hFactor = 1.0;
            
            // Deriva termica UNIFORME: spinta costante verso l'alto su tutto il volume
            vTurbulence.y += hFactor * 0.2;
            
            // Ampiezza BILANCIATA (0.40) per gestire densità su 50k particelle
            // + contenimento magnetico invariato
            float amplitude = 0.40;
            float radialDist = length(sourcePosition);
            float containment = 1.0 - smoothstep(2.5, 3.5, radialDist) * 0.4;
            
            vTurbulence *= amplitude * hFactor * containment;
            
            // === MORPHING ===
            
            // Morphing fluido: source → target
            vec3 mixedPos = mix(sourcePosition, targetPosition, uTransition);
            
            // Applicazione turbolenza con fade-out durante transizione
            mixedPos += vTurbulence * (1.0 - uTransition);

            vec4 mvPosition = modelViewMatrix * vec4(mixedPos, 1.0);
            
            // Dimensione particella con attenuazione prospettica + leggera variazione
            float sizeVariation = 1.0 + (vTurbulence.x + vTurbulence.y) * 2.0 * (1.0 - uTransition);
            gl_PointSize = (15.0 / -mvPosition.z) * sizeVariation;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const fragmentShader = `
        uniform vec3 uColor;

        void main() {
            // Trasforma i quadrati in cerchi perfetti e sfumati
            float dist = distance(gl_PointCoord, vec2(0.5));
            if (dist > 0.5) discard;
            
            // Gradiente radiale per l'effetto glow olografico
            float strength = 1.0 - (dist * 2.0);
            strength = pow(strength, 2.5);
            
            gl_FragColor = vec4(uColor, strength * 1.5);
        }
    `;

    shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTransition: { value: 0.0 },
            uTime: { value: 0.0 },
            uColor: { value: new THREE.Color(0xc8e0f0) }
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    // --- POINT CLOUD ---
    pointCloud = new THREE.Points(geometry, shaderMaterial);
    scene.add(pointCloud);

    // --- SMOOTH TRANSITION STATE ---
    // sourcePosition: posizione di partenza per l'interpolazione (catturata al momento del cambio)
    const sourcePositionAttr = new THREE.BufferAttribute(basePositions.slice(), 3);
    sourcePositionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('sourcePosition', sourcePositionAttr);

    // Aggiorna lo shader uniform per usare sourcePosition
    shaderMaterial.uniforms.uTransition.value = 0.0;

    /**
     * Cattura la posizione CORRENTE di ogni particella basata sul progresso attuale
     * e la imposta come nuovo punto di partenza (sourcePosition)
     */
    function captureCurrentState() {
        const sourceAttr = geometry.getAttribute('sourcePosition');
        const targetAttr = geometry.getAttribute('targetPosition');
        const t = shaderMaterial.uniforms.uTransition.value;

        // Interpola la posizione corrente: mix(source, target, t)
        for (let i = 0; i < COUNT * 3; i++) {
            sourceAttr.array[i] = sourceAttr.array[i] * (1 - t) + targetAttr.array[i] * t;
        }
        sourceAttr.needsUpdate = true;
    }

    // --- EVENT LISTENER: aoxStateChange ---
    window.addEventListener('aoxStateChange', (e) => {
        const ambito = e.detail.ambito;
        console.log(`[AOX] Scena 3D: Ricevuto comando per ambito ${ambito}`);

        // SICUREZZA: Ferma qualsiasi animazione in corso (evita conflitti su tablet)
        gsap.killTweensOf(shaderMaterial.uniforms.uTransition);

        const sourceAttr = geometry.getAttribute('sourcePosition');
        const targetAttr = geometry.getAttribute('targetPosition');
        const currentT = shaderMaterial.uniforms.uTransition.value;

        if (ambito && morphTargets[ambito]) {
            // === ATTIVAZIONE PROGETTO ===
            // Cattura posizione attuale in sourcePosition
            captureCurrentState();

            // Imposta targetPosition con morph target
            targetAttr.array.set(morphTargets[ambito]);
            targetAttr.needsUpdate = true;

            // Reset e anima 0 → 1 (turbolenza si spegne)
            shaderMaterial.uniforms.uTransition.value = 0.0;
            gsap.to(shaderMaterial.uniforms.uTransition, {
                value: 1.0,
                duration: 1.5,
                ease: "expo.out"
            });
        } else {
            // === RITORNO ALLA SFERA (CRITICO) ===
            // Calcola manualmente posizione attuale e salvala in targetPosition
            for (let i = 0; i < COUNT * 3; i++) {
                targetAttr.array[i] = sourceAttr.array[i] * (1 - currentT) + targetAttr.array[i] * currentT;
            }
            targetAttr.needsUpdate = true;

            // Imposta sourcePosition con la sfera originale
            sourceAttr.array.set(basePositions);
            sourceAttr.needsUpdate = true;

            // Forza uTransition a 1.0 e anima verso 0.0 (turbolenza si riattiva)
            shaderMaterial.uniforms.uTransition.value = 1.0;
            gsap.to(shaderMaterial.uniforms.uTransition, {
                value: 0.0,
                duration: 1.8,
                ease: "power4.out"
            });
        }
    });

    // --- RESIZE ---
    resizeCallbacks.push(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        // Camera-scaling con limite MAX_Z (Vision-First)
        if (aspect < THRESHOLD_ASPECT) {
            const diff = (THRESHOLD_ASPECT / aspect) - 1;
            camera.position.z = Math.min(MAX_Z, BASE_Z * (1 + (diff * RETREAT_SENSITIVITY)));
        } else {
            camera.position.z = BASE_Z;
        }

        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });

    // --- ANIMATION LOOP ---
    function animate() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);

        // Update uTime uniform for shader breathing effect
        shaderMaterial.uniforms.uTime.value = performance.now() * 0.001;

        // Ultra-slow Y rotation
        pointCloud.rotation.y += 0.002;

        renderer.render(scene, camera);
    }

    return {
        start: () => {
            if (isRunning) return;
            isRunning = true;
            animate();
            console.log('[AOX] Scene started');
        },
        stop: () => {
            isRunning = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            console.log('[AOX] Scene stopped');
        }
    };
}
