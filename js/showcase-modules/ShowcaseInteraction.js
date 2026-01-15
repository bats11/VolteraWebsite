import * as THREE from 'three';
// gsap is expected to be global

export class ShowcaseInteraction {
    constructor(uiConfig, camera, scene, outlinePass, ground) {
        // UI Config contains: { container, section, hud, cssLayer }
        this.container = uiConfig.container;
        this.section = uiConfig.section;
        this.hudElements = uiConfig.hud || {}; // { hud, hudRef, hudStatus }

        this.camera = camera;
        this.scene = scene;
        this.outlinePass = outlinePass;
        this.ground = ground;

        // --- CONSTANTS ---
        this.TRAVEL_CONFIG = {
            startZ: 20,
            endZ: -120, // Updated to fly through further
        };
        // SCROLL PHASES (Configurable thresholds)
        this.SCROLL_PHASES = {
            approachLimit: 0.3,
            carouselLimit: 0.7
        };

        // Voltera Ease: cubic-bezier(0.16, 1, 0.3, 1)
        this.VOLTERA_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
        this.DRAG_LIMIT = 0.25;
        this.DRAG_SENSITIVITY = 0.001;
        this.LABEL_VISIBILITY = { fadeInStart: 25, fadeInEnd: 10, inertiaFactor: 0.08 };

        // --- STATE ---
        this.monoliths = [];
        this.projectLabels = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.mouseWorld = new THREE.Vector3(0, 0, 0);

        this.isZooming = false; // "Cinematic Mode" flag
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };

        // GSAP quickTo proxies
        this.rotationProxy = { x: 0, y: 0 };
        // We initialize these in initListeners or later to ensure gsap is ready, 
        // but safe to do here if gsap is global.

        // Setup quickTo for camera rotation
        this.rotateXTo = gsap.quickTo(this.rotationProxy, "x", { duration: 0.6, ease: this.VOLTERA_EASE });
        this.rotateYTo = gsap.quickTo(this.rotationProxy, "y", { duration: 0.6, ease: this.VOLTERA_EASE });

        this.initialCameraQuaternion = new THREE.Quaternion().copy(this.camera.quaternion);
        this.cameraSnapshot = new THREE.Vector3();

        this.currentHoveredMonolith = null;
        this.pulseTriggered = false;
        this.pulseTimeline = null;
        this.scrollProgress = 0;

        // --- CLICK HANDLING STATE ---
        this.tapStartTime = 0;
        this.tapStartPos = { x: 0, y: 0 };

        // --- BINDINGS ---
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.updateCameraFromScroll = this.updateCameraFromScroll.bind(this);
        this.onProjectClose = this.onProjectClose.bind(this);

        // --- INIT LISTENERS ---
        this.isTouchDevice = window.matchMedia('(hover: none)').matches;
        this.initListeners();
    }

    initListeners() {
        if (!this.isTouchDevice) {
            this.container.addEventListener('mousemove', this.onMouseMove);
        }
        this.container.addEventListener('pointerdown', this.onPointerDown);
        this.container.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('scroll', this.updateCameraFromScroll);
        window.addEventListener('vltProjectClose', this.onProjectClose);
    }

    setTargets(monoliths, ring) {
        this.monoliths = monoliths || [];
        this.monolithRing = ring;
    }

    setLabels(projectLabels) {
        this.projectLabels = projectLabels || [];
    }

    resize(width, height) {
        // Recalculate generic scroll progress to avoid jumps
        this.updateCameraFromScroll();
    }

    update(time, delta) {
        // 1. Apply Camera Rotation (from quickTo proxy)
        // Only if not zooming/cinematic
        if (!this.isZooming) {
            this.camera.quaternion.copy(this.initialCameraQuaternion);
            // Apply current proxy values
            this.camera.rotateY(this.rotationProxy.y);
            this.camera.rotateX(this.rotationProxy.x);
        }

        // 2. Label Visuals (Scale & Z-Index)
        const labelWorldPos = new THREE.Vector3();
        this.projectLabels.forEach(labelData => {
            // Get world position of the wrapper object
            labelData.object.getWorldPosition(labelWorldPos);
            this.updateLabelVisuals(labelData, this.camera.position, labelWorldPos);
        });
    }

    updateLabelVisuals(labelData, cameraPos, labelWorldPos) {
        const distance = cameraPos.distanceTo(labelWorldPos);

        // Visual Scaling Logic
        const referenceDistance = 15;
        let scale = referenceDistance / distance;

        // Clamp scale
        scale = Math.max(0.4, Math.min(1.0, scale));

        // Apply scale to the inner element
        labelData.element.style.transform = `scale(${scale.toFixed(3)})`;
        labelData.element.style.opacity = "1"; // Always visible as per request

        // Z-Index Sorting
        const zIndex = Math.floor(1000 - distance);
        labelData.object.element.style.zIndex = zIndex; // Apply z-index to wrapper (CSS2DObject element)
    }

    // --- INPUT HANDLERS ---

    onMouseMove(event) {
        if (this.isZooming) return;

        if (this.isDragging) {
            const dx = event.clientX - this.dragStart.x;
            const dy = event.clientY - this.dragStart.y;

            // Calculate target rotation
            let targetY = this.rotationProxy.y - dx * this.DRAG_SENSITIVITY;
            let targetX = this.rotationProxy.x - dy * this.DRAG_SENSITIVITY;

            targetY = Math.max(-this.DRAG_LIMIT, Math.min(this.DRAG_LIMIT, targetY));
            targetX = Math.max(-this.DRAG_LIMIT, Math.min(this.DRAG_LIMIT, targetX));

            // Feed into quickTo
            this.rotateYTo(targetY);
            this.rotateXTo(targetX);

            this.dragStart.x = event.clientX;
            this.dragStart.y = event.clientY;
        }

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const planeZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.ray.intersectPlane(planeZ, this.mouseWorld);

        this.updateHoverState();
    }

    onPointerDown(event) {
        this.tapStartTime = Date.now();
        this.tapStartPos.x = event.clientX;
        this.tapStartPos.y = event.clientY;

        if (!this.isTouchDevice && !this.isZooming) {
            this.isDragging = true;
            this.dragStart.x = event.clientX;
            this.dragStart.y = event.clientY;
            this.container.style.cursor = 'grabbing';

            // When dragging starts, we might want to make the settle time longer? 
            // Or keep it snappy. "active" state = 0.6s.
            // When user releases, maybe we drift? 
            // For now, keeping the configured quickTo duration.
        }
    }

    onPointerUp(event) {
        this.isDragging = false;
        this.container.style.cursor = 'grab';

        const tapDuration = Date.now() - this.tapStartTime;
        const tapDistance = Math.hypot(
            event.clientX - this.tapStartPos.x,
            event.clientY - this.tapStartPos.y
        );

        if (tapDuration < 300 && tapDistance < 10) {
            this.handleClick(event);
        } else {
            // Drag ended, let it settle.
            // Option: Increase duration for a "drift" effect?
            // this.rotateXTo.tween.duration(1.2); 
            // Not readily available in quickTo API directly without creating new tween or recreating.
            // We'll stick to uniform Voltera feel for now.
        }
    }

    handleClick(event) {
        if (this.isZooming || this.monoliths.length === 0) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.monoliths, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) obj = obj.parent;
            if (obj.userData.id) this.zoomToProject(obj);
        }
    }

    updateHoverState() {
        if (this.monoliths.length === 0) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.monoliths, true);

        if (intersects.length > 0 && this.pulseTimeline && this.pulseTimeline.isActive()) {
            this.pulseTimeline.kill();
            this.pulseTimeline = null;
            this.outlinePass.selectedObjects = [];
            this.outlinePass.edgeStrength = 0;
        }

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) obj = obj.parent;

            if (obj.userData.id && this.currentHoveredMonolith !== obj) {
                if (this.currentHoveredMonolith) {
                    this.updateBeaconHoverState(this.currentHoveredMonolith.userData.id, false);
                }
                this.currentHoveredMonolith = obj;
                this.showHUD(obj.userData);
                this.updateBeaconHoverState(obj.userData.id, true);
            }
        } else if (this.currentHoveredMonolith) {
            this.updateBeaconHoverState(this.currentHoveredMonolith.userData.id, false);
            this.currentHoveredMonolith = null;
            this.hideHUD();
        }
    }

    updateBeaconHoverState(projectId, isHovered) {
        const EASE_IGNITION = "cubic-bezier(0.16, 1, 0.3, 1)";
        const EASE_DECAY = "power2.out";

        const monolith = this.monoliths.find(m => m.userData.id === projectId);
        if (!monolith) return;

        if (isHovered && this.outlinePass.selectedObjects[0] !== monolith) {
            this.outlinePass.selectedObjects = [monolith];
        }

        const materials = [];
        monolith.traverse(child => {
            if (child.isMesh && child.material) materials.push(child.material);
        });

        const targetIntensity = isHovered ? (monolith.userData.intensity ?? 2.0) : 0;
        const duration = isHovered ? 0.6 : 1.5;
        const ease = isHovered ? EASE_IGNITION : EASE_DECAY;

        gsap.to(materials, {
            emissiveIntensity: targetIntensity,
            duration: duration,
            ease: ease,
            overwrite: true
        });

        if (isHovered) {
            gsap.to(this.outlinePass, {
                edgeStrength: 2.5, duration: 0.6, ease: EASE_IGNITION, overwrite: true
            });
            if (monolith.userData.breathTimeline) monolith.userData.breathTimeline.kill();
            monolith.userData.breathTimeline = gsap.timeline({ repeat: -1, yoyo: true });
            monolith.userData.breathTimeline.to(monolith.scale, {
                x: 1.05, y: 1.05, z: 1.05, duration: 2.0, ease: "sine.inOut", overwrite: 'auto'
            });
        } else {
            if (this.outlinePass.selectedObjects[0] === monolith) {
                gsap.to(this.outlinePass, {
                    edgeStrength: 0.0, duration: 0.4, ease: "power2.out", overwrite: true
                });
            }
            if (monolith.userData.breathTimeline) {
                monolith.userData.breathTimeline.kill();
                monolith.userData.breathTimeline = null;
            }
            gsap.to(monolith.scale, {
                x: 1.0, y: 1.0, z: 1.0, duration: 1.5, ease: "power2.out", overwrite: 'auto'
            });
        }

        this.projectLabels.forEach(label => {
            if (label.element.dataset.projectId === projectId) {
                label.element.classList.toggle('is-active', isHovered);
            }
        });
    }

    showHUD(data) {
        if (!this.hudElements.hud) return;
        if (this.hudElements.hudRef) this.hudElements.hudRef.textContent = data.ref;
        if (this.hudElements.hudStatus) this.hudElements.hudStatus.textContent = data.status;
        this.hudElements.hud.classList.add('active');
    }

    hideHUD() {
        if (!this.hudElements.hud) return;
        this.hudElements.hud.classList.remove('active');
    }

    zoomToProject(monolith) {
        this.cameraSnapshot.copy(this.camera.position);
        this.isZooming = true; // Locks quickTo updates

        const targetPos = monolith.position.clone();
        targetPos.z += 5;
        targetPos.y += 1;

        gsap.to(this.camera.position, {
            x: targetPos.x, y: targetPos.y, z: targetPos.z,
            duration: 1.5, ease: this.VOLTERA_EASE,
            onComplete: () => {
                window.dispatchEvent(new CustomEvent('vltProjectSelect', { detail: monolith.userData }));
            }
        });
    }

    onProjectClose() {
        gsap.to(this.camera.position, {
            x: this.cameraSnapshot.x, y: this.cameraSnapshot.y, z: this.cameraSnapshot.z,
            duration: 1.2, ease: this.VOLTERA_EASE,
            onComplete: () => {
                this.isZooming = false; // Unlocks quickTo
                this.updateCameraFromScroll(); // Reset position
            }
        });
    }

    updateCameraFromScroll() {
        if (!this.section) return;

        const rect = this.section.getBoundingClientRect();
        const sectionHeight = this.section.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;

        // Clamp scroll progress [0, 1]
        this.scrollProgress = Math.max(0, Math.min(1, scrolled / sectionHeight));

        if (this.scrollProgress > 0.0001 && !this.pulseTriggered) {
            this.triggerSystemBlink();
            this.pulseTriggered = true;
        }

        // Logic for Ground Fade (optional/legacy, keeping safe)
        if (this.ground && this.ground.material) {
            // ... existing ground fade logic or simplified ...
            // For now letting it be, but phase logic takes priority for camera.
        }

        if (!this.isZooming) {
            const { startZ, endZ } = this.TRAVEL_CONFIG;
            const phases = this.SCROLL_PHASES;

            // Phase Thresholds
            const p1 = phases.approachLimit;  // e.g. 0.3
            const p2 = phases.carouselLimit;  // e.g. 0.7

            // Target Values
            const viewZ = -40; // The "Viewing" position (Carousel center is -80, radius 30 => front is -50. -40 is nice viewing spot)

            let targetZ = startZ;

            // --- PHASE 1: APPROACH (0 -> p1) ---
            if (this.scrollProgress <= p1) {
                // Map [0, p1] to [startZ, viewZ]
                const t = this.scrollProgress / p1;
                // Ease out cubic for arrival
                const ease = 1 - Math.pow(1 - t, 3);
                targetZ = startZ + (viewZ - startZ) * ease;

                // Reset Ring Rotation
                if (this.monolithRing) this.monolithRing.rotation.y = 0;
            }
            // --- PHASE 2: CAROUSEL (p1 -> p2) ---
            else if (this.scrollProgress <= p2) {
                // Locked at View Position
                targetZ = viewZ;

                // Rotate Ring
                // Map [p1, p2] to [0, Math.PI * 2] (Full rotation?)
                // Or maybe partial rotation depending on project count.
                // Let's do 1 full revolution for now.
                const t = (this.scrollProgress - p1) / (p2 - p1);

                // Linear rotation feel usually best for scroll-scrubbing
                if (this.monolithRing) {
                    this.monolithRing.rotation.y = t * Math.PI * 2;
                }
            }
            // --- PHASE 3: DEPARTURE (p2 -> 1.0) ---
            else {
                // Ring stays rotated
                if (this.monolithRing) this.monolithRing.rotation.y = Math.PI * 2;

                // Departure: viewZ -> endZ
                const t = (this.scrollProgress - p2) / (1.0 - p2);
                // Ease in cubic for departure speedup
                const ease = t * t * t;
                targetZ = viewZ + (endZ - viewZ) * ease;
            }

            this.camera.position.z = targetZ;

            if (this.isTouchDevice) {
                this.checkMobileHUDTrigger();
            }
        }
    }

    triggerSystemBlink() {
        this.outlinePass.selectedObjects = this.monoliths;
        this.pulseTimeline = gsap.timeline({
            onComplete: () => {
                this.outlinePass.selectedObjects = [];
                this.pulseTimeline = null;
            }
        })
            .to(this.outlinePass, { edgeStrength: 4.0, duration: 0.1 })
            .to(this.outlinePass, { edgeStrength: 1.0, duration: 0.2 })
            .to(this.outlinePass, { edgeStrength: 4.0, duration: 0.1 })
            .to(this.outlinePass, { edgeStrength: 0.0, duration: 2.0, ease: this.VOLTERA_EASE });
    }

    checkMobileHUDTrigger() {
        let closestMonolith = null;
        let closestDist = Infinity;

        this.monoliths.forEach(m => {
            const dist = Math.abs(m.position.z - this.camera.position.z);
            if (dist < closestDist && dist < 8) {
                closestDist = dist;
                closestMonolith = m;
            }
        });

        if (closestMonolith && closestMonolith !== this.currentHoveredMonolith) {
            if (this.currentHoveredMonolith) this.updateBeaconHoverState(this.currentHoveredMonolith.userData.id, false);
            this.currentHoveredMonolith = closestMonolith;
            this.showHUD(closestMonolith.userData);
            this.updateBeaconHoverState(closestMonolith.userData.id, true);
        } else if (!closestMonolith && this.currentHoveredMonolith) {
            this.updateBeaconHoverState(this.currentHoveredMonolith.userData.id, false);
            this.currentHoveredMonolith = null;
            this.hideHUD();
        }
    }

    dispose() {
        this.container.removeEventListener('mousemove', this.onMouseMove);
        this.container.removeEventListener('pointerdown', this.onPointerDown);
        this.container.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('scroll', this.updateCameraFromScroll);
        window.removeEventListener('vltProjectClose', this.onProjectClose);

        if (this.pulseTimeline) this.pulseTimeline.kill();
        this.monoliths.forEach(m => {
            if (m.userData.breathTimeline) m.userData.breathTimeline.kill();
        });

        // QuickTo instances are just functions, but they create tweens on the target object.
        // The orchestrator's ctx.revert() will handle cleaning up those underlying tweens.
    }
}
