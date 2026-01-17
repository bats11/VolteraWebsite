import * as THREE from 'three';
// gsap is assumed global given the project context

/**
 * ShowcaseCameraRig (Pivot Architecture)
 * 
 * Hierarchy:
 * Rig (THREE.Group) -> Handles Position (Z-Travel, ZoomTranslation)
 * └── Camera (THREE.PerspectiveCamera) -> Handles Rotation (Mouse Look)
 * 
 * This separation ensures Mouse Look and Scroll Travel never fight for control.
 */
export class ShowcaseCameraRig extends THREE.Group {
    constructor(camera, config = {}) {
        super();
        this.name = 'ShowcaseCameraRig';

        // --- 1. HIERARCHY SETUP ---
        // We take ownership of the camera
        this.camera = camera;
        this.add(this.camera);

        // Reset Camera Local Transform (Relative to Rig)
        this.camera.position.set(0, 3, 0); // Camera sits 2 units up inside the Rig
        this.camera.rotation.set(0, 0, 0);
        this.camera.quaternion.identity();

        // --- 2. CONFIG ---
        this.TRAVEL_CONFIG = {
            startZ: config.startZ || 20,
            endZ: config.endZ || -120, // Fly through further
        };

        this.SCROLL_PHASES = {
            approachLimit: 0.3,
            carouselLimit: 0.7
        };

        // Voltera Ease: cubic-bezier(0.16, 1, 0.3, 1)
        this.VOLTERA_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

        // --- 3. STATE ---
        this.scrollProgress = 0;
        this.isZooming = false;

        // Internal GSAP Proxies for Smoothing
        this.rotationProxy = { x: 0, y: 0 };

        // QuickTo for Mouse Look (Applied to Child Camera)
        this.rotateXTo = gsap.quickTo(this.rotationProxy, "x", { duration: 0.6, ease: this.VOLTERA_EASE });
        this.rotateYTo = gsap.quickTo(this.rotationProxy, "y", { duration: 0.6, ease: this.VOLTERA_EASE });

        // Initialize Position
        this.position.z = this.TRAVEL_CONFIG.startZ;

        // Memoize world position helpers
        this._worldPos = new THREE.Vector3();
    }

    /**
     * Updates the Rig based on external inputs.
     * @param {number} scrollProgress - Deterministic scroll progress [0, 1]
     */
    update(scrollProgress) {
        // 1. SCROLL TRAVEL (Position)
        // If zooming, we ignore scroll updates to position (locked to target)
        if (!this.isZooming) {
            this.scrollProgress = scrollProgress;
            this._updateScrollPosition();
        }

        // 2. MOUSE LOOK (Rotation)
        // Applied to Child Camera from Proxy
        // We always apply the proxy values. The input feeding into the proxy 
        // determines if it moves or returns to center.
        this.camera.rotation.x = this.rotationProxy.x + 0.1;
        this.camera.rotation.y = this.rotationProxy.y;
    }

    /**
     * Sets the target rotation for Mouse Look.
     * @param {number} x - Target X rotation (radians)
     * @param {number} y - Target Y rotation (radians)
     */
    setRotationTarget(x, y) {
        if (this.isZooming) return; // Lock look during zoom? Or allow? Usually lock for "Cinematic" feel.
        this.rotateXTo(x);
        this.rotateYTo(y);
    }

    /**
     * Helper to calculate the theoretical Z position for a given scroll progress.
     * Useful for returning from zoom to the correct location.
     */
    _calculateZForProgress(progress) {
        const { startZ, endZ } = this.TRAVEL_CONFIG;
        const phases = this.SCROLL_PHASES;
        const viewZ = -40; // The "Viewing" position

        let targetZ = startZ;

        // PHASE 1: APPROACH
        if (progress <= phases.approachLimit) {
            const t = progress / phases.approachLimit;
            const ease = 1 - Math.pow(1 - t, 3); // Ease out cubic
            targetZ = startZ + (viewZ - startZ) * ease;
        }
        // PHASE 2: CAROUSEL
        else if (progress <= phases.carouselLimit) {
            targetZ = viewZ;
        }
        // PHASE 3: DEPARTURE
        else {
            const t = (progress - phases.carouselLimit) / (1.0 - phases.carouselLimit);
            const ease = t * t * t; // Ease in cubic
            targetZ = viewZ + (endZ - viewZ) * ease;
        }
        return targetZ;
    }

    _updateScrollPosition() {
        this.position.z = this._calculateZForProgress(this.scrollProgress);
    }

    // --- CINEMATIC ZOOM API ---

    zoomTo(targetMonolith, onComplete) {
        this.isZooming = true;

        // Target Calculation:
        // We want the CAMERA to end up at (monolith + offset).
        // Since Rig is a Pivot at y=0 (mostly), and Camera is at y=2...
        // Let's just tween the Rig's position so the Camera lands correctly.
        // Rig.position = TargetWorldPos - CameraLocalPos

        const targetPos = targetMonolith.position.clone();
        targetPos.z += 5; // Offset Z
        targetPos.y += 1; // Offset Y (Look at center)

        // Adjust for Camera's local offset (0, 2, 0)
        // If we want Camera World Y back to `targetPos.y`, Rig Y must be `targetPos.y - 2`.
        // However, Ground is at -1.5. Rig is usually at Y=0.
        // Let's assume Rig can move in Y.

        const rigTargetY = targetPos.y - this.camera.position.y;

        // Also we want to zero out rotation for the cinematic look?
        // Or keep looking at it?
        // The previous code did: camera.quaternion.copy... 
        // Here we just center the look.
        this.rotateXTo(0);
        this.rotateYTo(0);

        gsap.to(this.position, {
            x: targetPos.x,
            y: rigTargetY,
            z: targetPos.z,
            duration: 1.5,
            ease: this.VOLTERA_EASE,
            onComplete: () => {
                if (onComplete) onComplete();
            }
        });
    }

    exitZoom(onComplete) {
        // Return to the "Rail"
        // Key requirement: Return to the Z position dictated by CURRENT scroll.
        const targetZ = this._calculateZForProgress(this.scrollProgress);

        gsap.to(this.position, {
            x: 0,
            y: 0, // Rig usually stays at Y=0
            z: targetZ,
            duration: 1.2,
            ease: this.VOLTERA_EASE,
            onComplete: () => {
                this.isZooming = false;
                if (onComplete) onComplete();
            }
        });
    }

    // --- GETTERS ---

    get cameraWorldPosition() {
        this.camera.getWorldPosition(this._worldPos);
        return this._worldPos;
    }

    dispose() {
        gsap.killTweensOf(this.rotationProxy);
        gsap.killTweensOf(this.position);

        // Reparent camera back to scene or just leave it?
        // Usually good practice to not leave it inside a disposed group if the camera persists.
        // But here the stage owns the camera. 
        // We should probably detach it if we are destroying the rig but keeping the camera.
        // But usually, we destroy the whole stage.
        // Let's just remove it.
        this.remove(this.camera);
    }
}
