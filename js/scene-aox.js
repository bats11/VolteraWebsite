import * as THREE from 'three';

/**
 * AOX Core 3D Scene
 * 50,000 particle sphere with holographic effect
 * @param {Array} resizeCallbacks - Global resize callbacks array
 */
export function initAoxCore(resizeCallbacks) {
    // --- CONSTANTS ---
    const COUNT = 50000;
    const PHI = Math.PI * (3 - Math.sqrt(5));  // Golden angle
    const SPHERE_RADIUS = 3.5;

    // --- VARIABLES ---
    let scene, camera, renderer;
    let pointCloud, geometry, material;
    let targetState = null;

    const container = document.getElementById('aox-canvas-container');
    if (!container) return;

    // --- SCENE SETUP ---
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 12);
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

    // Copy to basePositions (anchor for future morphing)
    basePositions.set(positions);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('basePosition', new THREE.BufferAttribute(basePositions, 3));

    // --- MATERIAL: Holographic Additive Blending ---
    material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.015,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    // --- POINT CLOUD ---
    pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    // --- EVENT LISTENER: aoxStateChange ---
    window.addEventListener('aoxStateChange', (e) => {
        targetState = e.detail.ambito;
        console.log(`Scena 3D: Ricevuto comando per ambito ${targetState}`);
        transitionToState(targetState);
    });

    /**
     * Transition to state - changes color/opacity on hover
     */
    function transitionToState(state) {
        if (state) {
            // Platinum azure tint
            material.color.setHex(0xc8e0f0);
            material.opacity = 0.75;
        } else {
            // Default white
            material.color.setHex(0xffffff);
            material.opacity = 0.6;
        }
    }

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
        requestAnimationFrame(animate);
        const time = performance.now() * 0.001;

        // Ultra-slow Y rotation
        pointCloud.rotation.y += 0.001;

        // Pulsation + Jitter
        const posAttr = geometry.getAttribute('position');
        const baseAttr = geometry.getAttribute('basePosition');
        const pulse = 1 + Math.sin(time * 0.8) * 0.02;

        for (let i = 0; i < COUNT; i++) {
            const jitterX = (Math.random() - 0.5) * 0.002;
            const jitterY = (Math.random() - 0.5) * 0.002;
            const jitterZ = (Math.random() - 0.5) * 0.002;

            posAttr.array[i * 3] = baseAttr.array[i * 3] * pulse + jitterX;
            posAttr.array[i * 3 + 1] = baseAttr.array[i * 3 + 1] * pulse + jitterY;
            posAttr.array[i * 3 + 2] = baseAttr.array[i * 3 + 2] * pulse + jitterZ;
        }
        posAttr.needsUpdate = true;

        renderer.render(scene, camera);
    }
    animate();
}
