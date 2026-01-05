import { initAtmosphericHero } from './scene-atmospheric.js';
import { initAoxCore } from './scene-aox.js';
import { initShowcaseMap } from './scene-showcase.js';

// --- MOBILE BREAKPOINT ---
const MOBILE_BREAKPOINT = 768;
const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;

// --- GLOBAL RESIZE MANAGER ---
const resizeCallbacks = [];
window.addEventListener('resize', () => {
    resizeCallbacks.forEach(cb => cb());
});

// --- 1. GLOBAL INIT ---
window.onload = function () {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // AOX controller reference (declared early for resize callback access)
    let aoxController = null;

    // Map to store scene controllers keyed by container ID
    const sceneControllers = new Map();

    const atmospheric = initAtmosphericHero(resizeCallbacks);
    if (atmospheric) sceneControllers.set('canvas-container', atmospheric);

    const showcase = initShowcaseMap(resizeCallbacks);
    if (showcase) sceneControllers.set('showcase-canvas', showcase);

    initThemeObserver();
    initAoxInteraction(resizeCallbacks);
    initRevealTextAnimation();

    // Handle desktop→mobile resize: stop AOX scene safely


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

    // Observe synchronous scenes
    sceneControllers.forEach((_, id) => {
        const el = document.getElementById(id);
        if (el) visibilityObserver.observe(el);
    });

    // --- ASYNC AOX (Parallel & Non-Blocking) ---
    // Initialize AOX Core unconditionally
    initAoxCore(resizeCallbacks).then(aox => {
        if (aox) {
            aoxController = aox;
            const id = 'aox-canvas-container';
            sceneControllers.set(id, aox);

            const el = document.getElementById(id);
            if (el) {
                visibilityObserver.observe(el);
                // Manual check if already in view after async load
                const rect = el.getBoundingClientRect();
                if (rect.top < window.innerHeight + 200 && rect.bottom > 0) {
                    aox.start();
                }
            }
        }
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
    }, { threshold: 0.3, rootMargin: '0px' });

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



// --- 4. REVEAL TEXT ANIMATION (Pastosa Scrub) ---
function initRevealTextAnimation() {
    gsap.registerPlugin(ScrollTrigger);

    const revealText = document.querySelector('.vision .reveal-text');
    if (!revealText) return;

    // Mobile-adaptive scrub: fixed to 2.5
    const scrubValue = 2.5;

    gsap.to(revealText, {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        ease: "power2.out",
        scrollTrigger: {
            trigger: ".vision",
            start: "top 85%",
            end: "center 20%",
            scrub: scrubValue
        }
    });
}

// --- 5. AOX INTERACTION SYSTEM ---
function initAoxInteraction(resizeCallbacks) {
    const tiles = document.querySelectorAll('.aox-tile');
    const canvasContainer = document.getElementById('aox-canvas-container');

    // Viewport detection with resize re-evaluation
    let isTablet = window.innerWidth <= 1024;
    resizeCallbacks.push(() => {
        isTablet = window.innerWidth <= 1024;
        // Reset active states when switching between modes
        if (!isTablet) {
            tiles.forEach(t => t.classList.remove('is-active'));
        }
    });

    tiles.forEach(tile => {
        // Desktop hover (bypassed on tablet)
        tile.addEventListener('mouseenter', () => {
            if (isTablet) return; // Bypass on tablet
            const ambito = tile.dataset.ambito;
            window.dispatchEvent(new CustomEvent('aoxStateChange', {
                detail: { ambito }
            }));
        });

        tile.addEventListener('mouseleave', () => {
            if (isTablet) return; // Bypass on tablet
            window.dispatchEvent(new CustomEvent('aoxStateChange', {
                detail: { ambito: null }
            }));
        });

        // Tablet click interaction
        tile.addEventListener('click', () => {
            if (!isTablet) return; // Only on tablet

            const wasActive = tile.classList.contains('is-active');

            // Remove active from all tiles
            tiles.forEach(t => t.classList.remove('is-active'));

            if (wasActive) {
                // Close panel and reset cloud
                window.dispatchEvent(new CustomEvent('aoxStateChange', {
                    detail: { ambito: null }
                }));
            } else {
                // Activate clicked tile
                tile.classList.add('is-active');
                const ambito = tile.dataset.ambito;
                // 50ms delay: allows CSS .is-active to render before 3D morphing
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('aoxStateChange', {
                        detail: { ambito }
                    }));
                }, 50);
            }
        });
    });

    // Resize callback for canvas container
    if (canvasContainer) {
        resizeCallbacks.push(() => {
            // Future: resize morphing core
        });
    }
}

