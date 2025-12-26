import { initAtmosphericHero } from './scene-atmospheric.js';
import { initIcosahedronHero } from './scene-icosa.js';
import { initAoxCore } from './scene-aox.js';
import { initShowcaseMap } from './scene-showcase.js';

// --- GLOBAL RESIZE MANAGER ---
const resizeCallbacks = [];
window.addEventListener('resize', () => {
    resizeCallbacks.forEach(cb => cb());
});

// --- 1. GLOBAL INIT ---
window.onload = async function () {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Map to store scene controllers keyed by container ID
    const sceneControllers = new Map();

    const atmospheric = initAtmosphericHero(resizeCallbacks);
    if (atmospheric) sceneControllers.set('canvas-container', atmospheric);

    const icosa = initIcosahedronHero(resizeCallbacks);
    if (icosa) sceneControllers.set('hero-canvas-icosa', icosa);

    initThemeObserver();
    initTitleFade();
    initAoxInteraction(resizeCallbacks);

    // Async init for AOX
    const aox = await initAoxCore(resizeCallbacks);
    if (aox) sceneControllers.set('aox-canvas-container', aox);

    const showcase = initShowcaseMap(resizeCallbacks);
    if (showcase) sceneControllers.set('showcase-canvas', showcase);

    // --- VISIBILITY MANAGEMENT (IntersectionObserver) ---
    const visibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const containerId = entry.target.id;
            const scene = sceneControllers.get(containerId);

            if (scene) {
                if (entry.isIntersecting) {
                    scene.start();
                } else {
                    scene.stop();
                }
            }
        });
    }, {
        rootMargin: '0px 0px 200px 0px', // Start slightly before entering viewport
        threshold: 0
    });

    // Observe all registered scene containers
    sceneControllers.forEach((_, id) => {
        const el = document.getElementById(id);
        if (el) visibilityObserver.observe(el);
    });
};

// --- 2. MOBILE MENU ---
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobile-menu');

window.toggleMenu = function () {
    mobileMenu.classList.toggle('active');
    const isOpened = mobileMenu.classList.contains('active');
    burger.innerHTML = isOpened ? '<i data-lucide="x"></i>' : '<i data-lucide="menu"></i>';
    if (window.lucide) window.lucide.createIcons();
}

if (burger) {
    burger.addEventListener('click', window.toggleMenu);
}

// --- 3. THEME OBSERVER (Bidirectional Dark-Lock) ---
function initThemeObserver() {
    // Light theme trigger (Metodo section)
    const lightObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.body.classList.add('light-theme');
            } else {
                document.body.classList.remove('light-theme');
            }
        });
    }, { threshold: 0.2 });

    const metodoTrigger = document.querySelector('.method-trigger');
    if (metodoTrigger) lightObserver.observe(metodoTrigger);

    // Dark theme lock (Showcase section - "buffer di oscurità assoluta")
    const darkObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.body.classList.remove('light-theme');
            }
        });
    }, { threshold: 0.1 });

    const showcaseSection = document.getElementById('showcase');
    if (showcaseSection) darkObserver.observe(showcaseSection);
}

// --- 4. TITLE SCROLL FADE ---
function initTitleFade() {
    const title = document.getElementById('fade-title');
    if (!title) return;

    function onScroll() {
        const rect = title.getBoundingClientRect();
        const winH = window.innerHeight;
        const start = winH * 0.85;
        const end = winH * 0.35;
        let progress = (start - rect.top) / (start - end);
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        title.style.opacity = progress;
        title.style.transform = `translateY(${40 * (1 - progress)}px)`;

        if (progress >= 1) {
            title.style.opacity = 1;
            title.style.transform = 'translateY(0)';
            window.removeEventListener('scroll', onScroll);
        }
    }
    window.addEventListener('scroll', onScroll);
    onScroll();
}

// --- 5. AOX INTERACTION SYSTEM ---
function initAoxInteraction(resizeCallbacks) {
    const tiles = document.querySelectorAll('.aox-tile');
    const canvasContainer = document.getElementById('aox-canvas-container');

    tiles.forEach(tile => {
        tile.addEventListener('mouseenter', () => {
            const ambito = tile.dataset.ambito;
            console.log(`[AOX] Ambito attivo: ${ambito}`);
            // CustomEvent per sistema 3D disaccoppiato
            window.dispatchEvent(new CustomEvent('aoxStateChange', {
                detail: { ambito }
            }));
        });

        tile.addEventListener('mouseleave', () => {
            console.log('[AOX] Ambito disattivato');
            window.dispatchEvent(new CustomEvent('aoxStateChange', {
                detail: { ambito: null }
            }));
        });
    });

    // Resize callback per futuro canvas container
    if (canvasContainer) {
        resizeCallbacks.push(() => {
            // Futuro: resize morphing core
        });
    }
}

