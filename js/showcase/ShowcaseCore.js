/**
 * ShowcaseCore.js
 * Core logical module for the Showcase experience.
 * Orchestrates Data, Renderer, and Interactions.
 */
import { fetchProjects } from './ShowcaseData.js';
import ShowcaseRenderer from './ShowcaseRenderer.js';

console.log('[ShowcaseCore] Initializing...');

// State
let rendererModule = null;
let animationId = null;
let isRunning = false;

// Geometry placeholder for verification (so render loop isn't empty)
import * as THREE from 'three';

async function init(containerElement) {
    try {
        console.log('[ShowcaseCore] Booting up...');

        // 1. Data Fetching
        const data = await fetchProjects();
        console.log(`[ShowcaseCore] Data Loaded: ${data.projects.length} entries.`);

        // 2. Renderer Initialization
        rendererModule = new ShowcaseRenderer();
        rendererModule.init(containerElement);
        console.log('[ShowcaseCore] Renderer initialized.');

        // 3. Add debug object to scene to verify rendering
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const cube = new THREE.Mesh(geometry, material);
        rendererModule.scene.add(cube);

        // Light for when we switch to standard material later
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        rendererModule.scene.add(light);

        // 4. Start Loop
        isRunning = true;
        animate();

        return rendererModule; // Return for external debugging if needed

    } catch (err) {
        console.error('[ShowcaseCore] Initialization failed:', err);
    }
}

function animate() {
    if (!isRunning) return;

    // Debug rotation
    if (rendererModule && rendererModule.scene.children.length > 0) {
        const cube = rendererModule.scene.children.find(c => c.isMesh);
        if (cube) {
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
        }
    }

    rendererModule.render();
    animationId = requestAnimationFrame(animate);
}

function dispose() {
    isRunning = false;
    cancelAnimationFrame(animationId);
    if (rendererModule) {
        rendererModule.dispose();
    }
}

// Export for usage
export { init, dispose };
