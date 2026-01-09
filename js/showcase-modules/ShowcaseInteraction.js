import * as THREE from 'three';
import gsap from 'gsap';

export class ShowcaseInteraction {
    constructor(container, camera, scene, outlinePass, ground, hudElements) {
        this.container = container;
        this.camera = camera;
        this.scene = scene; // Keep for potential global needs
        this.outlinePass = outlinePass;
        this.ground = ground;
        this.hudElements = hudElements; // { hud, hudRef, hudStatus }

        // --- CONSTANTS ---
        this.TRAVEL_CONFIG = {
            startZ: 20,
            endZ: -60,
            travelFinishThreshold: 0.8
        };
        // Fallback if custom ease is not defined
        this.VOLTERA_EASE = "power4.out";
        this.EASE_ACTIVE = typeof CustomEase !== 'undefined' ? "voltera" : this.VOLTERA_EASE;
        this.DRAG_LIMIT = 0.25;
        this.DRAG_SENSITIVITY = 0.001;
        this.LABEL_VISIBILITY = { fadeInStart: 25, fadeInEnd: 10, inertiaFactor: 0.08 };

        // --- STATE ---
        this.monoliths = [];
        this.projectLabels = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.mouseWorld = new THREE.Vector3(0, 0, 0);

        this.isZooming = false;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cameraRotation = {
            targetX: 0, targetY: 0,
            currentX: 0, currentY: 0
        };
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

    setTargets(monoliths) {
        this.monoliths = monoliths || [];
    }

    setLabels(projectLabels) {
        this.projectLabels = projectLabels || [];
    }

    resize(width, height) {
        // Raycaster update is handled in onMouseMove/handleClick using container bounds,
        // but if we had cached rects we would update them here.
        // Primarily useful if we did specific resolution dependent logic.
        // For now, no specific resize logic needed internally as we calculate relative to rect on event,
        // but good to have for future proofing.
    }

    update(time) {
        // Camera Drag Inertia
        this.cameraRotation.currentX += (this.cameraRotation.targetX - this.cameraRotation.currentX) * 0.1;
        this.cameraRotation.currentY += (this.cameraRotation.targetY - this.cameraRotation.currentY) * 0.1;

        if (!this.isZooming) {
            this.camera.quaternion.copy(this.initialCameraQuaternion);
            this.camera.rotateY(this.cameraRotation.currentY);
            this.camera.rotateX(this.cameraRotation.currentX);
        }

        // Label Opacity
        const labelWorldPos = new THREE.Vector3();
        this.projectLabels.forEach(labelData => {
            this.updateLabelOpacity(labelData, this.camera.position, labelWorldPos);
        });
    }

    updateLabelOpacity(labelData, cameraPos, labelWorldPos) {
        labelData.object.getWorldPosition(labelWorldPos);
        const distance = cameraPos.distanceTo(labelWorldPos);
        let targetOpacity;
        if (distance >= this.LABEL_VISIBILITY.fadeInStart) targetOpacity = 0;
        else if (distance <= this.LABEL_VISIBILITY.fadeInEnd) targetOpacity = 1;
        else targetOpacity = 1 - (distance - this.LABEL_VISIBILITY.fadeInEnd) / (this.LABEL_VISIBILITY.fadeInStart - this.LABEL_VISIBILITY.fadeInEnd);

        if (labelWorldPos.z > cameraPos.z + 5) targetOpacity = 0;

        const current = labelData.object.userData.currentOpacity;
        const newOpacity = current + (targetOpacity - current) * this.LABEL_VISIBILITY.inertiaFactor;
        labelData.object.userData.currentOpacity = newOpacity;
        labelData.element.style.opacity = newOpacity.toFixed(3);
    }

    // --- INPUT HANDLERS ---

    onMouseMove(event) {
        if (this.isZooming) return;

        if (this.isDragging) {
            const dx = event.clientX - this.dragStart.x;
            const dy = event.clientY - this.dragStart.y;
            this.cameraRotation.targetY -= dx * this.DRAG_SENSITIVITY;
            this.cameraRotation.targetX -= dy * this.DRAG_SENSITIVITY;
            this.cameraRotation.targetY = Math.max(-this.DRAG_LIMIT, Math.min(this.DRAG_LIMIT, this.cameraRotation.targetY));
            this.cameraRotation.targetX = Math.max(-this.DRAG_LIMIT, Math.min(this.DRAG_LIMIT, this.cameraRotation.targetX));
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

        // If pulse animation runs, stop it on hover
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

        // Outline Pass Management
        if (isHovered && this.outlinePass.selectedObjects[0] !== monolith) {
            this.outlinePass.selectedObjects = [monolith];
        }

        // Material & Transform Animations
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

        // HUD Sync
        this.projectLabels.forEach(label => {
            if (label.element.dataset.projectId === projectId) {
                label.element.classList.toggle('is-active', isHovered);
            }
        });
    }

    // --- HUD ---
    showHUD(data) {
        if (!this.hudElements.hud || !this.hudElements.hudRef || !this.hudElements.hudStatus) return;
        this.hudElements.hudRef.textContent = data.ref;
        this.hudElements.hudStatus.textContent = data.status;
        this.hudElements.hud.classList.add('active');
    }

    hideHUD() {
        if (!this.hudElements.hud) return;
        this.hudElements.hud.classList.remove('active');
    }

    // --- CAMERA MOVEMENTS ---
    zoomToProject(monolith) {
        this.cameraSnapshot.copy(this.camera.position);
        this.isZooming = true;

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
                this.isZooming = false;
                this.updateCameraFromScroll();
            }
        });
    }

    updateCameraFromScroll() {
        // Need to get the showcase section element safely.
        // We can look it up here or pass it in dependency. Pass it in dependency is better but for now let's query it.
        // Or cleaner: since we have container, we can use that?
        // In main code it was: const section = document.getElementById('showcase');
        // Let's assume container is the showcase div or child of it?
        // Actually the container passed to initShowcaseMap is usually the canvas container.
        // Let's rely on global scroll and finding the element for now as per previous logic, or just assume the container parent is the section if appropriate.
        // But to be safe and strictly follow previous code structure:
        const section = document.getElementById('showcase');
        if (!section) return;

        const rect = section.getBoundingClientRect();
        const sectionHeight = section.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;
        this.scrollProgress = Math.max(0, Math.min(1, scrolled / sectionHeight));

        if (this.scrollProgress > 0.0001 && !this.pulseTriggered) {
            this.triggerSystemBlink();
            this.pulseTriggered = true;
        }

        // Ground Fade
        if (this.ground && this.ground.material) {
            const fadeStart = this.TRAVEL_CONFIG.travelFinishThreshold;
            const fadeEnd = 0.95;
            let groundAlpha = 1.0;
            if (this.scrollProgress >= fadeStart) {
                const fadeProgress = (this.scrollProgress - fadeStart) / (fadeEnd - fadeStart);
                groundAlpha = Math.max(0, 1 - fadeProgress);
            }
            this.ground.material.opacity = groundAlpha;
        }

        if (!this.isZooming) {
            const { startZ, endZ, travelFinishThreshold } = this.TRAVEL_CONFIG;
            let targetZ;
            if (this.scrollProgress < travelFinishThreshold) {
                const travelProgress = this.scrollProgress / travelFinishThreshold;
                const easedProgress = 1 - (1 - travelProgress) * (1 - travelProgress);
                targetZ = startZ + (endZ - startZ) * easedProgress;
            } else {
                targetZ = endZ;
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
            .to(this.outlinePass, { edgeStrength: 0.0, duration: 2.0, ease: this.EASE_ACTIVE });
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
    }
}
