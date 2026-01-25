import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { fetchProjectsData } from './ShowcaseData.js';

export class ShowcaseFactory {
    constructor(scene, renderer, config) {
        this.scene = scene;
        this.renderer = renderer;
        this.config = config || {};
        this.baseAssetPath = this.config.baseAssetPath || './assets/video/';

        // Resources
        this.textureCache = new Map();
        this.disposables = []; // Track factory-created resources

        // Shared Materials
        this.sharedMaterial = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.8,
            metalness: 0.2,
            emissive: 0x222222,
            emissiveIntensity: 0,
            dithering: true
        });
        this.disposables.push(this.sharedMaterial);

        this.propMaterials = [];

        // Internal Animated Objects
        this.propsGroup = null;
        this.coreGeometry = null;
        this.lightningGeometry = null;
        this.lightningMesh = null;
        this.monoliths = []; // Keep local reference for internal updates if needed

        // Animation States
        this.coreOscillation = null;
        this.lightningState = null;

        // Constants
        this.NEON_CONFIG = {
            baseIntensity: 0.7,
            pulseAmplitude: 1,
            pulseSpeed: 1.5
        };
    }

    // --- PUBLIC METHODS ---


    /**
     * Builds the scene content: Monoliths, Core, Lightning.
     * @returns {Promise<{monoliths: Array, projectLabels: Array, ring: THREE.Group}>}
     */
    async build() {
        const result = {
            monoliths: [],
            projectLabels: [],
            ring: null
        };

        // Create the Ring Group
        this.monolithRing = new THREE.Group();
        this.monolithRing.position.set(0, 0, -80);
        this.scene.add(this.monolithRing);
        result.ring = this.monolithRing;

        // 1. Load Data & Create Monoliths
        try {
            const projects = await fetchProjectsData('data/projects.json');
            const count = projects.length;
            const totalSlots = count + 1; // Add one extra slot for the gap
            const radius = 30; // 30 units radius

            projects.forEach((project, index) => {
                let monolith;

                // Instantiate Geometry based on type
                switch (project.geometry) {
                    case 'fragmented':
                        monolith = this.createFragmentedGeometry();
                        break;
                    case 'plates':
                        monolith = this.createPlatesGeometry();
                        break;
                    case 'tower':
                        monolith = this.createTowerGeometry();
                        break;
                    case 'octahedron':
                        monolith = this.createOctahedronGeometry();
                        break;
                    case 'tetrahedron':
                        monolith = this.createTetrahedronGeometry();
                        break;
                    default:
                        monolith = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), this.sharedMaterial);
                }

                monolith.scale.set(1.5, 1.5, 1.5);

                // --- CIRCULAR POSITIONING ---
                // Calculate angle: distribute over N+1 slots
                const angle = (index / totalSlots) * Math.PI * 2;

                // Local position within the ring group
                const lx = Math.sin(angle) * radius;
                const lz = Math.cos(angle) * radius;

                monolith.position.set(lx, 8, lz);

                // --- ORIENTATION ---
                // 1. Look at local center (0,0,0)
                monolith.lookAt(0, 0, 0);
                // 2. Flip 180 deg to face OUTWARDS (toward camera)
                monolith.rotation.y += Math.PI;

                // DATA BINDING
                monolith.userData = { ...project };

                // Video Texture
                const videoUrl = this.baseAssetPath + (project.videoUrl || 'showcase-monolith.mp4');
                const projectTexture = this.getVideoTexture(videoUrl);

                // Apply Matter Stream
                this.applyMatterStream(monolith, projectTexture, {
                    intensity: project.intensity
                });

                // Add to Ring Group instead of direct scene
                this.monolithRing.add(monolith);

                result.monoliths.push(monolith);
                this.monoliths.push(monolith); // Local ref

                // GSAP Infinite Rotation
                // Note: Monoliths now rotate with the ring, but we might keep local spin? 
                // User requirement implies "Ring Rotation". Personal spin might be distracting or desired.
                // Keeping existing personal spin for 'aliveness' but maybe slower?
                // The prompt didn't explicitly ask to remove individual spin, only to rotate the ring.
                // I'll keep it but perhaps slower or as is to maintain visual fidelity.
                const direction = index % 2 === 0 ? 1 : -1;
                gsap.to(monolith.rotation, {
                    y: `+=${Math.PI * 2 * direction}`,
                    duration: 90,
                    repeat: -1,
                    ease: "none"
                });

                // Project Label
                const labelData = this.createProjectLabel(project);
                labelData.object.position.set(0, 4.5, 0);
                monolith.add(labelData.object);
                result.projectLabels.push(labelData);
            });

            console.log(`[ShowcaseFactory] Created ${projects.length} monoliths in ring formation.`);
        } catch (err) {
            console.error('[ShowcaseFactory] Failed to load projects data:', err);
        }

        // 2. Create Props (Tetrahedron, Core, Lightning)
        this.createProps();

        return result;
    }

    /**
     * Updates internal animations. 
     * @param {number} time - Global time in seconds.
     * @param {number} delta - Delta time in seconds.
     */
    update(time, delta) {
        // Monolith and Prop rotations are handled by GSAP now.

        // 1. Core Oscillation (Vertex Manipulation needs explicit frame update)
        if (this.coreGeometry && this.coreOscillation) {
            this.updateCoreOscillation(time);
        }

        // 2. Lightning Flicker (Deterministic logic)
        if (this.lightningMesh && this.lightningState) {
            this.updateLightning(time);
        }
    }

    dispose() {
        // Dispose factory-managed resources
        this.disposables.forEach(resource => {
            if (resource.dispose) resource.dispose();
        });
        this.disposables = [];

        // Dispose texture cache
        this.textureCache.forEach(texture => {
            if (texture.source && texture.source.data && texture.source.data.pause) {
                texture.source.data.pause();
            }
            texture.dispose();
        });
        this.textureCache.clear();

        // Dispose specific geometries/materials created internally
        if (this.coreGeometry) this.coreGeometry.dispose();
        if (this.lightningGeometry) this.lightningGeometry.dispose();

        // Helper to dispose prop materials
        this.propMaterials.forEach(m => m.dispose());
        this.propMaterials = [];

        // Note: GSAP tweens on monoliths should be killed by the Orchestrator's ctx.revert()

        console.log('[ShowcaseFactory] Resources disposed');
    }

    // --- INTERNAL HELPERS ---

    // Deterministic Pseudo-Random Helper
    psrdnoise(t, seed = 0.0) {
        return Math.abs(Math.sin(t * (37.0 + seed) + Math.cos(t * 13.0)) * 43758.5453) % 1.0;
    }

    createFragmentedGeometry() {
        const group = new THREE.Group();
        for (let i = 0; i < 5; i++) {
            const size = 0.3 + Math.random() * 0.5;
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(size, size * 2, size),
                this.sharedMaterial
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

    createPlatesGeometry() {
        const group = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(2, 0.15, 1.5),
                this.sharedMaterial
            );
            plate.position.y = i * 0.5;
            plate.position.x = (i % 2) * 0.3;
            group.add(plate);
        }
        return group;
    }

    createTowerGeometry() {
        const group = new THREE.Group();
        // Main tower
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(1, 4, 1),
            this.sharedMaterial
        );
        tower.position.y = 2;
        group.add(tower);

        // Central cut
        const gapMaterial = new THREE.MeshStandardMaterial({
            color: 0x080808,
            emissive: 0x334455,
            emissiveIntensity: 40
        });
        this.disposables.push(gapMaterial); // Track

        const gap = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.3, 0.3),
            gapMaterial
        );
        gap.position.y = 2;
        group.add(gap);

        return group;
    }

    createOctahedronGeometry() {
        return new THREE.Mesh(
            new THREE.OctahedronGeometry(1, 0),
            this.sharedMaterial
        );
    }

    createTetrahedronGeometry() {
        return new THREE.Mesh(
            new THREE.TetrahedronGeometry(1.2, 0),
            this.sharedMaterial
        );
    }

    createProjectLabel(project) {
        // Wrapper for 3D positioning (handled by CSS2DRenderer)
        const wrapper = document.createElement('div');
        wrapper.className = 'project-label-wrapper';

        // Inner Element for scaling/visuals (handled by Interaction)
        const container = document.createElement('div');
        container.className = 'project-tag';

        container.innerHTML = `
            <span class="project-tag__title">${project.title}</span>
            <div class="project-tag__line"></div>
            <div class="project-tag__meta">
                ${project.ref} • ${project.status}
            </div>
        `;

        container.dataset.projectId = project.id;
        wrapper.appendChild(container);

        const label = new CSS2DObject(wrapper);
        // Position raised to 4.5
        label.position.set(0, 4.5, 0);

        // Return inner container as 'element' for scaling interactions
        return { object: label, element: container };
    }

    createStrut(vStart, vEnd, thickness) {
        const direction = new THREE.Vector3().subVectors(vEnd, vStart);
        const length = direction.length();

        const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: this.NEON_CONFIG.baseIntensity,
            toneMapped: false,
            fog: true
        });
        this.propMaterials.push(material);

        const cylinder = new THREE.Mesh(geometry, material);
        cylinder.position.copy(vStart).add(vEnd).multiplyScalar(0.5);
        cylinder.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.clone().normalize()
        );
        return cylinder;
    }

    getVideoTexture(url) {
        if (this.textureCache.has(url)) {
            return this.textureCache.get(url);
        }

        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.play().catch(err => console.warn(`[ShowcaseFactory] Video autoplay blocked for ${url}:`, err));

        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        texture.colorSpace = THREE.SRGBColorSpace;

        if (this.renderer) {
            texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        }

        this.textureCache.set(url, texture);
        return texture;
    }

    applyMatterStream(monolith, sourceTexture, config) {
        if (!monolith) return;
        monolith.userData.disposables = monolith.userData.disposables || [];

        const children = [];
        monolith.traverse(child => {
            if (child.isMesh) children.push(child);
        });

        const childCount = children.length;
        if (childCount === 0) return;

        const columns = Math.ceil(Math.sqrt(childCount));
        const rows = Math.ceil(childCount / columns);

        children.forEach((child, index) => {
            const uOffset = (index % columns) / columns;
            const vOffset = Math.floor(index / columns) / rows;

            const childTexture = sourceTexture.clone();
            childTexture.repeat.set(1 / columns, 1 / rows);
            childTexture.offset.set(uOffset, vOffset);
            childTexture.generateMipmaps = false;
            childTexture.minFilter = THREE.LinearFilter;
            childTexture.magFilter = THREE.LinearFilter;

            monolith.userData.disposables.push(childTexture);

            const material = new THREE.MeshStandardMaterial({
                color: 0x444444,
                roughness: 0.9,
                metalness: 0.1,
                emissive: 0xffffff,
                emissiveMap: childTexture,
                emissiveIntensity: 0,
                toneMapped: false,
                side: THREE.FrontSide
            });

            monolith.userData.disposables.push(material);

            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
        });
    }

    createProps() {
        this.propsGroup = new THREE.Group();

        // Vertices for Tetrahedron
        const V0 = new THREE.Vector3(0, -4, 0);
        const V1 = new THREE.Vector3(4, 2, 0);
        const V2 = new THREE.Vector3(-2, 2, 3.46);
        const V3 = new THREE.Vector3(-2, 2, -3.46);

        const edges = [[V0, V1], [V0, V2], [V0, V3], [V1, V2], [V2, V3], [V3, V1]];
        edges.forEach(([a, b]) => this.propsGroup.add(this.createStrut(a, b, 0.08)));

        // --- VIDEO CORE ---
        const centroid = new THREE.Vector3()
            .add(V0).add(V1).add(V2).add(V3)
            .multiplyScalar(0.25);

        // Clone and scale vertices 98% toward centroid
        const p0 = V0.clone().lerp(centroid, 0.2);
        const p1 = V1.clone().lerp(centroid, 0.2);
        const p2 = V2.clone().lerp(centroid, 0.2);
        const p3 = V3.clone().lerp(centroid, 0.2);

        const positions = new Float32Array([
            // Face 1: Base (p1, p2, p3)
            p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z,
            // Face 2: (p0, p2, p1)
            p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z,
            // Face 3: (p0, p3, p2)
            p0.x, p0.y, p0.z, p3.x, p3.y, p3.z, p2.x, p2.y, p2.z,
            // Face 4: (p0, p1, p3)
            p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p3.x, p3.y, p3.z
        ]);

        // UV Logic
        const baseTriUV = [[0.5, 1.0], [0.0, 0.0], [1.0, 0.0]];
        const quadrantAnchors = [[0.0, 0.0], [0.5, 0.0], [0.0, 0.5], [0.5, 0.5]];
        const uvScale = 0.45;
        const jitterMax = 0.05;

        const uvData = [];
        for (let face = 0; face < 4; face++) {
            const anchor = quadrantAnchors[face];
            const jitterU = Math.random() * jitterMax;
            const jitterV = Math.random() * jitterMax;
            for (let vert = 0; vert < 3; vert++) {
                const [baseU, baseV] = baseTriUV[vert];
                const u = baseU * uvScale + anchor[0] + jitterU;
                const v = baseV * uvScale + anchor[1] + jitterV;
                uvData.push(u, v);
            }
        }
        const uvs = new Float32Array(uvData);

        this.coreGeometry = new THREE.BufferGeometry();
        this.coreGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.coreGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.coreGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
        this.coreGeometry.computeVertexNormals();

        // Core Material
        const videoTexture = this.getVideoTexture(this.baseAssetPath + 'showcase-monolith.mp4');
        const coreMaterial = new THREE.MeshStandardMaterial({
            color: 0x080808,
            emissive: 0xffffff,
            emissiveMap: videoTexture,
            emissiveIntensity: 12,
            side: THREE.DoubleSide,
            fog: true,
            toneMapped: false
        });
        this.disposables.push(coreMaterial);

        const coreMesh = new THREE.Mesh(this.coreGeometry, coreMaterial);
        this.propsGroup.add(coreMesh);

        // --- OSCILLATION STATE ---
        this.coreOscillation = {
            refV0: { x: V0.x, y: V0.y, z: V0.z },
            refV1: { x: V1.x, y: V1.y, z: V1.z },
            refV2: { x: V2.x, y: V2.y, z: V2.z },
            refV3: { x: V3.x, y: V3.y, z: V3.z },
            cx: centroid.x, cy: centroid.y, cz: centroid.z,
            speeds: [1.2, 0.9, 1.5, 1.1],
            offsets: [0, 1.5, 3.0, 4.5],
            inwardLerp: 0.2
        };

        // --- LIGHTNING ---
        const LIGHTNING_COUNT = 6;
        const LIGHTNING_SEGMENTS = 8;

        const lightningMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib['fog'],
                { uColor: { value: new THREE.Color(3.0, 3.5, 5.0) } }
            ]),
            vertexShader: `
                #include <fog_pars_vertex>
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    #include <fog_vertex>
                }
            `,
            fragmentShader: `
                #include <fog_pars_fragment>
                uniform vec3 uColor;
                void main() {
                    gl_FragColor = vec4(uColor, 1.0);
                    #include <fog_fragment>
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            fog: true
        });
        this.disposables.push(lightningMaterial);

        const lightningPositions = new Float32Array(LIGHTNING_COUNT * LIGHTNING_SEGMENTS * 2 * 3);
        this.lightningGeometry = new THREE.BufferGeometry();
        this.lightningGeometry.setAttribute('position', new THREE.BufferAttribute(lightningPositions, 3));
        this.lightningGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

        this.lightningMesh = new THREE.LineSegments(this.lightningGeometry, lightningMaterial);
        this.lightningMesh.frustumCulled = false;
        this.propsGroup.add(this.lightningMesh);

        this.lightningState = {
            active: false,
            flickerChance: 0.18,
            edges: edges,
            coreVerts: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]
        };

        this.propsGroup.position.set(0, 3, -80);
        this.scene.add(this.propsGroup);

        // Props Rotation via GSAP
        gsap.to(this.propsGroup.rotation, {
            y: "+=" + Math.PI * 2,
            duration: 100,
            repeat: -1,
            ease: "none"
        });
    }

    updateCoreOscillation(time) {
        const posArr = this.coreGeometry.attributes.position.array;
        const { refV0, refV1, refV2, refV3, cx, cy, cz, speeds, offsets, inwardLerp } = this.coreOscillation;
        const refs = [refV0, refV1, refV2, refV3];

        let ox0, oy0, oz0, ox1, oy1, oz1, ox2, oy2, oz2, ox3, oy3, oz3;

        for (let i = 0; i < 4; i++) {
            const ref = refs[i];

            // Base Harmonic Oscillation
            const factor = 0.5 + Math.sin(time * speeds[i] + offsets[i]) * 0.3;

            // Glitch Layer: High frequency noise ("frying matter")
            // fract(sin(time * large_seed)) provides erratic 0..1 jumps
            const glitchSignal = (Math.abs(Math.sin(time * 45.0 + i * 12.0)) % 1.0);
            // Threshold for spikes
            const spike = glitchSignal > 0.85 ? (glitchSignal - 0.85) * 0.4 : 0;
            const glitchOffset = (this.psrdnoise(time * 30, i) - 0.5) * 0.08 + spike;

            const oscX = ref.x + (cx - ref.x) * factor + glitchOffset;
            const oscY = ref.y + (cy - ref.y) * factor + glitchOffset;
            const oscZ = ref.z + (cz - ref.z) * factor + glitchOffset;

            const finalX = oscX + (cx - oscX) * inwardLerp;
            const finalY = oscY + (cy - oscY) * inwardLerp;
            const finalZ = oscZ + (cz - oscZ) * inwardLerp;

            if (i === 0) { ox0 = finalX; oy0 = finalY; oz0 = finalZ; }
            else if (i === 1) { ox1 = finalX; oy1 = finalY; oz1 = finalZ; }
            else if (i === 2) { ox2 = finalX; oy2 = finalY; oz2 = finalZ; }
            else { ox3 = finalX; oy3 = finalY; oz3 = finalZ; }
        }

        // Write buffer (optimized mapping)
        // [Mapping is identical to previous, just cleaner layout]
        // Face 1: 1, 2, 3
        posArr[0] = ox1; posArr[1] = oy1; posArr[2] = oz1;
        posArr[3] = ox2; posArr[4] = oy2; posArr[5] = oz2;
        posArr[6] = ox3; posArr[7] = oy3; posArr[8] = oz3;
        // Face 2: 0, 2, 1
        posArr[9] = ox0; posArr[10] = oy0; posArr[11] = oz0;
        posArr[12] = ox2; posArr[13] = oy2; posArr[14] = oz2;
        posArr[15] = ox1; posArr[16] = oy1; posArr[17] = oz1;
        // Face 3: 0, 3, 2
        posArr[18] = ox0; posArr[19] = oy0; posArr[20] = oz0;
        posArr[21] = ox3; posArr[22] = oy3; posArr[23] = oz3;
        posArr[24] = ox2; posArr[25] = oy2; posArr[26] = oz2;
        // Face 4: 0, 1, 3
        posArr[27] = ox0; posArr[28] = oy0; posArr[29] = oz0;
        posArr[30] = ox1; posArr[31] = oy1; posArr[32] = oz1;
        posArr[33] = ox3; posArr[34] = oy3; posArr[35] = oz3;

        // Sync lightning core targets
        this.lightningState.coreVerts[0].x = ox0; this.lightningState.coreVerts[0].y = oy0; this.lightningState.coreVerts[0].z = oz0;
        this.lightningState.coreVerts[1].x = ox1; this.lightningState.coreVerts[1].y = oy1; this.lightningState.coreVerts[1].z = oz1;
        this.lightningState.coreVerts[2].x = ox2; this.lightningState.coreVerts[2].y = oy2; this.lightningState.coreVerts[2].z = oz2;
        this.lightningState.coreVerts[3].x = ox3; this.lightningState.coreVerts[3].y = oy3; this.lightningState.coreVerts[3].z = oz3;

        this.coreGeometry.attributes.position.needsUpdate = true;
        this.coreGeometry.computeVertexNormals();
    }

    generateLightningPath(boltIndex, time) {
        const posArr = this.lightningGeometry.attributes.position.array;
        const LIGHTNING_SEGMENTS = 8;
        const baseIdx = boltIndex * LIGHTNING_SEGMENTS * 6;

        // Chaotic Jump: Seed changes completely every frame if this method is called.
        // We use 'time' as a base, but since this is called only during active flicker, 
        // we want it to look different each frame. 
        // We multiply time by a large prime to scatter the seed frame-to-frame.
        const frameSeed = time * 7919 + boltIndex * 17;

        // Pseudo-random local helper
        const rand = (offset) => this.psrdnoise(frameSeed + offset);

        // Select edge deterministically but chaotically
        const edgeIdx = Math.floor(rand(10) * this.lightningState.edges.length);
        const [edgeA, edgeB] = this.lightningState.edges[edgeIdx];

        // Random point on edge
        const t = rand(20);
        const startX = edgeA.x + (edgeB.x - edgeA.x) * t;
        const startY = edgeA.y + (edgeB.y - edgeA.y) * t;
        const startZ = edgeA.z + (edgeB.z - edgeA.z) * t;

        // Target random core vertex
        const targetVert = this.lightningState.coreVerts[Math.floor(rand(30) * 4)];
        const endX = targetVert.x;
        const endY = targetVert.y;
        const endZ = targetVert.z;

        let prevX = startX;
        let prevY = startY;
        let prevZ = startZ;

        for (let i = 0; i < LIGHTNING_SEGMENTS; i++) {
            const segT = (i + 1) / LIGHTNING_SEGMENTS;

            // Main Path
            let nextX = startX + (endX - startX) * segT;
            let nextY = startY + (endY - startY) * segT;
            let nextZ = startZ + (endZ - startZ) * segT;

            if (i < LIGHTNING_SEGMENTS - 1) {
                // Jitter: Chaotic spread
                // Using noise instead of pure random for deterministic chaos
                const jitterAmt = 0.5; // High jitter
                nextX += (rand(100 + i * 3) - 0.5) * jitterAmt;
                nextY += (rand(101 + i * 3) - 0.5) * jitterAmt;
                nextZ += (rand(102 + i * 3) - 0.5) * jitterAmt;
            } else {
                nextX = endX; nextY = endY; nextZ = endZ;
            }

            const idx = baseIdx + i * 6;
            posArr[idx] = prevX; posArr[idx + 1] = prevY; posArr[idx + 2] = prevZ;
            posArr[idx + 3] = nextX; posArr[idx + 4] = nextY; posArr[idx + 5] = nextZ;

            prevX = nextX; prevY = nextY; prevZ = nextZ;
        }
    }

    updateLightning(time) {
        // High Intensity, Low Frequency trigger (Nervous)
        // Use high multiplier on time to sample noise rapidly
        const triggerNoise = this.psrdnoise(time * 35.0); // Fast noise

        // Threshold: High value (e.g., > 0.85) creates sparse, sudden bursts
        const shouldFlicker = triggerNoise > 0.85;

        if (shouldFlicker) {
            for (let i = 0; i < 6; i++) {
                this.generateLightningPath(i, time);
            }
            this.lightningGeometry.attributes.position.needsUpdate = true;
            this.lightningMesh.visible = true;

            // Optional: Modulate intensity or color slightly with the noise
            // this.lightningMesh.material.uniforms.uColor.value... 
        } else {
            this.lightningMesh.visible = false;
        }
    }
}
