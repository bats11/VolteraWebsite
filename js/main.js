import { initAtmosphericHero } from './scene-atmospheric.js';
import { initAoxCore } from './scene-aox.js';
import { initShowcaseMap } from './scene-showcase.js';
import ShowcaseUI from './showcase-ui.js';
import ResizeManager from './resize-manager.js';

// --- MOBILE BREAKPOINT ---
const MOBILE_BREAKPOINT = 768;
const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;

// --- 0. HELPER FUNCTIONS ---
function lockScroll() {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
    document.body.classList.add('scroll-lock');
}

function unlockScroll() {
    document.body.classList.remove('scroll-lock');
    document.body.style.removeProperty('--scrollbar-width');
}

// --- 1. GLOBAL INIT ---
window.onload = function () {
    ResizeManager.init();

    // Attivazione Motion System
    initVolteraMotion();

    // Lucide removed (inline SVGs used)

    // AOX controller reference (declared early for resize callback access)
    let aoxController = null;

    // Map to store scene controllers keyed by container ID
    const sceneControllers = new Map();

    const atmosphericContainer = document.getElementById('canvas-container');
    const atmospheric = initAtmosphericHero(atmosphericContainer);
    if (atmospheric) sceneControllers.set('canvas-container', atmospheric);

    // --- LAZY LOAD SHOWCASE ---
    const showcaseContainer = document.getElementById('showcase-canvas');
    // REMOVED immediate init

    initThemeObserver();
    initAoxInteraction();

    initRevealTextAnimation();

    // --- ORCHESTRAZIONE SHOWCASE UI (DEFERRED) ---
    // Moved inside showcaseObserver callback below

    // Ascolta la selezione del progetto dalla scena 3D
    window.addEventListener('vltProjectSelect', (e) => {
        const projectData = e.detail;
        ShowcaseUI.open(projectData);
        lockScroll();
    });

    // Handle desktop→mobile resize: stop AOX scene safely

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

    // --- LAZY LOAD SHOWCASE OBSERVER ---
    const showcaseObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !sceneControllers.has('showcase-canvas')) {
                // 1. Initialize Map
                const showcase = initShowcaseMap(showcaseContainer);
                if (showcase) {
                    sceneControllers.set('showcase-canvas', showcase);

                    // Start immediately if visible
                    showcase.start();

                    // 2. Force Resize to prevent black screen (User Request)
                    window.dispatchEvent(new Event('resize'));

                    // 3. Initialize UI (Coordinated)
                    ShowcaseUI.init(() => {
                        window.dispatchEvent(new CustomEvent('vltProjectClose'));
                        unlockScroll();
                    }, { baseAssetPath: './assets/video/' });

                    // 4. Handoff to standard visibility observer
                    visibilityObserver.observe(entry.target);
                }

                // Stop lazy observer
                showcaseObserver.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px 500px 0px' });

    if (showcaseContainer) showcaseObserver.observe(showcaseContainer);

    // --- ASYNC AOX (Parallel & Non-Blocking) ---
    // Initialize AOX Core unconditionally
    const aoxContainer = document.getElementById('aox-canvas-container');
    initAoxCore(aoxContainer).then(aox => {
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
    // Toggle class on burger to swap icons via CSS
    if (burger) burger.classList.toggle('is-active');
}

if (burger) {
    burger.addEventListener('click', window.toggleMenu);
}

// --- 3. THEME OBSERVER (Bidirectional Dark-Lock) ---
function initThemeObserver() {
    // Light theme trigger (Metodo section)
    // Light theme trigger (Metodo, Partner, Collaborazione)
    // Usiamo un Set per tracciare quante sezioni "chiare" sono visibili
    const activeLightZones = new Set();

    const lightObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                activeLightZones.add(entry.target.id);
            } else {
                activeLightZones.delete(entry.target.id);
            }
        });

        // Se almeno una zona chiara è visibile, attiva il tema light
        if (activeLightZones.size > 0) {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    }, { threshold: 0.1, rootMargin: '-10% 0px -10% 0px' }); // Margini ottimizzati per sovrapposizione fluida

    const methodTriggers = document.querySelectorAll('.method-trigger');
    methodTriggers.forEach(trigger => lightObserver.observe(trigger));

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
function initAoxInteraction() {
    const tiles = document.querySelectorAll('.aox-tile');
    const canvasContainer = document.getElementById('aox-canvas-container');

    // Viewport detection with resize re-evaluation
    let isTablet = window.innerWidth <= 1024;
    ResizeManager.subscribe(() => {
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
        ResizeManager.subscribe(() => {
            // Future: resize morphing core
        });
    }
}

/* =========================================
   VOLTERA MOTION SYSTEM - LOGICA ANIMAZIONI
   ========================================= */

/**
 * Funzione Scramble: trasforma il testo in caratteri casuali 
 * prima di rivelare quello originale.
 */
function textScramble(element, duration = 1200) {
    const chars = '!<>-_\\/[]{}—=+*^?#_';
    const original = element.dataset.originalText || element.textContent;

    // Memorizziamo il testo originale per poter ripetere l'effetto
    if (!element.dataset.originalText) {
        element.dataset.originalText = original;
    }

    const start = performance.now();

    (function update() {
        const timePassed = performance.now() - start;
        const progress = Math.min(timePassed / duration, 1);

        element.textContent = original.split('').map((c, i) => {
            if (c === ' ') return ' ';
            // Se il progresso supera la posizione della lettera, mostra quella vera
            return progress > (i / original.length) ? c : chars[Math.floor(Math.random() * chars.length)];
        }).join('');

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = original;
        }
    })();
}

/**
 * Inizializzazione di tutte le animazioni ScrollTrigger
 * FIX v2: Auto-pulizia per ripristinare le funzionalità AOX (Hover & Pannelli)
 */
function initVolteraMotion() {
    console.log("⚡ Voltera Motion System: Attivato (Clean Mode)");

    gsap.registerPlugin(ScrollTrigger, CustomEase);
    CustomEase.create("voltera", "0.16, 1, 0.3, 1");

    // 1. REVEAL VISION (Hero)
    gsap.utils.toArray('.vlt-reveal-vision').forEach(el => {
        gsap.to(el, {
            opacity: 1, y: 0, duration: 1.8, ease: "voltera",
            scrollTrigger: { trigger: el, start: "top 85%" }
        });
    });

    // 2. REVEAL MESSAGE (Titoli)
    gsap.utils.toArray('.vlt-reveal-message').forEach(el => {
        gsap.to(el, {
            opacity: 1, y: 0, duration: 1.2, ease: "voltera",
            scrollTrigger: { trigger: el, start: "top 90%" }
        });
    });

    // 2.5 SLIDE-IN FROM RIGHT (Metodo) - INTERSECTION OBSERVER
    const slideObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Lancia l'animazione GSAP con easing custom
                gsap.to(entry.target, {
                    opacity: 1,
                    x: 0,
                    duration: 1.6,
                    ease: "voltera"
                });
                // Stop observing (One-shot)
                slideObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 }); // 15% visibile

    document.querySelectorAll('.vlt-slide-in-right').forEach(el => {
        slideObserver.observe(el);
    });

    // 2.6 REVEAL-SAFE (Alternative to vlt-reveal-message for post-showcase sections)
    const revealSafeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                gsap.to(entry.target, {
                    opacity: 1,
                    y: 0,
                    duration: 1.2,
                    ease: "voltera"
                });
                revealSafeObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 }); // 10% visibile

    document.querySelectorAll('.vlt-reveal-safe').forEach(el => {
        revealSafeObserver.observe(el);
    });

    // 2.7 SCRAMBLE TEXT PARAGRAPHS (Long text, progressive reveal, safe observer)
    const scrambleTextObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                // 1. Rendi visibile l'elemento
                gsap.to(el, { opacity: 1, duration: 0.1 });
                // 2. Avvia lo scramble (durata calibrata per leggibilità)
                textScramble(el, 1200);
                // 3. Stop observing (One-shot)
                scrambleTextObserver.unobserve(el);
            }
        });
    }, { threshold: 0.2 }); // Attiva quando il 20% del paragrafo è visibile

    document.querySelectorAll('.vlt-scramble-text').forEach(el => {
        scrambleTextObserver.observe(el);
    });

    // 3. STAGGER ITEMS (Griglie AOX e Partner)
    // CRITICO: Qui applichiamo la correzione per i pannelli e l'hover
    const gridContainers = ['.aox-tiles-grid', '.partner-grid-standard'];

    gridContainers.forEach(selector => {
        const grid = document.querySelector(selector);
        if (grid) {
            const items = grid.querySelectorAll('.vlt-stagger-item');
            gsap.to(items, {
                opacity: 1,
                y: 0,
                duration: 1.0,
                stagger: 0.15,
                ease: "voltera",
                scrollTrigger: {
                    trigger: grid,
                    start: "top 75%"
                },
                // --- FIX SALVA-VITA ---
                // Appena l'animazione finisce, rimuoviamo ogni traccia di GSAP e della classe CSS.
                // Questo ripristina position: static (per i pannelli) e l'opacità gestita dal CSS (per l'hover).
                onComplete: () => {
                    gsap.set(items, { clearProps: "all" });
                    items.forEach(item => item.classList.remove('vlt-stagger-item'));
                }
            });
        }
    });

    // 4. TEXT SCRAMBLE
    gsap.utils.toArray('.vlt-scramble').forEach(el => {
        ScrollTrigger.create({
            trigger: el, start: "top 95%", once: true,
            onEnter: () => {
                gsap.to(el, { opacity: 1, duration: 0.3 });
                textScramble(el, 1500);
            }
        });
        el.addEventListener('mouseenter', () => textScramble(el, 700));
    });
}