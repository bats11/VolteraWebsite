import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import ResizeManager from './resize-manager.js';
import { ShowcaseFactory } from './showcase-modules/ShowcaseFactory.js';


/**
 * Showcase "The Infinite Map" - Three.js Scene Module
 * @param {HTMLElement} containerElement - The container element for the scene
 */
export function initShowcaseMap(containerElement) {
    // --- DOM ELEMENTS ---
    const container = containerElement;
    if (!container) return;
    const section = document.getElementById('showcase');
    const hud = document.getElementById('showcase-hud');
    const hudRef = hud?.querySelector('.hud-ref');
    const hudStatus = hud?.querySelector('.hud-status');
    const projectDetail = document.getElementById('project-detail');

    if (!container || !section) return;

    // --- UI INIT ---
    // Camera reset will be handled by the global orchestrator response
    window.addEventListener('vltProjectClose', () => {
        resetCamera();
    });

    // --- CONSTANTS ---
    const TRAVEL_CONFIG = {
        startZ: 20,
        endZ: -60,
        travelFinishThreshold: 0.8
    };
    // Fallback if GSAP CustomEase is not defined
    const VOLTERA_EASE = "power4.out";
    const EASE_ACTIVE = typeof CustomEase !== 'undefined' ? "voltera" : VOLTERA_EASE;

    // --- DEVICE DETECTION ---
    const isTouchDevice = window.matchMedia('(hover: none)').matches;

    // --- SCENE STATE ---
    let scene, camera, renderer, composer, outlinePass;
    let directionalLight, ambientLight;
    let monoliths = []; // Initialize empty array immediately
    let projectLabels = []; // Initialize empty array immediately
    let factory; // Factory instance

    let raycaster, mouse;

    // Interaction State
    let isZooming = false;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let cameraSnapshot = new THREE.Vector3();
    let currentHoveredMonolith = null;
    let scrollProgress = 0;
    let isRunning = false;
    let rafId = null;
    let pulseTriggered = false;
    let pulseTimeline = null;

    // Camera Rotation State
    const cameraRotation = {
        targetX: 0, targetY: 0,
        currentX: 0, currentY: 0
    };
    const DRAG_LIMIT = 0.25;
    const DRAG_SENSITIVITY = 0.001;
    let initialCameraQuaternion = new THREE.Quaternion();


    // --- 1. SCENE SETUP (MUST BE FIRST) ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);
    scene.fog = new THREE.FogExp2(0x080808, 0.025);

    camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 2, TRAVEL_CONFIG.startZ);
    camera.lookAt(0, 0, 0);
    initialCameraQuaternion.copy(camera.quaternion);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x080808, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // --- CSS2D LABEL RENDERER ---
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

    // --- 2. LIGHTING & ENVIRONMENT ---
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 4);
    directionalLight.position.set(10, 20, 10);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;

    // Shadow Config
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;

    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({
            color: 0x050505, roughness: 0.9, metalness: 0.1,
            dithering: true, transparent: true, opacity: 1.0
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Backdrop
    const backdropGeometry = new THREE.SphereGeometry(500, 32, 32);
    const backdropMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uHeight: { value: 200.0 },
            uOffset: { value: 50.0 },
            uColorTop: { value: new THREE.Color(0x1a1a1a) },
            uColorBottom: { value: new THREE.Color(0x000000) }
        },
        vertexShader: `
            varying float vWorldY;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldY = worldPosition.y;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform float uHeight; uniform float uOffset;
            uniform vec3 uColorTop; uniform vec3 uColorBottom;
            varying float vWorldY;
            float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
            void main() {
                float adjustedY = vWorldY + uOffset;
                float gradientFactor = smoothstep(0.0, uHeight, adjustedY);
                vec3 finalColor = mix(uColorBottom, uColorTop, gradientFactor);
                float noise = (random(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);
                float ditherFade = 1.0 - smoothstep(0.8, 1.0, gradientFactor);
                finalColor += noise * ditherFade;
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        side: THREE.BackSide, fog: false, toneMapped: false
    });
    const backdropMesh = new THREE.Mesh(backdropGeometry, backdropMaterial);
    backdropMesh.name = 'backdrop';
    scene.add(backdropMesh);


    // --- 3. SHOWCASE FACTORY (INITIALIZE HERE, AFTER SCENE/RENDERER) ---
    // !!! CRUCIAL FIX: Scene and Renderer must exist before Factory is created !!!
    factory = new ShowcaseFactory(scene, renderer);
    factory.build().then(data => {
        monoliths = data.monoliths;
        projectLabels = data.projectLabels;
    });


    // --- 4. POST PROCESSING ---
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearColor = new THREE.Color(0x080808);
    renderPass.clearAlpha = 1;
    composer.addPass(renderPass);

    outlinePass = new OutlinePass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        scene,
        camera
    );
    outlinePass.edgeStrength = 0.0;
    outlinePass.edgeGlow = 0.6;
    outlinePass.edgeThickness = 0.01;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.set('#FFFFFF');
    outlinePass.hiddenEdgeColor.set('#000000');
    composer.addPass(outlinePass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.6, 0.3, 0.85
    );
    composer.addPass(bloomPass);


    // --- RAYCASTER ---
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    let mouseWorld = new THREE.Vector3(0, 0, 0);

    // --- INPUT HANDLERS ---
    function onMouseMove(event) {
        if (isZooming) return;
        if (isDragging) {
            const dx = event.clientX - dragStart.x;
            const dy = event.clientY - dragStart.y;
            cameraRotation.targetY -= dx * DRAG_SENSITIVITY;
            cameraRotation.targetX -= dy * DRAG_SENSITIVITY;
            cameraRotation.targetY = Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, cameraRotation.targetY));
            cameraRotation.targetX = Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, cameraRotation.targetX));
            dragStart.x = event.clientX;
            dragStart.y = event.clientY;
        }
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.setFromCamera(mouse, camera);
        raycaster.ray.intersectPlane(planeZ, mouseWorld);
        updateHoverState();
    }

    function updateBeaconHoverState(projectId, isHovered) {
        // Voltera Eases Definition for internal use
        const EASE_IGNITION = "cubic-bezier(0.16, 1, 0.3, 1)";
        const EASE_DECAY = "power2.out";

        const monolith = monoliths.find(m => m.userData.id === projectId);
        if (monolith) {
            if (isHovered && outlinePass.selectedObjects[0] !== monolith) {
                outlinePass.selectedObjects = [monolith];
            }
            if (typeof gsap !== 'undefined') {
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
                    gsap.to(outlinePass, {
                        edgeStrength: 2.5, duration: 0.6, ease: EASE_IGNITION, overwrite: true
                    });
                    if (monolith.userData.breathTimeline) monolith.userData.breathTimeline.kill();
                    monolith.userData.breathTimeline = gsap.timeline({ repeat: -1, yoyo: true });
                    monolith.userData.breathTimeline.to(monolith.scale, {
                        x: 1.05, y: 1.05, z: 1.05, duration: 2.0, ease: "sine.inOut", overwrite: 'auto'
                    });
                } else {
                    if (outlinePass.selectedObjects[0] === monolith) {
                        gsap.to(outlinePass, {
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
            }
        }
        // HUD Sync
        projectLabels.forEach(label => {
            if (label.element.dataset.projectId === projectId) {
                label.element.classList.toggle('is-active', isHovered);
            }
        });
    }

    function updateHoverState() {
        if (monoliths.length === 0) return; // Safety check
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(monoliths, true);

        if (intersects.length > 0 && pulseTimeline && pulseTimeline.isActive()) {
            pulseTimeline.kill();
            pulseTimeline = null;
            outlinePass.selectedObjects = [];
            outlinePass.edgeStrength = 0;
        }

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) {
                obj = obj.parent;
            }
            if (obj.userData.id && currentHoveredMonolith !== obj) {
                if (currentHoveredMonolith) {
                    updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
                }
                currentHoveredMonolith = obj;
                showHUD(obj.userData);
                updateBeaconHoverState(obj.userData.id, true);
            }
        } else if (currentHoveredMonolith) {
            updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
            currentHoveredMonolith = null;
            hideHUD();
        }
    }

    function showHUD(data) {
        if (!hud || !hudRef || !hudStatus) return;
        hudRef.textContent = data.ref;
        hudStatus.textContent = data.status;
        hud.classList.add('active');
    }

    function hideHUD() {
        if (!hud) return;
        hud.classList.remove('active');
    }

    // --- CLICK HANDLING ---
    let tapStartTime = 0;
    let tapStartPos = { x: 0, y: 0 };
    function onPointerDown(event) {
        tapStartTime = Date.now();
        tapStartPos.x = event.clientX;
        tapStartPos.y = event.clientY;
        if (!isTouchDevice && !isZooming) {
            isDragging = true;
            dragStart.x = event.clientX;
            dragStart.y = event.clientY;
            container.style.cursor = 'grabbing';
        }
    }
    function onPointerUp(event) {
        isDragging = false;
        container.style.cursor = 'grab';
        const tapDuration = Date.now() - tapStartTime;
        const tapDistance = Math.hypot(
            event.clientX - tapStartPos.x, event.clientY - tapStartPos.y
        );
        if (tapDuration < 300 && tapDistance < 10) {
            handleClick(event);
        }
    }
    function handleClick(event) {
        if (isZooming || monoliths.length === 0) return;
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(monoliths, true);
        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) obj = obj.parent;
            if (obj.userData.id) zoomToProject(obj);
        }
    }

    // --- DOLLY ZOOM ---
    function zoomToProject(monolith) {
        if (!projectDetail) return;
        cameraSnapshot.copy(camera.position);
        isZooming = true;
        const targetPos = monolith.position.clone();
        targetPos.z += 5;
        targetPos.y += 1;
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: targetPos.x, y: targetPos.y, z: targetPos.z,
                duration: 1.5, ease: VOLTERA_EASE,
                onComplete: () => {
                    window.dispatchEvent(new CustomEvent('vltProjectSelect', { detail: monolith.userData }));
                }
            });
        }
    }

    function resetCamera() {
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: cameraSnapshot.x, y: cameraSnapshot.y, z: cameraSnapshot.z,
                duration: 1.2, ease: VOLTERA_EASE,
                onComplete: () => {
                    isZooming = false;
                    updateCameraFromScroll();
                }
            });
        } else {
            isZooming = false;
            updateCameraFromScroll();
        }
    }

    // --- SYSTEM BLINK & SCROLL ---
    function triggerSystemBlink() {
        if (typeof gsap === 'undefined') return;
        outlinePass.selectedObjects = monoliths;
        pulseTimeline = gsap.timeline({
            onComplete: () => {
                outlinePass.selectedObjects = [];
                pulseTimeline = null;
            }
        })
            .to(outlinePass, { edgeStrength: 4.0, duration: 0.1 })
            .to(outlinePass, { edgeStrength: 1.0, duration: 0.2 })
            .to(outlinePass, { edgeStrength: 4.0, duration: 0.1 })
            .to(outlinePass, { edgeStrength: 0.0, duration: 2.0, ease: EASE_ACTIVE });
    }

    function updateCameraFromScroll() {
        const rect = section.getBoundingClientRect();
        const sectionHeight = section.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;
        scrollProgress = Math.max(0, Math.min(1, scrolled / sectionHeight));

        if (scrollProgress > 0.0001 && !pulseTriggered) {
            triggerSystemBlink();
            pulseTriggered = true;
        }

        // Ground Fade
        const fadeStart = TRAVEL_CONFIG.travelFinishThreshold;
        const fadeEnd = 0.95;
        let groundAlpha = 1.0;
        if (scrollProgress >= fadeStart) {
            const fadeProgress = (scrollProgress - fadeStart) / (fadeEnd - fadeStart);
            groundAlpha = Math.max(0, 1 - fadeProgress);
        }
        if (ground && ground.material) ground.material.opacity = groundAlpha;

        if (!isZooming) {
            const { startZ, endZ, travelFinishThreshold } = TRAVEL_CONFIG;
            let targetZ;
            if (scrollProgress < travelFinishThreshold) {
                const travelProgress = scrollProgress / travelFinishThreshold;
                const easedProgress = 1 - (1 - travelProgress) * (1 - travelProgress);
                targetZ = startZ + (endZ - startZ) * easedProgress;
            } else {
                targetZ = endZ;
            }
            camera.position.z = targetZ;

            if (isTouchDevice) checkMobileHUDTrigger();
        }
    }

    function checkMobileHUDTrigger() {
        let closestMonolith = null;
        let closestDist = Infinity;
        monoliths.forEach(m => {
            const dist = Math.abs(m.position.z - camera.position.z);
            if (dist < closestDist && dist < 8) {
                closestDist = dist;
                closestMonolith = m;
            }
        });
        if (closestMonolith && closestMonolith !== currentHoveredMonolith) {
            if (currentHoveredMonolith) updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
            currentHoveredMonolith = closestMonolith;
            showHUD(closestMonolith.userData);
            updateBeaconHoverState(closestMonolith.userData.id, true);
        } else if (!closestMonolith && currentHoveredMonolith) {
            updateBeaconHoverState(currentHoveredMonolith.userData.id, false);
            currentHoveredMonolith = null;
            hideHUD();
        }
    }

    // --- EVENT LISTENERS ---
    if (!isTouchDevice) container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    window.addEventListener('scroll', updateCameraFromScroll);

    // --- RESIZE ---
    ResizeManager.subscribe(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        composer.setSize(width, height);
        if (labelRenderer) labelRenderer.setSize(width, height);
        if (outlinePass) outlinePass.setSize(width, height);
    });

    // --- LABEL OPACITY ---
    const LABEL_VISIBILITY = { fadeInStart: 25, fadeInEnd: 10, inertiaFactor: 0.08 };
    const labelWorldPos = new THREE.Vector3();
    function updateLabelOpacity(labelData, cameraPos) {
        labelData.object.getWorldPosition(labelWorldPos);
        const distance = cameraPos.distanceTo(labelWorldPos);
        let targetOpacity;
        if (distance >= LABEL_VISIBILITY.fadeInStart) targetOpacity = 0;
        else if (distance <= LABEL_VISIBILITY.fadeInEnd) targetOpacity = 1;
        else targetOpacity = 1 - (distance - LABEL_VISIBILITY.fadeInEnd) / (LABEL_VISIBILITY.fadeInStart - LABEL_VISIBILITY.fadeInEnd);

        if (labelWorldPos.z > cameraPos.z + 5) targetOpacity = 0;

        const current = labelData.object.userData.currentOpacity;
        const newOpacity = current + (targetOpacity - current) * LABEL_VISIBILITY.inertiaFactor;
        labelData.object.userData.currentOpacity = newOpacity;
        labelData.element.style.opacity = newOpacity.toFixed(3);
    }

    // --- ANIMATION LOOP ---
    function animate() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);
        const time = performance.now() * 0.001;

        // Factory internal updates (Core, Lightning, Rotation)
        if (factory) {
            factory.update(time);
        }

        // Scene Logic
        projectLabels.forEach(labelData => updateLabelOpacity(labelData, camera.position));
        if (labelRenderer) labelRenderer.render(scene, camera);

        // Camera Drag
        cameraRotation.currentX += (cameraRotation.targetX - cameraRotation.currentX) * 0.1;
        cameraRotation.currentY += (cameraRotation.targetY - cameraRotation.currentY) * 0.1;
        if (!isZooming) {
            camera.quaternion.copy(initialCameraQuaternion);
            camera.rotateY(cameraRotation.currentY);
            camera.rotateX(cameraRotation.currentX);
        }

        composer.render();
    }

    updateCameraFromScroll();
    console.log('[Showcase] The Infinite Map initialized');

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
            if (factory) factory.dispose();
            // Note: Renderer and Scene disposal should ideally be here if we want full cleanup
            // but for now we follow the Pause/Resume pattern.
            console.log('[Showcase] Resources disposed');
        }
    };
}