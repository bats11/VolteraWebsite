import { initAtmosphericHero } from './scene-atmospheric.js';
import { initIcosahedronHero } from './scene-icosa.js';

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
    initAtmosphericHero(resizeCallbacks);
    initIcosahedronHero(resizeCallbacks);
    initThemeObserver();
    initTitleFade();
    initAoxInteraction(resizeCallbacks);
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

// --- 3. THEME OBSERVER ---
function initThemeObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { document.body.classList.add('light-theme'); }
            else { document.body.classList.remove('light-theme'); }
        });
    }, { threshold: 0.2 });
    const trigger = document.querySelector('.method-trigger');
    if (trigger) observer.observe(trigger);
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

