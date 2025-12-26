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
    camera.position.set(0, 0, 11);
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
        attribute vec3 targetPosition;

        void main() {
            // Morphing tra la sfera (position) e il target caricato (targetPosition)
            vec3 mixedPos = mix(position, targetPosition, uTransition);
            
            // Effetto "Senziente": Jitter casuale e respiro organico
            float noise = sin(uTime * 2.0 + position.y * 5.0) * 0.02;
            mixedPos += noise * (1.0 - uTransition * 0.5); 

            vec4 mvPosition = modelViewMatrix * vec4(mixedPos, 1.0);
            
            // Dimensione particella con attenuazione prospettica
            gl_PointSize = (15.0 / -mvPosition.z) * (1.0 + noise * 10.0);
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
            strength = pow(strength, 3.0);
            
            gl_FragColor = vec4(uColor, strength * 0.8);
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

    // --- EVENT LISTENER: aoxStateChange ---
    window.addEventListener('aoxStateChange', (e) => {
        const ambito = e.detail.ambito;
        console.log(`[AOX] Scena 3D: Ricevuto comando per ambito ${ambito}`);

        if (ambito && morphTargets[ambito]) {
            // Update targetPosition with morph target data
            const targetAttr = geometry.getAttribute('targetPosition');
            targetAttr.array.set(morphTargets[ambito]);
            targetAttr.needsUpdate = true;

            // Animate transition 0 → 1
            gsap.to(shaderMaterial.uniforms.uTransition, {
                value: 1.0,
                duration: 1.5,
                ease: "expo.out"
            });
        } else {
            // Return to sphere (transition → 0)
            gsap.to(shaderMaterial.uniforms.uTransition, {
                value: 0.0,
                duration: 1.5,
                ease: "expo.out"
            });
        }
    });

    // --- RESIZE ---
    resizeCallbacks.push(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
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
