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
     */
    hydrateMedia(article, data) {
        const content = data.htmlContent;
        if (!content || !content.col_right) return;

        const right = document.createElement('div');
        right.className = 'dossier-right';
        /*right.style.aspectRatio = '16/9';*/

        // 1. PRE-PROCESS ITEMS (Resolve all paths first)
        // This ensures that whether we use Cinema, Strip or Fallback, paths are correct.
        const processedItems = content.col_right.map(item => {
            // Clone item to avoid mutating original data
            const newItem = { ...item };

            if (item.type === 'image_grid' && item.srcs) {
                newItem.srcs = item.srcs.map(s => this._resolvePath(s, 'image'));
            } else {
                newItem.src = this._resolvePath(item.src, item.type);
            }
            return newItem;
        });

        // 2. Count types
        let videoCount = 0;
        let imageCount = 0;
        const videos = [];
        const images = [];

        processedItems.forEach(item => {
            if (item.type === 'video_hero') {
                videoCount++;
                videos.push(item);
            } else if (item.type === 'image_full') {
                imageCount++;
                images.push({ type: 'image', src: item.src });
            } else if (item.type === 'image_grid' && item.srcs) {
                imageCount += item.srcs.length;
                item.srcs.forEach(s => {
                    images.push({ type: 'image', src: s });
                });
            }
        });

        const useCinemaMode = videoCount >= 2;
        const useStripMode = imageCount > 3;

        // 3. Build Content using PROCESSED items
        if (useCinemaMode) {
            this._buildCinemaMode(right, videos);

            // FIX: If there are also images, show them too (don't hide them!)
            const nonVideos = processedItems.filter(i => i.type !== 'video_hero');
            if (nonVideos.length > 0) {
                // Render remaining items below the cinema player
                this._buildFallbackMode(right, nonVideos);
            }

        } else if (useStripMode) {
            this._buildStripMode(right, images);
        } else {
            // Critical fix: pass processedItems, not raw content.col_right
            this._buildFallbackMode(right, processedItems);
        }

        article.appendChild(right);

        gsap.from(right, {
            opacity: 0,
            duration: 0.8,
            ease: "power2.out",
            delay: 0.1
        });
    },

    _buildCinemaMode(container, videos) {
        const cinemaViewer = document.createElement('div');
        cinemaViewer.className = 'cinema-viewer';

        const mainStage = document.createElement('video');
        mainStage.className = 'cinema-main-stage';
        mainStage.src = videos[0].src;
        mainStage.autoplay = true;
        mainStage.muted = true;
        mainStage.loop = true;
        mainStage.playsInline = true;

        mainStage.play().catch(() => { });
        cinemaViewer.appendChild(mainStage);

        const playlist = document.createElement('div');
        playlist.className = 'cinema-playlist';

        videos.forEach((vid, index) => {
            const btn = document.createElement('button');
            btn.className = 'cinema-playlist-item' + (index === 0 ? ' active' : '');

            btn.innerHTML = `
                <span class="playlist-index">${String(index + 1).padStart(2, '0')}</span>
                <div class="playlist-progress"><div class="playlist-progress-fill"></div></div>
            `;

            btn.addEventListener('click', () => {
                if (mainStage.src.endsWith(vid.src.split('/').pop())) return;
                mainStage.classList.add('fading');
                gsap.delayedCall(0.4, () => {
                    mainStage.src = vid.src;
                    mainStage.play().catch(() => { });
                    mainStage.classList.remove('fading');
                });
                playlist.querySelectorAll('.cinema-playlist-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            playlist.appendChild(btn);
        });

        cinemaViewer.appendChild(playlist);
        container.appendChild(cinemaViewer);
    },

    _buildStripMode(container, images) {
        const stripContainer = document.createElement('div');
        stripContainer.className = 'media-strip-container';

        const strip = document.createElement('div');
        strip.className = 'media-strip';

        images.forEach(img => {
            const imgEl = document.createElement('img');
            imgEl.src = img.src;
            imgEl.alt = 'Project media';
            imgEl.loading = 'lazy';
            strip.appendChild(imgEl);
        });
        stripContainer.appendChild(strip);

        const indicator = document.createElement('div');
        indicator.className = 'strip-indicator';
        indicator.innerHTML = `<span class="strip-current">01</span> / <span class="strip-total">${String(images.length).padStart(2, '0')}</span>`;
        stripContainer.appendChild(indicator);

        strip.addEventListener('scroll', () => {
            const scrollLeft = strip.scrollLeft;
            const firstChild = strip.children[0];
            const itemWidth = firstChild ? (firstChild.offsetWidth + 16) : 1;
            const currentIndex = Math.min(Math.round(scrollLeft / itemWidth) + 1, images.length);
            indicator.querySelector('.strip-current').textContent = String(currentIndex).padStart(2, '0');
        });

        container.appendChild(stripContainer);
    },

    _buildFallbackMode(container, colRightItems) {
        if (!colRightItems) return;

        colRightItems.forEach(item => {
            if (item.type === 'video_hero') {
                const video = document.createElement('video');
                video.className = 'dossier-video';
                video.src = item.src;
                video.autoplay = true;
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                video.play().catch(() => { });
                container.appendChild(video);
            } else if (item.type === 'image_grid' && item.srcs) {
                const imgGrid = document.createElement('div');
                imgGrid.className = 'dossier-image-grid';
                item.srcs.forEach(src => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.loading = 'lazy';
                    imgGrid.appendChild(img);
                });
                container.appendChild(imgGrid);
            } else if (item.type === 'image_full') {
                const img = document.createElement('img');
                img.className = 'dossier-image-full';
                img.src = item.src;
                img.loading = 'lazy';
                container.appendChild(img);
            }
        });
    }

};

export default ShowcaseUI;