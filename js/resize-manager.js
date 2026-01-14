
const callbacks = new Set();
let initialized = false;

const ResizeManager = {
    init() {
        if (initialized) return;
        window.addEventListener('resize', () => {
            callbacks.forEach(cb => cb());
        });
        initialized = true;
    },

    subscribe(fn) {
        if (typeof fn === 'function') {
            callbacks.add(fn);
        }
    },

    unsubscribe(fn) {
        callbacks.delete(fn);
    }
};

export default ResizeManager;
