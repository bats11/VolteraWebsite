import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import ResizeManager from './resize-manager.js';
import { createStage } from './showcase-modules/ShowcaseStage.js';
import { ShowcaseFactory } from './showcase-modules/ShowcaseFactory.js';
import { ShowcaseInteraction } from './showcase-modules/ShowcaseInteraction.js';
// gsap is assumed global

/**
 * Showcase "The Infinite Map" - Three.js Scene Module
 * Orchestrator: Centralizes Time, DOM injection, and Lifecycle Management.
 * @param {HTMLElement} containerElement - The container element for the scene
 */
export function initShowcaseMap(containerElement) {
    // --- 1. DOM GATHERING & UI CONFIG ---
    const container = containerElement;
    const section = document.getElementById('showcase');
    const hud = document.getElementById('showcase-hud');
    const hudRef = hud?.querySelector('.hud-ref');
    const hudStatus = hud?.querySelector('.hud-status');
    const cssLayer = document.getElementById('showcase-css-layer');

    // Safety check
    if (!container || !section) {
        console.warn('[Showcase] Missing container or showcase section. Initialization aborted.');
        return;
    }

    const uiConfig = {
        container,
        section,
        hud: { hud, hudRef, hudStatus },
        cssLayer
    };

    // --- STATE ---
    let isRunning = false;
    let rafId = null;
    let ctx = null; // GSAP Context for easy cleanup

    // --- MODULES (Placeholder refs) ---
    let stage, interaction, factory, labelRenderer;
    let resizeUnsubscribe;

    // --- INITIALIZATION WRAPPED IN CONTEXT ---
    // We use a small timeout or just immediate execution. 
    // Since we are creating GSAP tweens inside classes, we should create any global GSAP context if needed,
    // but typically we can just use `gsap.context` to wrap the specific creations or just rely on revert().
    // Ideally, we create a context that we can .add() things to, or just create one scope that we revert.

    ctx = gsap.context(() => {
        // --- 2. STAGE ---
        stage = createStage(uiConfig, { startZ: 20, cameraY: 2 });

        // --- 3. CSS RENDERER ---
        if (uiConfig.cssLayer) {
            labelRenderer = new CSS2DRenderer();
            labelRenderer.setSize(container.clientWidth, container.clientHeight);
            labelRenderer.domElement.style.position = 'absolute';
            labelRenderer.domElement.style.top = '0';
            labelRenderer.domElement.style.left = '0';
            labelRenderer.domElement.style.pointerEvents = 'none';
            uiConfig.cssLayer.appendChild(labelRenderer.domElement);
        }

        // --- 4. INTERACTION ---
        interaction = new ShowcaseInteraction(
            uiConfig,
            stage.camera,
            stage.scene,
            stage.outlinePass,
            stage.ground
        );

        // --- 5. FACTORY ---
        // Pass base path via config
        factory = new ShowcaseFactory(stage.scene, stage.renderer, {
            baseAssetPath: './assets/video/' // Centralized asset config
        });

        // --- ASYNC WIRING ---
        factory.build().then(data => {
            interaction.setTargets(data.monoliths, data.ring);
            interaction.setLabels(data.projectLabels);
            console.log('[Showcase] Modules wired successfully');
        });

    }); // End GSAP Context

    // --- RESIZE HANDLING ---
    resizeUnsubscribe = ResizeManager.subscribe(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;

        if (labelRenderer) {
            labelRenderer.setSize(width, height);
        }

        // Propagate down
        interaction.resize(width, height);
        // Stage handles its own resize via subscription but we could manually trigger if we wanted strict order
    });

    // --- ANIMATION LOOP ---
    // Deterministic Time
    let lastTime = 0;

    function animate(timeRaw) {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);

        // Convert to seconds
        const time = timeRaw * 0.001;
        const delta = time - lastTime;
        lastTime = time;

        // 1. Update Factory (Deterministic Vertex Anim & Logic)
        factory.update(time, delta);

        // 2. Update Interaction (Camera Physics)
        interaction.update(time, delta);

        // 3. Render
        if (labelRenderer) {
            labelRenderer.render(stage.scene, stage.camera);
        }
        stage.composer.render();
    }

    console.log('[Showcase] Orchestrator initialized');

    // --- PUBLIC INTERFACE ---
    return {
        start: () => {
            if (!isRunning) {
                console.log('[Showcase] Resumed');
                isRunning = true;
                lastTime = performance.now() * 0.001; // Reset lastTime to avoid huge delta jump
                animate(performance.now());
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
            if (resizeUnsubscribe) resizeUnsubscribe();

            // Reverse disposal
            interaction.dispose();
            factory.dispose();
            stage.dispose();

            if (labelRenderer && labelRenderer.domElement.parentNode) {
                labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
            }

            // CLEANUP ALL GSAP
            if (ctx) ctx.revert();

            console.log('[Showcase] Orchestrator disposed');
        }
    };
}