import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import ResizeManager from './resize-manager.js';


/**
 * Atmospheric Hero Scene (Pyramid)
 * @param {HTMLElement} containerElement - The container element for the scene
 */
export function initAtmosphericHero(containerElement) {
    // --- CONSTANTS ---
    const POS_PYRAMID = { y: 4.5, rotY: Math.PI / 2 };
    const SIZE_PYRAMID = { radius: 2.5, height: 5.5 };
    const POS_CAMERA = { x: 0, y: 8.0, z: 30 };
    const POS_TARGET = { x: 0, y: 4.5, z: 0 };
    const MAX_ANGLE_DEGREES = 99;

    // Mesh configuration for hero-mesh.glb
    const MESH_CONFIG = {
        deer: {
            position: [4.7, 0, 5.7],
            rotation: [0, 135, 0],
            scale: 1.1
        },
        elephant: {
            position: [-6, 0, -3],
            rotation: [0, 60, 0],
            scale: 1.1
        },
        woman: {
            position: [2.9, 0, 2.8],
            rotation: [0, 212, 0],
            scale: 1.2
        }
    };


    // --- VARIABLES ---
    let scene, camera, renderer, composer, controls;
    let pyramidGroup, ring, floatingObj, atmosphere;
    let internalLight, ambient;
    let isRunning = false;
    let rafId = null;

    // Particle system variables
    const PARTICLE_COUNT = 400;
    const particles = [];
    let particleGeometry, particleMaterial, particleSystem;

    const container = containerElement;
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(POS_CAMERA.x, POS_CAMERA.y, POS_CAMERA.z);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Enable better color accuracy and dithering support
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.target.set(POS_TARGET.x, POS_TARGET.y, POS_TARGET.z);
    controls.enableZoom = false;
    controls.maxPolarAngle = (Math.PI / 180) * MAX_ANGLE_DEGREES;
    controls.minPolarAngle = 0;

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.3;
    bloomPass.strength = 1.0;
    bloomPass.radius = 0.5;

    // MSAA Render Target (Hardware Antialiasing)
    // IMPORTANT: Use renderer.getPixelRatio() to render at full device resolution (e.g. Retina)
    const pixelRatio = renderer.getPixelRatio();
    const renderTarget = new THREE.WebGLRenderTarget(
        window.innerWidth * pixelRatio,
        window.innerHeight * pixelRatio,
        {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            samples: 8, // High quality MSAA
            depthBuffer: true,
            stencilBuffer: false
        }
    );

    composer = new EffectComposer(renderer, renderTarget);
    // Ensure composer knows it's working with scaled buffers if needed, 
    // but manually setting size is explicit.
    composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // Shaders
    const atmosphereVertex = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `;
    const atmosphereFragment = `
        uniform vec3 color;
        uniform vec3 centerPosition;
        uniform float intensity;
        uniform float falloff;
        varying vec3 vWorldPosition;
        void main() {
            float dist = distance(vWorldPosition, centerPosition);
            float alpha = 1.0 - smoothstep(0.0, falloff, dist); 
            alpha = pow(alpha, 0.6); 
            gl_FragColor = vec4(color, alpha * intensity);
        }
    `;

    const geoAtm = new THREE.SphereGeometry(20, 32, 32);
    const matAtm = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
            color: { value: new THREE.Color(0xffffff) },
            centerPosition: { value: new THREE.Vector3(0, POS_PYRAMID.y, 0) },
            intensity: { value: 0.35 },
            falloff: { value: 18.0 }
        }
    });
    atmosphere = new THREE.Mesh(geoAtm, matAtm);
    atmosphere.position.set(0, POS_PYRAMID.y, 0);
    scene.add(atmosphere);

    // Pyramid
    function createStrut(vStart, vEnd, thickness) {
        const distance = vStart.distanceTo(vEnd);
        const cylinderGeo = new THREE.CylinderGeometry(thickness, thickness, distance, 8, 1, true);
        const cylinderMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
        const midpoint = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);
        cylinder.position.copy(midpoint);
        cylinder.lookAt(vEnd);
        cylinder.rotateX(Math.PI / 2);
        return cylinder;
    }

    pyramidGroup = new THREE.Group();
    const halfH = SIZE_PYRAMID.height / 2;
    const tipPoint = new THREE.Vector3(0, -halfH, 0);
    const basePoints = [];
    for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3;
        basePoints.push(new THREE.Vector3(Math.cos(angle) * SIZE_PYRAMID.radius, halfH, Math.sin(angle) * SIZE_PYRAMID.radius));
    }

    // Shared material and geometry for the joints (spheres)
    const STRUT_THICKNESS = 0.03;
    const jointGeo = new THREE.SphereGeometry(STRUT_THICKNESS, 12, 12);
    const jointMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    function createJoint(pos) {
        const joint = new THREE.Mesh(jointGeo, jointMat);
        joint.position.copy(pos);
        return joint;
    }

    // Add Struts
    basePoints.forEach(basePt => pyramidGroup.add(createStrut(tipPoint, basePt, STRUT_THICKNESS)));
    for (let i = 0; i < basePoints.length; i++) {
        pyramidGroup.add(createStrut(basePoints[i], basePoints[(i + 1) % basePoints.length], STRUT_THICKNESS));
    }

    // Add Joints at vertices to mask the "gap" between cylinders
    pyramidGroup.add(createJoint(tipPoint));
    basePoints.forEach(pt => pyramidGroup.add(createJoint(pt)));

    pyramidGroup.position.y = POS_PYRAMID.y;
    pyramidGroup.rotation.y = POS_PYRAMID.rotY;
    scene.add(pyramidGroup);

    // Model - Hero Mesh GLB (deer, elephant, woman)
    let heroModel = null;
    const gltfLoader = new GLTFLoader();
    const degToRad = (deg) => deg * (Math.PI / 180);

    // Silhouette material (Vision-First design)
    const silhouetteMaterial = new THREE.MeshStandardMaterial({
        color: 0x080808,
        roughness: 0.9,
        metalness: 0.1
    });

    function loadHeroGLB() {
        if (heroModel) return;

        gltfLoader.load(
            './assets/models/hero-mesh.glb',
            (gltf) => {


                heroModel = gltf.scene;

                heroModel.traverse((child) => {
                    if (child.isMesh) {
                        const meshName = child.name.toLowerCase();
                        const config = MESH_CONFIG[meshName];

                        if (config) {
                            // Apply individual transformations
                            child.position.set(...config.position);
                            // Rotations configured in degrees, convert to radians
                            child.rotation.set(
                                degToRad(config.rotation[0]),
                                degToRad(config.rotation[1]),
                                degToRad(config.rotation[2])
                            );
                            child.scale.setScalar(config.scale);
                        }

                        // Apply silhouette material and shadows to ALL meshes
                        child.material = silhouetteMaterial;
                        child.castShadow = true;
                    }
                });

                scene.add(heroModel);
                console.log('[Atmospheric] Hero mesh loaded (desktop)');
            },
            undefined,
            (error) => {
                console.error('[Atmospheric] Error loading hero mesh:', error);
            }
        );
    }



    // Initial load check
    loadHeroGLB();



    // Lights & Objects
    internalLight = new THREE.PointLight(0xffffff, 1500, 25);
    internalLight.position.set(0, POS_PYRAMID.y, 0);
    internalLight.castShadow = true;
    internalLight.shadow.mapSize.width = 1024;
    internalLight.shadow.mapSize.height = 1024;
    internalLight.shadow.camera.near = 0.5;
    internalLight.shadow.camera.far = 50;
    scene.add(internalLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.02));

    const ringGeo = new THREE.TorusGeometry(3.5, 0.03, 16, 100);
    ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    const floatGeo = new THREE.OctahedronGeometry(0.5, 0);
    floatingObj = new THREE.Mesh(floatGeo, new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.2, metalness: 0.8 }));
    scene.add(floatingObj);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({
        color: 0x111111,
        dithering: true
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- PARTICLE SYSTEM ---
    // Calculate pyramid edge points in world coordinates
    const pyramidTip = new THREE.Vector3(0, POS_PYRAMID.y - halfH, 0);
    const pyramidBasePoints = [];
    for (let i = 0; i < 3; i++) {
        // Apply pyramidGroup rotation (POS_PYRAMID.rotY) to base points
        const angle = (i * 2 * Math.PI) / 3 + POS_PYRAMID.rotY;
        pyramidBasePoints.push(new THREE.Vector3(
            Math.cos(angle) * SIZE_PYRAMID.radius,
            POS_PYRAMID.y + halfH,
            Math.sin(angle) * SIZE_PYRAMID.radius
        ));
    }

    // Define all 6 edges of the pyramid (3 from tip to base + 3 base edges)
    const pyramidEdges = [];
    // Edges from tip to each base vertex
    pyramidBasePoints.forEach(basePt => pyramidEdges.push({ start: pyramidTip.clone(), end: basePt.clone() }));
    // Base triangle edges
    for (let i = 0; i < 3; i++) {
        pyramidEdges.push({ start: pyramidBasePoints[i].clone(), end: pyramidBasePoints[(i + 1) % 3].clone() });
    }

    // Function to get a random point on the pyramid cylinders
    function getRandomPointOnEdge() {
        const edge = pyramidEdges[Math.floor(Math.random() * pyramidEdges.length)];
        const t = Math.random(); // Random position along the edge
        return new THREE.Vector3().lerpVectors(edge.start, edge.end, t);
    }

    // Function to calculate distance from point to nearest edge (cylinder surface)
    const CYLINDER_RADIUS = 0.04; // Nuova dimensione sincronizzata con lo spessore delle aste
    function distanceToNearestEdge(point) {
        let minDist = Infinity;
        for (const edge of pyramidEdges) {
            const edgeVec = new THREE.Vector3().subVectors(edge.end, edge.start);
            const pointVec = new THREE.Vector3().subVectors(point, edge.start);
            const edgeLen = edgeVec.length();
            edgeVec.normalize();

            // Project point onto edge line
            let t = pointVec.dot(edgeVec);
            t = Math.max(0, Math.min(edgeLen, t)); // Clamp to edge segment

            const closestPoint = new THREE.Vector3().copy(edge.start).addScaledVector(edgeVec, t);
            const dist = point.distanceTo(closestPoint);
            minDist = Math.min(minDist, dist);
        }
        return minDist;
    }

    // Create particle class
    class Particle {
        constructor() {
            this.alive = true;
            this.reset();
        }

        reset() {
            // Spawn on the ring
            const ringRadius = 3.5;
            const angle = Math.random() * Math.PI * 2;
            this.position = new THREE.Vector3(
                Math.cos(angle) * ringRadius,
                0.02,
                Math.sin(angle) * ringRadius
            );

            // Pick a random point along a pyramid edge (cylinder)
            this.target = getRandomPointOnEdge();

            // Slow movement speed (0.003 - 0.008 units per frame)
            this.speed = 0.003 + Math.random() * 0.005;

            // Particle life/alpha
            this.life = 1.0;
            this.alive = true;

            // Subtle floating oscillation
            this.oscillationOffset = Math.random() * Math.PI * 2;
            this.oscillationSpeed = 0.5 + Math.random() * 0.5;
            this.oscillationAmplitude = 0.02 + Math.random() * 0.03;
        }

        update(time) {
            if (!this.alive) {
                this.reset();
                return;
            }

            // Check if touching any cylinder (edge)
            const distToEdge = distanceToNearestEdge(this.position);
            if (distToEdge <= CYLINDER_RADIUS + 0.02) {
                // Die on contact with cylinder
                this.alive = false;
                this.life = 0;
                return;
            }

            // Move towards target
            const direction = new THREE.Vector3().subVectors(this.target, this.position);
            const distance = direction.length();

            if (distance < 0.05) {
                // Reached target, die
                this.alive = false;
                this.life = 0;
                return;
            }

            direction.normalize();

            // Add subtle oscillation perpendicular to movement
            const perpX = Math.sin(time * this.oscillationSpeed + this.oscillationOffset) * this.oscillationAmplitude;
            const perpZ = Math.cos(time * this.oscillationSpeed + this.oscillationOffset) * this.oscillationAmplitude;

            this.position.x += direction.x * this.speed + perpX * 0.1;
            this.position.y += direction.y * this.speed;
            this.position.z += direction.z * this.speed + perpZ * 0.1;

            // Fade based on distance to target (brighter when closer)
            this.life = Math.min(1.0, distance / 5.0);
        }
    }

    // Initialize particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = new Particle();
        // Stagger initial positions so not all start at ring
        if (i > 10) {
            const t = Math.random();
            const startAngle = Math.random() * Math.PI * 2;
            const ringRadius = 3.5;
            const startPos = new THREE.Vector3(
                Math.cos(startAngle) * ringRadius,
                0.02,
                Math.sin(startAngle) * ringRadius
            );
            p.position.lerpVectors(startPos, p.target, t);
        }
        particles.push(p);
    }

    // Create particle geometry and material
    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const alphas = new Float32Array(PARTICLE_COUNT);

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    // Particle shader material for glowing effect
    particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xffffff) },
            pointSize: { value: 0.6 * window.devicePixelRatio }
        },
        vertexShader: `
            attribute float alpha;
            varying float vAlpha;
            uniform float pointSize;
            void main() {
                vAlpha = alpha;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (200.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            varying float vAlpha;
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                float intensity = 1.0 - smoothstep(0.0, 0.5, dist);
                gl_FragColor = vec4(color, intensity * vAlpha * 0.8);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    // Function to update particles
    function updateParticles(time) {
        const positions = particleGeometry.attributes.position.array;
        const alphas = particleGeometry.attributes.alpha.array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles[i].update(time);

            positions[i * 3] = particles[i].position.x;
            positions[i * 3 + 1] = particles[i].position.y;
            positions[i * 3 + 2] = particles[i].position.z;

            alphas[i] = particles[i].life;
        }

        particleGeometry.attributes.position.needsUpdate = true;
        particleGeometry.attributes.alpha.needsUpdate = true;
    }

    // Resize
    ResizeManager.subscribe(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        // Resize composer to match device resolution
        const pixelRatio = renderer.getPixelRatio();
        composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);

        particleSystem.visible = false;
    });

    // Initial particle visibility (inverse of GLB: visible only < 1024px)
    // Initial particle visibility (permanent false)
    particleSystem.visible = false;

    // Remove Loader
    setTimeout(() => {
        const loaderEl = document.getElementById('loader');
        if (loaderEl) { loaderEl.style.opacity = '0'; setTimeout(() => loaderEl.remove(), 500); }
    }, 800);

    // Animate
    function animate() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);

        const time = performance.now() * 0.001;
        controls.update();

        const radius = 5;
        const speed = 0.4;
        floatingObj.position.x = Math.sin(time * speed) * radius;
        floatingObj.position.z = Math.cos(time * speed) * radius;
        floatingObj.position.y = POS_PYRAMID.y + 1.5 + Math.sin(time * 1.5) * 1;
        floatingObj.rotation.x += 0.02; floatingObj.rotation.y += 0.03;

        // Rotate pyramid around vertical axis
        pyramidGroup.rotation.y += 0.002;
        // Vertical floating
        pyramidGroup.position.y = POS_PYRAMID.y + Math.sin(time * 0.5) * 0.3;

        // Update particle system
        updateParticles(time);

        composer.render();
    }

    return {
        start: () => {
            if (isRunning) return;
            isRunning = true;
            animate();
            console.log('[Atmospheric] Scene started');
        },
        stop: () => {
            isRunning = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            console.log('[Atmospheric] Scene stopped');
        }
    };
}
