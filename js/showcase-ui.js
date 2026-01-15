/**
 * Showcase UI Module
 * Handles the HTML overlay for the 3D Showcase "The Infinite Map"
 * Refactored for Hybrid/Static-First Architecture (SEO) & GSAP Context
 */

const ShowcaseUI = {
    // DOM Elements
    container: null,
    closeBtn: null,
    dossierContainer: null,
    projectLibrary: null, // Hidden container for static templates

    // State
    closeCallback: null,
    ctx: null, // GSAP Context for memory safety
    config: {
        baseAssetPath: './assets/video/', // Default for videos
        imageAssetPath: './assets/Images/' // Default for images
    },


    /**
     * Initialize the UI module
     * @param {Function} onClose - Callback to trigger when UI is closed
     * @param {Object} config - Optional config override
     */
    init(onClose, config = {}) {
        this.container = document.getElementById('project-detail');
        if (!this.container) return;

        this.closeBtn = this.container.querySelector('.project-close');
        this.dossierContainer = this.container.querySelector('.dossier-main-container');
        this.projectLibrary = document.getElementById('project-library');
        this.closeCallback = onClose;

        if (config.baseAssetPath) this.config.baseAssetPath = config.baseAssetPath;
        if (config.imageAssetPath) this.config.imageAssetPath = config.imageAssetPath;

        // One-time event listener setup (outside of Context, as these are permanent UI controls)
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.close();
            });
        }
    },

    /**
     * Open the Project Detail View
     * @param {Object} projectData - Data for the project to display
     */
    open(projectData) {
        if (!this.container) return;

        // Create GSAP Context for this lifecycle
        // All animations and scoped listeners created inside will be reverted on close()
        this.ctx = gsap.context(() => {

            // 1. Render Content (Hybrid Strategy: Static Text + Dynamic Media)
            this.renderDossier(projectData);

            // 2. Show Overlay
            this.container.classList.add('dossier-active');
            this.container.classList.remove('hidden');

            // 3. Intro Animation
            gsap.from(this.dossierContainer, {
                opacity: 0,
                duration: 0.5,
                ease: 'power2.out',
                clearProps: 'all'
            });

        }, this.container); // Scope to container
    },

    /**
     * Close the Project Detail View
     */
    close() {
        if (!this.container) return;

        // 1. Revert GSAP Context (Kills all tweens, timelines, and scoped listeners)
        if (this.ctx) {
            this.ctx.revert();
            this.ctx = null;
        }

        // 2. Hide Overlay
        this.container.classList.add('hidden');
        this.container.classList.remove('dossier-active');

        // 3. Stop any playing videos
        const videos = this.container.querySelectorAll('video');
        videos.forEach(v => {
            v.pause();
            v.src = '';
        });

        // 4. Clear Content (Keep structure clean)
        if (this.dossierContainer) {
            this.dossierContainer.innerHTML = '';
        }

        // 5. Trigger 3D Camera Reset
        if (this.closeCallback) {
            this.closeCallback();
        }
    },

    /**
     * Build the Dossier DOM structure
     * Hybrid Strategy: Clone static article if exists, then hydrate.
     * @param {Object} data 
     */
    renderDossier(data) {
        if (!this.dossierContainer) return;

        // Step 1: Attempt to find static template (SEO Friendly)
        let staticTemplate = null;
        if (this.projectLibrary) {
            staticTemplate = this.projectLibrary.querySelector(`article[data-project-id="${data.id}"]`);
        }

        this.dossierContainer.innerHTML = ''; // Clear previous

        if (staticTemplate) {
            // --- STATIC PATH (SEO) ---
            const clone = staticTemplate.cloneNode(true);
            this.dossierContainer.appendChild(clone);
            this.hydrateMedia(clone, data);
        } else {
            // --- FALLBACK PATH (Legacy/JSON-only) ---
            console.warn(`[ShowcaseUI] Sync Warning: No static template found for project "${data.id}". Falling back to JSON content.`);

            const content = data.htmlContent || {};
            const article = document.createElement('article');
            article.className = 'dossier-grid';
            article.dataset.projectId = data.id;

            // Left Column construction
            const left = document.createElement('div');
            left.className = 'dossier-left';

            const title = document.createElement('h2');
            title.className = 'dossier-title';
            title.textContent = content.title || data.title;
            left.appendChild(title);

            const category = document.createElement('p');
            title.className = 'dossier-category';
            category.textContent = content.category || data.status;
            left.appendChild(category);

            if (content.col_left?.description) {
                const descDiv = document.createElement('div');
                descDiv.className = 'dossier-description';
                const p = document.createElement('p');
                p.textContent = content.col_left.description;
                descDiv.appendChild(p);
                left.appendChild(descDiv);
            }

            if (content.col_left?.specs) {
                const specs = document.createElement('ul');
                specs.className = 'dossier-specs';
                content.col_left.specs.forEach(s => {
                    const li = document.createElement('li');
                    li.textContent = s;
                    specs.appendChild(li);
                });
                left.appendChild(specs);
            }

            article.appendChild(left);
            this.dossierContainer.appendChild(article);
            this.hydrateMedia(article, data);
        }
    },

    /**
     * Helper to resolve paths correctly
     * (Mantenuta come utility per il futuro sviluppo)
     */
    _resolvePath(src, type) {
        if (!src) return '';
        // If it's a full URL or absolute path or relative path with folders, use as is
        if (src.startsWith('http') || src.startsWith('/') || src.includes('/')) {
            return src;
        }
        // It's just a filename, prepend correct base path based on type
        if (type && type.includes('video')) {
            return this.config.baseAssetPath + src;
        }
        // Default to image path for everything else
        return this.config.imageAssetPath + src;
    },

    /**
     * Inject rich media into the project article
     * CLEARED FOR NEW DEVELOPMENT
     */
    hydrateMedia(article, data) {
        // 1. Create Clean Container for the Right Column
        const right = document.createElement('div');
        right.className = 'dossier-right';

        // 2. Retrieve Media Items from JSON structure
        // Navigazione sicura nell'oggetto htmlContent -> col_right
        const mediaItems = data.htmlContent && data.htmlContent.col_right ? data.htmlContent.col_right : [];

        // 3. Find the FIRST video item defined in the JSON
        // Cerchiamo il primo oggetto che ha type 'video_hero'
        const firstVideo = mediaItems.find(item => item.type === 'video_hero');

        if (firstVideo) {
            // Container specifico per il video
            const videoContainer = document.createElement('div');
            videoContainer.className = 'dossier-video-hero';

            // Creazione Elemento Video
            const video = document.createElement('video');

            // Risoluzione Path:
            // Se il JSON contiene "./assets/...", _resolvePath lo userà così com'è.
            // Se contenesse solo "nomefile.mp4", aggiungerebbe il path di base.
            video.src = this._resolvePath(firstVideo.src, 'video');

            // Attributi per autoplay silenzioso (obbligatorio per mobile)
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;

            // Classe CSS per gestire dimensioni e aspect-ratio
            video.className = 'dossier-video-element';

            videoContainer.appendChild(video);
            right.appendChild(videoContainer);
        } else {
            console.warn(`[ShowcaseUI] No video_hero found for project: ${data.id}`);
        }

        // 4. Append to Article
        article.appendChild(right);

        // 5. Entry Animation (GSAP)
        gsap.from(right, {
            opacity: 0,
            y: 20,
            duration: 0.8,
            ease: "power2.out",
            delay: 0.1
        });
    }

};

export default ShowcaseUI;