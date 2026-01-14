import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import ResizeManager from './resize-manager.js';
import { createStage } from './showcase-modules/ShowcaseStage.js';
import { ShowcaseFactory } from './showcase-modules/ShowcaseFactory.js';
import { ShowcaseInteraction } from './showcase-modules/ShowcaseInteraction.js';

/**
 * Showcase "The Infinite Map" - Three.js Scene Module
 * Orchestrator pattern: Connects Stage, Factory, and Interaction modules.
 * @param {HTMLElement} containerElement - The container element for the scene
 */
export function initShowcaseMap(containerElement) {
    // --- DOM CHECK ---
    const container = containerElement;
    const section = document.getElementById('showcase'); // Still needed for some checks if any, or just strictly passing container
    if (!container || !section) return;

    // --- HUD ELEMENTS ---
    // We gather them here to pass to Interaction module
    const hud = document.getElementById('showcase-hud');
    const hudRef = hud?.querySelector('.hud-ref');
    const hudStatus = hud?.querySelector('.hud-status');
    const hudElements = { hud, hudRef, hudStatus };

    // --- STATE ---
    let isRunning = false;
    let rafId = null;

    // --- 1. STAGE (Scene, Camera, Renderer, Post-Processing) ---
    const stage = createStage(container, { startZ: 20, cameraY: 2 });

    // --- 2. CSS RENDERER (Overlay for Labels) ---
    let labelRenderer;
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

    // --- 3. INTERACTION (Input, Scroll, Raycasting) ---
    // Dependency Injection: Interaction needs access to Scene components and HUD
    const interaction = new ShowcaseInteraction(
        container,
        stage.camera,
        stage.scene,
        stage.outlinePass,
        stage.ground,
        hudElements
    );

    // --- 4. FACTORY (Content Generation) ---
    const factory = new ShowcaseFactory(stage.scene, stage.renderer);

    // --- ASYNC WIRING ---
    // Build content -> Pass data to Interaction
    factory.build().then(data => {
        interaction.setTargets(data.monoliths);
        interaction.setLabels(data.projectLabels);
        console.log('[Showcase] Modules wired successfully');
    });

    // --- RESIZE HANDLING ---
    // We subscribe to the global ResizeManager
    // Stage handles its own resize internally (scene/camera/composer)
    const resizeUnsubscribe = ResizeManager.subscribe(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;

        if (labelRenderer) {
            labelRenderer.setSize(width, height);
        }

        // Propagate resize to interaction (e.g. if it needs to update cached rects)
        interaction.resize(width, height);
    });

    // --- ANIMATION LOOP ---
    function animate() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);
        const time = performance.now() * 0.001;

        // 1. Update Factory (Animations: Core, Lightning, Monolith rotation)
        factory.update(time);

        // 2. Update Interaction (Camera movement, Label opacity, Hover logic)
        interaction.update(time);

        // 3. Render CSS Labels
        if (labelRenderer) {
            labelRenderer.render(stage.scene, stage.camera);
        }

        // 4. Render Scene (Composer handles Post-Processing)
        stage.composer.render();
    }

    console.log('[Showcase] Orchestrator initialized');

    // --- PUBLIC INTERFACE ---
    return {
        start: () => {
            if (!isRunning) {
                console.log('[Showcase] Resumed');
                isRunning = true;
                animate();
            }
        },
        stop: () => {
            console.log('[Showcase] Paused');
            isRunning = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        },
        dispose: () => {
            // Unsubscribe from resize
            if (resizeUnsubscribe) resizeUnsubscribe();

            // Dispose Modules in reverse order of creation/dependency
            interaction.dispose();
            factory.dispose();
            stage.dispose();

            // Cleanup local CSS Renderer
            if (labelRenderer && labelRenderer.domElement.parentNode) {
                labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
            }

            console.log('[Showcase] Orchestrator disposed');
        }
    };
}