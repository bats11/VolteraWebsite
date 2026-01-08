import * as THREE from 'three';
import ResizeManager from './resize-manager.js';

/**
 * Spatial Module Hero Scene
 * Architectural "exploded corner" with perpendicular grids and force-line axes
 * @param {HTMLElement} containerElement - The container element for the scene
 */
export function initIcosahedronHero(containerElement) {
    const canvas = document.getElementById('hero-canvas-icosa');
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 18;

    let isRunning = false;
    let rafId = null;

    // ═══════════════════════════════════════════════════════════════
    // SPATIAL MODULE GROUP
    // ═══════════════════════════════════════════════════════════════
    const spatialModule = new THREE.Group();

    // Grid material (opacity 0.1 for subtle definition)
    const gridColor = 0x666666;
    const gridSize = 9;
    const gridDivisions = 9;
    const gridOffset = 1.5; // Offset for "exploded" corner effect

    // XZ Grid (floor plane) - offset upward
    const gridXZ = new THREE.GridHelper(gridSize, gridDivisions, gridColor, gridColor);
    gridXZ.position.y = -gridOffset;
    gridXZ.material.transparent = true;
    gridXZ.material.opacity = 0.1;
    spatialModule.add(gridXZ);

    // XY Grid (back wall) - rotated and offset backward
    const gridXY = new THREE.GridHelper(gridSize, gridDivisions, gridColor, gridColor);
    gridXY.rotation.x = Math.PI / 2;
    gridXY.position.z = -gridOffset;
    gridXY.material.transparent = true;
    gridXY.material.opacity = 0.1;
    spatialModule.add(gridXY);

    // YZ Grid (side wall) - rotated and offset left
    const gridYZ = new THREE.GridHelper(gridSize, gridDivisions, gridColor, gridColor);
    gridYZ.rotation.z = Math.PI / 2;
    gridYZ.position.x = -gridOffset;
    gridYZ.material.transparent = true;
    gridYZ.material.opacity = 0.1;
    spatialModule.add(gridYZ);

    // ═══════════════════════════════════════════════════════════════
    // FORCE-LINE AXES (3 main structural axes)
    // ═══════════════════════════════════════════════════════════════
    const axisMaterial = new THREE.MeshBasicMaterial({
        color: gridColor, transparent: true, opacity: 0.4
    });
    const axisThickness = 0.06;
    const axisLength = 12;

    // X Axis (horizontal, extends right)
    const axisX = new THREE.Mesh(
        new THREE.BoxGeometry(axisLength, axisThickness, axisThickness),
        axisMaterial
    );
    axisX.position.x = axisLength / 2 - 2;
    spatialModule.add(axisX);

    // Y Axis (vertical, extends up)
    const axisY = new THREE.Mesh(
        new THREE.BoxGeometry(axisThickness, axisLength, axisThickness),
        axisMaterial
    );
    axisY.position.y = axisLength / 2 - 2;
    spatialModule.add(axisY);

    // Z Axis (depth, extends forward)
    const axisZ = new THREE.Mesh(
        new THREE.BoxGeometry(axisThickness, axisThickness, axisLength),
        axisMaterial
    );
    axisZ.position.z = axisLength / 2 - 2;
    spatialModule.add(axisZ);

    scene.add(spatialModule);

    // ═══════════════════════════════════════════════════════════════
    // PARTICLES: 100 grid-anchored + 200 floating
    // ═══════════════════════════════════════════════════════════════
    const anchoredCount = 100;
    const floatingCount = 200;
    const totalParticles = anchoredCount + floatingCount;
    const pPos = new Float32Array(totalParticles * 3);

    // Anchored particles: distributed on grid intersections
    const gridStep = gridSize / gridDivisions;
    let anchoredIndex = 0;
    for (let i = 0; i < anchoredCount && anchoredIndex < anchoredCount * 3; i++) {
        const plane = Math.floor(Math.random() * 3); // 0=XZ, 1=XY, 2=YZ
        const u = (Math.floor(Math.random() * (gridDivisions + 1)) - gridDivisions / 2) * gridStep;
        const v = (Math.floor(Math.random() * (gridDivisions + 1)) - gridDivisions / 2) * gridStep;

        if (plane === 0) { // XZ
            pPos[anchoredIndex++] = u;
            pPos[anchoredIndex++] = -gridOffset;
            pPos[anchoredIndex++] = v;
        } else if (plane === 1) { // XY
            pPos[anchoredIndex++] = u;
            pPos[anchoredIndex++] = v;
            pPos[anchoredIndex++] = -gridOffset;
        } else { // YZ
            pPos[anchoredIndex++] = -gridOffset;
            pPos[anchoredIndex++] = u;
            pPos[anchoredIndex++] = v;
        }
    }

    // Floating particles: random in surrounding space
    for (let i = anchoredCount * 3; i < totalParticles * 3; i++) {
        pPos[i] = (Math.random() - 0.5) * 50;
    }

    const particles = new THREE.Points(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3)),
        new THREE.PointsMaterial({ size: 0.05, color: 0x444444, transparent: true, opacity: 0.3 })
    );
    scene.add(particles);

    // ═══════════════════════════════════════════════════════════════
    // MOUSE INTERACTION
    // ═══════════════════════════════════════════════════════════════
    let mx = 0, my = 0;
    window.addEventListener('mousemove', (e) => {
        mx = e.clientX - window.innerWidth / 2;
        my = e.clientY - window.innerHeight / 2;
    });

    // ═══════════════════════════════════════════════════════════════
    // RESIZE CALLBACK
    // ═══════════════════════════════════════════════════════════════
    ResizeManager.subscribe(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ANIMATION: Asymmetric rotation + Breathing + Parallax
    // ═══════════════════════════════════════════════════════════════
    function anim() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(anim);

        const time = Date.now() * 0.001;

        // Asymmetric rotation: Y faster than X (planimetric scanning)
        spatialModule.rotation.y += 0.0012;
        spatialModule.rotation.x += 0.0004;

        // Breathing effect: scale oscillates 0.98 - 1.02
        const breathe = 1 + Math.sin(time) * 0.02;
        spatialModule.scale.setScalar(breathe);

        // Mouse parallax: 20% reduced for elegance
        spatialModule.position.x += (mx * 0.0008 - spatialModule.position.x) * 0.05;
        spatialModule.position.y += ((-my * 0.0008 - 2.5) - spatialModule.position.y) * 0.05;

        renderer.render(scene, camera);
    }

    return {
        start: () => {
            if (isRunning) return;
            isRunning = true;
            anim();
            console.log('[Icosa] Scene started');
        },
        stop: () => {
            isRunning = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            console.log('[Icosa] Scene stopped');
        }
    };
}
