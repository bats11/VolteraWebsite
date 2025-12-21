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
        pointCloud.rotation.y += 0.002;

        const posAttr = geometry.getAttribute('position');
        const baseAttr = geometry.getAttribute('basePosition');

        // Morphing parameters - SLOWER BUT DEEPER
        const waveFreq = 0.4;  // Lower frequency for larger waves
        const waveAmp = 0.8;   // Much higher amplitude for consistent deformation
        const slowTime = time * 0.3; // Slow down the wave movement
        const pulse = 1 + Math.sin(slowTime * 1.5) * 0.05;

        for (let i = 0; i < COUNT; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;

            const bx = baseAttr.array[ix];
            const by = baseAttr.array[iy];
            const bz = baseAttr.array[iz];

            // 3D Noise-like wave combination using slowTime
            const noise = Math.sin(bx * waveFreq + slowTime) *
                Math.cos(by * waveFreq + slowTime * 0.8) *
                Math.sin(bz * waveFreq + slowTime * 1.2);

            const displacement = noise * waveAmp;

            // Micro-jitter for "active" look (kept fast)
            const jitterX = (Math.random() - 0.5) * 0.005;
            const jitterY = (Math.random() - 0.5) * 0.005;
            const jitterZ = (Math.random() - 0.5) * 0.005;

            // Apply: active morphing
            posAttr.array[ix] = bx * (pulse + displacement) + jitterX;
            posAttr.array[iy] = by * (pulse + displacement) + jitterY;
            posAttr.array[iz] = bz * (pulse + displacement) + jitterZ;
        }
        posAttr.needsUpdate = true;

        renderer.render(scene, camera);
    }
    animate();
}
