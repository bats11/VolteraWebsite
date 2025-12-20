import * as THREE from 'three';

/**
 * Icosahedron Hero Scene
 * @param {Array} resizeCallbacks - Global resize callbacks array
 */
export function initIcosahedronHero(resizeCallbacks) {
    const canvas = document.getElementById('hero-canvas-icosa');
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 18;

    // IMPORTANT: Radius = 4.5 as per refactoring instructions
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(4.5, 1), new THREE.MeshBasicMaterial({ color: 0x666666, wireframe: true, transparent: true, opacity: 0.2 }));
    scene.add(mesh);

    const pCount = 300; const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i++) { pPos[i] = (Math.random() - 0.5) * 50; }
    const particles = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3)), new THREE.PointsMaterial({ size: 0.05, color: 0x444444, transparent: true, opacity: 0.5 }));
    scene.add(particles);

    let mx = 0, my = 0;
    window.addEventListener('mousemove', (e) => { mx = e.clientX - window.innerWidth / 2; my = e.clientY - window.innerHeight / 2; });

    resizeCallbacks.push(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // IMPORTANT: Vertical offset = -2.5 in anim() (offset is applied via -my * 0.001 - 2, keeping -2 as original)
    function anim() {
        requestAnimationFrame(anim);
        mesh.rotation.y += 0.002; mesh.rotation.x += 0.001;
        mesh.position.x += (mx * 0.001 - mesh.position.x) * 0.05;
        mesh.position.y += ((-my * 0.001 - 2.5) - mesh.position.y) * 0.05;
        renderer.render(scene, camera);
    }
    anim();
}
