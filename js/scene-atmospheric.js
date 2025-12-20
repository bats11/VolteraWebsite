import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


/**
 * Atmospheric Hero Scene (Pyramid)
 * @param {Array} resizeCallbacks - Global resize callbacks array
 */
export function initAtmosphericHero(resizeCallbacks) {
    // --- CONSTANTS ---
    const POS_PYRAMID = { y: 4.5, rotY: Math.PI / 2 };
    const SIZE_PYRAMID = { radius: 2.5, height: 5.5 };
    const POS_CAMERA = { x: 0, y: 3.0, z: 28 };
    const POS_TARGET = { x: 0, y: 4.5, z: 0 };
    const MAX_ANGLE_DEGREES = 99;


    // --- VARIABLES ---
    let scene, camera, renderer, composer, controls;
    let pyramidGroup, ring, floatingObj, atmosphere;
    let internalLight, ambient;

    const container = document.getElementById('canvas-container');
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

    composer = new EffectComposer(renderer);
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
    basePoints.forEach(basePt => pyramidGroup.add(createStrut(tipPoint, basePt, 0.03)));
    for (let i = 0; i < basePoints.length; i++) {
        pyramidGroup.add(createStrut(basePoints[i], basePoints[(i + 1) % basePoints.length], 0.03));
    }
    pyramidGroup.position.y = POS_PYRAMID.y;
    pyramidGroup.rotation.y = POS_PYRAMID.rotY;
    scene.add(pyramidGroup);

    // Model


    // Lights & Objects
    internalLight = new THREE.PointLight(0xffffff, 450, 100);
    internalLight.position.set(0, POS_PYRAMID.y, 0);
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

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Resize
    resizeCallbacks.push(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    // Remove Loader
    setTimeout(() => {
        const loaderEl = document.getElementById('loader');
        if (loaderEl) { loaderEl.style.opacity = '0'; setTimeout(() => loaderEl.remove(), 500); }
    }, 800);

    // Animate
    function animate() {
        requestAnimationFrame(animate);
        const time = performance.now() * 0.001;
        controls.update();

        const radius = 5;
        const speed = 0.4;
        floatingObj.position.x = Math.sin(time * speed) * radius;
        floatingObj.position.z = Math.cos(time * speed) * radius;
        floatingObj.position.y = POS_PYRAMID.y + 1.5 + Math.sin(time * 1.5) * 1;
        floatingObj.rotation.x += 0.02; floatingObj.rotation.y += 0.03;

        composer.render();
    }
    animate();
}
