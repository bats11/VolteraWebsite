import * as THREE from 'three';
// gsap is expected to be global

export class ShowcaseInteraction {
    constructor(uiConfig, rig, scene, outlinePass, ground) {
        // UI Config contains: { container, section, hud, cssLayer }
        this.container = uiConfig.container;
        this.section = uiConfig.section;
        this.hudElements = uiConfig.hud || {}; // { hud, hudRef, hudStatus }

        this.rig = rig; // Replaced this.camera with this.rig
        this.scene = scene;
        this.outlinePass = outlinePass;
        this.ground = ground;

        // --- CONSTANTS ---
        this.SCROLL_PHASES = {
            approachLimit: 0.3,
            carouselLimit: 0.7
        };

        this.DRAG_LIMIT = 0.25;
        this.DRAG_SENSITIVITY = 0.001;

        // --- STATE ---
        this.monoliths = [];
        this.projectLabels = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.mouseWorld = new THREE.Vector3(0, 0, 0);

        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };

        // Input Rotation State (Accumulated Drag)
        // We maintain this here and feed it to the Rig
        this.inputRotation = { x: 0, y: 0 };

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
        // Label Visuals (Scale & Z-Index)
        // We access the wrapper group inside the rig for the camera
        const cameraPos = this.rig.cameraWorldPosition; // Uses getter

        const labelWorldPos = new THREE.Vector3();
        this.projectLabels.forEach(labelData => {
            // Get world position of the wrapper object
            labelData.object.getWorldPosition(labelWorldPos);
            this.updateLabelVisuals(labelData, cameraPos, labelWorldPos);
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
        if (this.rig.isZooming) return;

        if (this.isDragging) {
            const dx = event.clientX - this.dragStart.x;
            const dy = event.clientY - this.dragStart.y;

            // Calculate target rotation
            let targetY = this.inputRotation.y - dx * this.DRAG_SENSITIVITY;
            let targetX = this.inputRotation.x - dy * this.DRAG_SENSITIVITY;

            targetY = Math.max(-this.DRAG_LIMIT, Math.min(this.DRAG_LIMIT, targetY));
            targetX = Math.max(-this.DRAG_LIMIT, Math.min(this.DRAG_LIMIT, targetX));

            // Update State
            this.inputRotation.x = targetX;
            this.inputRotation.y = targetY;

            // Feed into Rig
            this.rig.setRotationTarget(targetX, targetY);

            this.dragStart.x = event.clientX;
            this.dragStart.y = event.clientY;
        }

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Raycasting for Hover
        // Rig contains the camera, but raycaster needs the camera itself
        this.raycaster.setFromCamera(this.mouse, this.rig.camera);

        // Plane intersection for potential floor cursor logic
        // const planeZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        // this.raycaster.ray.intersectPlane(planeZ, this.mouseWorld);

        this.updateHoverState();
    }

    onPointerDown(event) {
        this.tapStartTime = Date.now();
        this.tapStartPos.x = event.clientX;
        this.tapStartPos.y = event.clientY;

        if (!this.isTouchDevice && !this.rig.isZooming) {
            this.isDragging = true;
            this.dragStart.x = event.clientX;
            this.dragStart.y = event.clientY;
            this.container.style.cursor = 'grabbing';
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
        }
    }

    handleClick(event) {
        if (this.rig.isZooming || this.monoliths.length === 0) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.rig.camera);
        const intersects = this.raycaster.intersectObjects(this.monoliths, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) obj = obj.parent;
            if (obj.userData.id) {
                this.rig.zoomTo(obj, () => {
                    window.dispatchEvent(new CustomEvent('vltProjectSelect', { detail: obj.userData }));
                });
            }
        }
    }

    updateHoverState() {
        if (this.monoliths.length === 0) return;

        this.raycaster.setFromCamera(this.mouse, this.rig.camera);
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
        // ... (Logic remains identical to original, just keeping it clean)
        // For brevity in this file rewrite, I am omitting the unchanged complex animation helpers,
        // BUT wait, I need to provide the FULL file content or `write_to_file` will replace it with truncated code?
        // `write_to_file` replaces the ENTIRE file.
        // I MUST RE-INCLUDE ALL HELPER METHODS.

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

    onProjectClose() {
        this.rig.exitZoom(() => {
            this.updateCameraFromScroll(); // Ensure we are back in sync
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

        // --- DELEGATE CAMERA TO RIG ---
        this.rig.update(this.scrollProgress);

        // --- MANAGE RING ROTATION (SCENE LOGIC) ---
        // This remains here or should move to scene-showcase, but it's fine here for now.
        // It relies on phases similar to the camera.

        if (!this.rig.isZooming) {
            const phases = this.SCROLL_PHASES;
            const p1 = phases.approachLimit;
            const p2 = phases.carouselLimit;

            const numMonoliths = this.monoliths.length;
            const totalSlots = numMonoliths + 1;
            const stepAngle = (Math.PI * 2) / totalSlots;

            let targetY = 0;

            // APPROACH (0 -> p1): Reset Ring
            if (this.scrollProgress <= p1) {
                targetY = 0;
            }
            // CAROUSEL (p1 -> p2): Rotate Ring to snapped index
            else if (this.scrollProgress <= p2) {
                const t = (this.scrollProgress - p1) / (p2 - p1);
                const floatIndex = t * numMonoliths;
                const targetIndex = Math.round(floatIndex);
                targetY = -(targetIndex * stepAngle);
            }
            // DEPARTURE (p2 -> 1.0): Ring stays rotated at final gap
            else {
                targetY = -(numMonoliths * stepAngle);
            }

            // APPLICA TRANSIZIONE FLUIDA CON GSAP (Voltera Ease)
            if (this.monolithRing) {
                gsap.to(this.monolithRing.rotation, {
                    y: targetY,
                    duration: 0.8, // Durata della transizione tra uno scatto e l'altro
                    ease: "cubic-bezier(0.16, 1, 0.3, 1)",
                    overwrite: 'auto'
                });
            }

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
            .to(this.outlinePass, { edgeStrength: 0.0, duration: 2.0, ease: "cubic-bezier(0.16, 1, 0.3, 1)" });
    }

    checkMobileHUDTrigger() {
        let closestMonolith = null;
        let closestDist = Infinity;

        // We need RIG position now
        const rigZ = this.rig.position.z;

        this.monoliths.forEach(m => {
            const dist = Math.abs(m.position.z - rigZ);
            if (dist < closestDist && dist < 8) {
                closestDist = dist;
                closestMonolith = m;
            }
        });

        if (closestMonolith && closestMonolith !== this.currentHoveredMonolith) {
            // ... same logic as before ... (abbreviated for brevity in thought, but must be full in file)
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

        // Rig disposal is handled by Orchestrator
    }
}
