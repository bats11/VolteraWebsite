import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
// Assumes ResizeManager is available as a module
import ResizeManager from '../resize-manager.js';

/**
 * ShowcaseRenderer
 * Handles the Three.js rendering infrastructure, including:
 * - WebGLRenderer (with Post-Processing)
 * - CSS2DRenderer (Labels)
 * - Scene & Camera configuration
 * - Resize handling
 * - Resource disposal
 */
export default class ShowcaseRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.composer = null;
        this.outlinePass = null;
        this.bloomPass = null;
        this.container = null;
        this._resizeHandler = this._onResize.bind(this);
    }

    /**
     * Initializes the rendering engine and appends it to the container.
     * @param {HTMLElement} container - The DOM element to host the canvas.
     */
    init(container) {
        if (!container) throw new Error('[ShowcaseRenderer] Container is required.');
        this.container = container;

        // 1. Scene Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080808);
        this.scene.fog = new THREE.FogExp2(0x080808, 0.025);

        // 2. Camera Setup
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        // Initial position (will be managed by Scene/Travel logic later, but defaults here)
        this.camera.position.set(0, 2, 20);
        this.camera.lookAt(0, 0, 0);

        // 3. WebGL Renderer Setup
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true, // Requested by user
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(0x080808, 1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        container.appendChild(this.renderer.domElement);

        // 4. CSS2D Renderer Setup
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
        const labelDom = this.labelRenderer.domElement;
        labelDom.style.position = 'absolute';
        labelDom.style.top = '0';
        labelDom.style.left = '0';
        labelDom.style.pointerEvents = 'none'; // Passthrough
        labelDom.setAttribute('aria-hidden', 'true'); // Accessibility compliance

        // Internal overlay wrapper to ensure DOM independence
        const cssLayer = document.createElement('div');
        cssLayer.className = 'showcase-css-layer';
        cssLayer.style.position = 'absolute';
        cssLayer.style.top = '0';
        cssLayer.style.left = '0';
        cssLayer.style.width = '100%';
        cssLayer.style.height = '100%';
        cssLayer.style.pointerEvents = 'none';
        cssLayer.appendChild(labelDom);
        container.appendChild(cssLayer);

        // 5. Post-Processing Setup
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        renderPass.clearColor = new THREE.Color(0x080808);
        renderPass.clearAlpha = 1;
        this.composer.addPass(renderPass);

        // Outline Pass
        this.outlinePass = new OutlinePass(
            new THREE.Vector2(container.clientWidth, container.clientHeight),
            this.scene,
            this.camera
        );
        this.outlinePass.edgeStrength = 0.0; // Animated externally
        this.outlinePass.edgeGlow = 0.6;
        this.outlinePass.edgeThickness = 0.01;
        this.outlinePass.visibleEdgeColor.set('#FFFFFF');
        this.outlinePass.hiddenEdgeColor.set('#000000');
        this.composer.addPass(this.outlinePass);

        // Bloom Pass
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(container.clientWidth, container.clientHeight),
            0.6,   // Strength
            0.3,   // Radius
            0.85   // Threshold
        );
        this.composer.addPass(this.bloomPass);

        // 6. Resize Subscription
        ResizeManager.subscribe(this._resizeHandler);
    }

    /**
     * Renders a single frame.
     */
    render() {
        if (!this.composer || !this.labelRenderer) return;
        this.composer.render();
        this.labelRenderer.render(this.scene, this.camera);
    }

    /**
     * Handles window resize events.
     * @private
     */
    _onResize() {
        if (!this.container || !this.camera || !this.renderer) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        this.labelRenderer.setSize(width, height);
        this.outlinePass.setSize(width, height); // Correctly update OutlinePass size
    }

    /**
     * Disposes of all resources and listeners.
     */
    dispose() {
        // Unsubscribe from resize
        ResizeManager.unsubscribe(this._resizeHandler);

        // Dispose specific passes
        if (this.outlinePass) this.outlinePass.dispose();
        if (this.bloomPass) this.bloomPass.dispose();

        // Dispose Composer
        if (this.composer) {
            // Check if passes have dispose methods (UnrealBloomPass does, RenderPass doesn't usually hold GPU resources directly)
            this.composer.passes.forEach(pass => {
                if (pass.dispose) pass.dispose();
            });
        }

        // Dispose Renderers
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.domElement.remove();
        }

        if (this.labelRenderer) {
            const wrapper = this.labelRenderer.domElement.parentElement; // The cssLayer
            if (wrapper && wrapper.parentElement === this.container) {
                this.container.removeChild(wrapper);
            } else {
                this.labelRenderer.domElement.remove();
            }
        }

        // Cleanup references
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.composer = null;
        this.container = null;
    }
}
