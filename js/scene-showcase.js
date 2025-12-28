import * as THREE from 'three';

/**
 * Showcase "The Infinite Map" - Three.js Scene Module
 * Explorable dark environment with monolith projects, scroll-driven camera,
 * and adaptive lighting (mouse-tracking desktop / torchlight mobile)
 * @param {Array} resizeCallbacks - Global resize callbacks array
 */
export function initShowcaseMap(resizeCallbacks) {
    // --- DOM ELEMENTS ---
    const container = document.getElementById('showcase-canvas');
    const section = document.getElementById('showcase');
    const hud = document.getElementById('showcase-hud');
    const hudRef = hud?.querySelector('.hud-ref');
    const hudStatus = hud?.querySelector('.hud-status');
    const projectDetail = document.getElementById('project-detail');
    const projectTitle = projectDetail?.querySelector('.project-title');
    const projectMeta = projectDetail?.querySelector('.project-meta');
    const projectClose = projectDetail?.querySelector('.project-close');

    if (!container || !section) return;

    // --- CONSTANTS ---
    const CAMERA_START_Z = 20;
    const CAMERA_END_Z = -30;
    const VOLTERA_EASE = "power4.out"; // Closest to cubic-bezier(0.16, 1, 0.3, 1)

    // --- DEVICE DETECTION ---
    const isTouchDevice = window.matchMedia('(hover: none)').matches;

    // --- PROJECT DATA ---
    const projects = [
        {
            id: 'puma',
            title: 'Puma Metaverse',
            ref: 'REF: PM-MVRSE',
            status: 'STATUS: IMMERSIVE',
            meta: 'Brand Experience / WebGL',
            position: new THREE.Vector3(-4, 0, 5),
            light: {
                intensity: 15,
                color: 0xffffff,
                offset: { x: 0, y: 0.5, z: 3 },
                distance: 10,
            },
            geometry: 'fragmented'
        },
        {
            id: 'amazon',
            title: 'Amazon Drivers Training',
            ref: 'REF: AMZ-TRNG',
            status: 'SECTOR: LOGISTICS',
            meta: 'VR Training / Simulation',
            position: new THREE.Vector3(5, 0, -5),
            light: {
                intensity: 30,
                color: 0xff0000,
                distance: 30,

            },
            geometry: 'plates'
        },
        {
            id: 'villa',
            title: 'Villa Tinaia',
            ref: 'REF: VT-ARCH',
            status: 'TYPE: VR_VIS',
            meta: 'Architecture / Virtual Tour',
            position: new THREE.Vector3(-2, 0, -15),
            geometry: 'tower'
        },
        {
            id: 'placeholder1',
            title: 'Project Alpha',
            ref: 'REF: PLH-001',
            status: 'STATUS: PENDING',
            meta: 'Coming Soon',
            position: new THREE.Vector3(6, 0, -25),
            geometry: 'octahedron'
        },
        {
            id: 'placeholder2',
            title: 'Project Beta',
            ref: 'REF: PLH-002',
            status: 'STATUS: PENDING',
            meta: 'Coming Soon',
            position: new THREE.Vector3(-5, 0, -35),
            geometry: 'tetrahedron'
        }
    ];

    // --- SCENE STATE ---
    let scene, camera, renderer, pointLight, ambientLight;
    let monoliths = [];
    let raycaster, mouse;
    let isZooming = false;
    let cameraSnapshot = new THREE.Vector3(); // Snapshot for exact return
    let currentHoveredMonolith = null;
    let scrollProgress = 0;
    let isRunning = false;
    let rafId = null;

    // --- PROPS STATE ---
    let propsGroup;
    let propMaterials = [];

    // --- SCENE SETUP ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);
    scene.fog = new THREE.FogExp2(0x080808, 0.04);

    camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        200
    );
    camera.position.set(0, 2, CAMERA_START_Z);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x080808, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // --- LIGHTING ---
    ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    pointLight = new THREE.PointLight(0xffffff, 0.2, 0, 2);
    pointLight.position.set(0, 50, CAMERA_START_Z); // Zenithal position
    scene.add(pointLight);

    // Torchlight breathing for touch devices
    if (isTouchDevice && typeof gsap !== 'undefined') {
        gsap.to(pointLight, {
            intensity: 0.6,
            duration: 2,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
        });
    }

    // --- NOCTURNAL PLANE ---
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({
            color: 0x050505,
            roughness: 0.9,
            metalness: 0.1,
            dithering: true
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    scene.add(ground);

    // --- SHARED MATERIAL ---
    const sharedMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0x222222,
        emissiveIntensity: 0.1,
        dithering: true
    });

    // --- GEOMETRY FACTORIES ---
    function createFragmentedGeometry() {
        const group = new THREE.Group();
        for (let i = 0; i < 5; i++) {
            const size = 0.3 + Math.random() * 0.5;
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(size, size * 2, size),
                sharedMaterial
            );
            box.position.set(
                (Math.random() - 0.5) * 1.5,
                Math.random() * 2,
                (Math.random() - 0.5) * 1.5
            );
            box.rotation.set(
                Math.random() * 0.5,
                Math.random() * Math.PI,
                Math.random() * 0.5
            );
            group.add(box);
        }
        return group;
    }

    function createPlatesGeometry() {
        const group = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(2, 0.15, 1.5),
                sharedMaterial
            );
            plate.position.y = i * 0.5;
            plate.position.x = (i % 2) * 0.3;
            group.add(plate);
        }
        return group;
    }

    function createTowerGeometry() {
        const group = new THREE.Group();
        // Main tower
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(1, 4, 1),
            sharedMaterial
        );
        tower.position.y = 2;
        group.add(tower);

        // Central cut (emissive gap)
        const gapMaterial = new THREE.MeshStandardMaterial({
            color: 0x080808,
            emissive: 0x334455,
            emissiveIntensity: 0.3
        });
        const gap = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.3, 0.3),
            gapMaterial
        );
        gap.position.y = 2;
        group.add(gap);

        return group;
    }

    function createOctahedronGeometry() {
        return new THREE.Mesh(
            new THREE.OctahedronGeometry(1, 0),
            sharedMaterial
        );
    }

    function createTetrahedronGeometry() {
        return new THREE.Mesh(
            new THREE.TetrahedronGeometry(1.2, 0),
            sharedMaterial
        );
    }

    // --- NEON STRUT FACTORY ---
    function createStrut(vStart, vEnd, thickness) {
        const direction = new THREE.Vector3().subVectors(vEnd, vStart);
        const length = direction.length();

        const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 5.0,
            toneMapped: false,
            fog: false
        });
        propMaterials.push(material);

        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.position.copy(vStart).add(vEnd).multiplyScalar(0.5);
        cylinder.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.clone().normalize()
        );
        return cylinder;
    }

    // --- CREATE MONOLITHS ---
    projects.forEach(project => {
        let monolith;

        switch (project.geometry) {
            case 'fragmented':
                monolith = createFragmentedGeometry();
                break;
            case 'plates':
                monolith = createPlatesGeometry();
                break;
            case 'tower':
                monolith = createTowerGeometry();
                break;
            case 'octahedron':
                monolith = createOctahedronGeometry();
                break;
            case 'tetrahedron':
                monolith = createTetrahedronGeometry();
                break;
            default:
                monolith = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), sharedMaterial);
        }

        monolith.position.copy(project.position);
        monolith.userData = project;

        // --- BEACON LIGHT ---
        const defaultLight = {
            color: 0xffffff,
            intensity: 2.0,
            distance: 10,
            decay: 2.0,
            offset: { x: 0, y: 2, z: 0 }
        };

        const config = {
            ...defaultLight,
            ...project.light,
            offset: { ...defaultLight.offset, ...(project.light?.offset || {}) }
        };

        const beacon = new THREE.PointLight(config.color, config.intensity, config.distance, config.decay);
        beacon.position.set(config.offset.x, config.offset.y, config.offset.z);
        beacon.castShadow = false;
        monolith.add(beacon);

        scene.add(monolith);
        monoliths.push(monolith);
    });

    // --- NEON TETRAHEDRON PROPS ---
    propsGroup = new THREE.Group();
    const V0 = new THREE.Vector3(0, -4, 0);
    const V1 = new THREE.Vector3(4, 2, 0);
    const V2 = new THREE.Vector3(-2, 2, 3.46);
    const V3 = new THREE.Vector3(-2, 2, -3.46);

    const edges = [[V0, V1], [V0, V2], [V0, V3], [V1, V2], [V2, V3], [V3, V1]];
    edges.forEach(([a, b]) => propsGroup.add(createStrut(a, b, 0.08)));

    // Inner PointLight for depth
    const innerLight = new THREE.PointLight(0xffffff, 100, 50);
    innerLight.position.set(0, 0, 0);
    propsGroup.add(innerLight);

    propsGroup.position.set(0, 3, -80);
    scene.add(propsGroup);

    // --- RAYCASTER ---
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // --- MOUSE TRACKING (Desktop) ---
    let mouseWorld = new THREE.Vector3(0, 0, 0);

    function onMouseMove(event) {
        if (isZooming) return; // Block HUD/Light updates during zoom/return

        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Project mouse to XZ plane for light position
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.setFromCamera(mouse, camera);
        raycaster.ray.intersectPlane(planeZ, mouseWorld);

        // Mouse light tracking (disabled for Beacons system)
        /*
        if (!isTouchDevice && typeof gsap !== 'undefined') {
            gsap.to(pointLight.position, {
                x: mouseWorld.x,
                z: mouseWorld.z,
                duration: 0.8,
                ease: "power2.out"
            });
        }
        */

        // Raycast for hover detection
        updateHoverState();
    }

    function updateHoverState() {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(monoliths, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            // Traverse up to find the group/mesh with userData
            while (obj.parent && !obj.userData.id) {
                obj = obj.parent;
            }

            if (obj.userData.id && currentHoveredMonolith !== obj) {
                currentHoveredMonolith = obj;
                showHUD(obj.userData);
            }
        } else if (currentHoveredMonolith) {
            currentHoveredMonolith = null;
            hideHUD();
        }
    }

    // --- HUD CONTROLS ---
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

    // --- CLICK / TAP HANDLING ---
    let tapStartTime = 0;
    let tapStartPos = { x: 0, y: 0 };

    function onPointerDown(event) {
        tapStartTime = Date.now();
        tapStartPos.x = event.clientX;
        tapStartPos.y = event.clientY;
    }

    function onPointerUp(event) {
        const tapDuration = Date.now() - tapStartTime;
        const tapDistance = Math.hypot(
            event.clientX - tapStartPos.x,
            event.clientY - tapStartPos.y
        );

        // Debounce: only trigger if quick tap without much movement
        if (tapDuration < 300 && tapDistance < 10) {
            handleClick(event);
        }
    }

    function handleClick(event) {
        if (isZooming) return;

        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(monoliths, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.id) {
                obj = obj.parent;
            }

            if (obj.userData.id) {
                zoomToProject(obj);
            }
        }
    }

    // --- DOLLY ZOOM ---
    function zoomToProject(monolith) {
        if (!projectDetail || !projectTitle || !projectMeta) return;

        // Save current camera position before zoom
        cameraSnapshot.copy(camera.position);

        isZooming = true;

        const targetPos = monolith.position.clone();
        targetPos.z += 5;
        targetPos.y += 1;

        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z,
                duration: 1.5,
                ease: VOLTERA_EASE,
                onComplete: () => {
                    showProjectDetail(monolith.userData);
                    lockScroll();
                }
            });
        }
    }

    function showProjectDetail(data) {
        if (!projectDetail || !projectTitle || !projectMeta) return;
        projectTitle.textContent = data.title;
        projectMeta.textContent = data.meta;
        projectDetail.classList.remove('hidden');
    }

    function closeProjectDetail() {
        if (!projectDetail) return;
        projectDetail.classList.add('hidden');

        // Smooth return to snapshot
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: cameraSnapshot.x,
                y: cameraSnapshot.y,
                z: cameraSnapshot.z,
                duration: 1.2,
                ease: VOLTERA_EASE,
                onComplete: () => {
                    isZooming = false;
                    unlockScroll();
                    // Sync with scroll only after animation finishes to prevent jumps
                    updateCameraFromScroll();
                }
            });
        } else {
            // Fallback if GSAP missing (should not happen based on requirements)
            isZooming = false;
            unlockScroll();
            updateCameraFromScroll();
        }
    }

    // --- SCROLL-DRIVEN CAMERA ---
    function updateCameraFromScroll() {
        const rect = section.getBoundingClientRect();
        const sectionHeight = section.offsetHeight - window.innerHeight;
        const scrolled = -rect.top;

        scrollProgress = Math.max(0, Math.min(1, scrolled / sectionHeight));

        if (!isZooming) {
            const targetZ = CAMERA_START_Z + (CAMERA_END_Z - CAMERA_START_Z) * scrollProgress;
            camera.position.z = targetZ;

            // Torchlight follows camera on touch devices
            if (isTouchDevice) {
                pointLight.position.z = targetZ;
                pointLight.position.x = 0;
            }

            // Mobile: Check for monolith proximity for HUD
            if (isTouchDevice) {
                checkMobileHUDTrigger();
            }
        }
    }

    function checkMobileHUDTrigger() {
        // Find monolith closest to camera Z position
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
            currentHoveredMonolith = closestMonolith;
            showHUD(closestMonolith.userData);
        } else if (!closestMonolith && currentHoveredMonolith) {
            currentHoveredMonolith = null;
            hideHUD();
        }
    }

    // --- EVENT LISTENERS ---
    if (!isTouchDevice) {
        container.addEventListener('mousemove', onMouseMove);
    }
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);

    if (projectClose) {
        projectClose.addEventListener('click', closeProjectDetail);
    }

    window.addEventListener('scroll', updateCameraFromScroll);

    // --- RESIZE ---
    resizeCallbacks.push(() => {
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });

    // --- ANIMATION LOOP ---
    function animate() {
        if (!isRunning) return;
        rafId = requestAnimationFrame(animate);

        // Slow rotation for monoliths
        monoliths.forEach((m, i) => {
            m.rotation.y += 0.001 * (i % 2 === 0 ? 1 : -1);
        });

        // Props rotation (Y-axis only) + breathing
        propsGroup.rotation.y += 0.0005;
        const pulse = 6.5 + 3.5 * Math.sin(performance.now() * 0.002);
        propMaterials.forEach(m => m.emissiveIntensity = pulse);

        renderer.render(scene, camera);
    }

    // Initial scroll position
    updateCameraFromScroll();

    console.log('[Showcase] The Infinite Map initialized');

    return {
        start: () => {
            if (isRunning) return;
            isRunning = true;
            animate();
            console.log('[Showcase] Scene started');
        },
        stop: () => {
            isRunning = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            console.log('[Showcase] Scene stopped');
        }
    };
    // --- SCROLL LOCK HELPERS ---
    function lockScroll() {
        // Calculate scrollbar width
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
        document.body.classList.add('scroll-lock');
    }

    function unlockScroll() {
        document.body.classList.remove('scroll-lock');
        document.body.style.removeProperty('--scrollbar-width');
    }
}
