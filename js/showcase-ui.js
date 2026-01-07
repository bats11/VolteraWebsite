/**
 * Showcase UI Module
 * Handles the HTML overlay for the 3D Showcase "The Infinite Map"
 */

const ShowcaseUI = {
    // DOM Elements
    container: null,
    closeBtn: null,
    dossierContainer: null,

    // State
    stylesInjected: false,
    closeCallback: null,

    /**
     * Initialize the UI module
     * @param {Function} onClose - Callback to trigger when UI is closed (e.g. reset 3D camera)
     */
    init(onClose) {
        this.container = document.getElementById('project-detail');
        if (!this.container) return;

        this.closeBtn = this.container.querySelector('.project-close');
        this.dossierContainer = this.container.querySelector('.dossier-main-container');
        this.closeCallback = onClose;

        // One-time event listener setup
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

        // 1. Ensure styles are present
        this.injectDossierStyles();

        // 2. Render content into the dedicated container
        this.renderDossier(projectData);

        // 3. Show Overlay
        this.container.classList.add('dossier-active');
        this.container.classList.remove('hidden');
    },

    /**
     * Close the Project Detail View
     */
    close() {
        if (!this.container) return;

        // 1. Hide Overlay
        this.container.classList.add('hidden');
        this.container.classList.remove('dossier-active');

        // 2. Stop any playing videos
        const videos = this.container.querySelectorAll('video');
        videos.forEach(v => {
            v.pause();
            v.src = '';
        });

        // 3. Clear Content (Keep structure clean)
        if (this.dossierContainer) {
            this.dossierContainer.innerHTML = '';
        }

        // 4. Trigger 3D Camera Reset
        if (this.closeCallback) {
            this.closeCallback();
        }
    },

    /**
     * Build the Dossier DOM structure
     * @param {Object} data 
     */
    renderDossier(data) {
        if (!this.dossierContainer) return;

        // Get htmlContent (fallback to basic data if not present)
        const content = data.htmlContent || {
            title: data.title,
            category: data.status || '',
            col_left: {
                description: data.meta || '',
                specs: []
            },
            col_right: []
        };

        // Build dossier grid
        const grid = document.createElement('div');
        grid.className = 'dossier-grid';

        // --- LEFT COLUMN ---
        const left = document.createElement('div');
        left.className = 'dossier-left';

        const title = document.createElement('h2');
        title.className = 'dossier-title';
        title.textContent = content.title;
        left.appendChild(title);

        const category = document.createElement('p');
        category.className = 'dossier-category';
        category.textContent = content.category;
        left.appendChild(category);

        if (content.col_left?.description) {
            const desc = document.createElement('p');
            desc.className = 'dossier-description';
            desc.textContent = content.col_left.description;
            left.appendChild(desc);
        }

        if (content.col_left?.specs && content.col_left.specs.length > 0) {
            const specs = document.createElement('ul');
            specs.className = 'dossier-specs';
            content.col_left.specs.forEach(spec => {
                const li = document.createElement('li');
                li.textContent = spec;
                specs.appendChild(li);
            });
            left.appendChild(specs);
        }

        grid.appendChild(left);

        // --- RIGHT COLUMN ---
        const right = document.createElement('div');
        right.className = 'dossier-right';

        // ========== SMART VIEWER: Pre-Render Media Analysis ==========
        let videoCount = 0;
        let imageCount = 0;
        const videos = [];
        const images = [];

        if (content.col_right && content.col_right.length > 0) {
            content.col_right.forEach(item => {
                if (item.type === 'video_hero') {
                    videoCount++;
                    videos.push(item);
                } else if (item.type === 'image_full') {
                    imageCount++;
                    images.push({ type: 'image', src: item.src });
                } else if (item.type === 'image_grid' && item.srcs) {
                    imageCount += item.srcs.length;
                    item.srcs.forEach(src => images.push({ type: 'image', src }));
                }
            });
        }

        // Define modes
        const useCinemaMode = videoCount >= 2;
        const useStripMode = imageCount > 3;

        // ========== CINEMA MODE: Multi-Video Player ==========
        if (useCinemaMode) {
            const cinemaViewer = document.createElement('div');
            cinemaViewer.className = 'cinema-viewer';

            // Main stage player (first video)
            const mainStage = document.createElement('video');
            mainStage.id = 'main-stage';
            mainStage.className = 'cinema-main-stage';
            mainStage.src = videos[0].src;
            mainStage.autoplay = true;
            mainStage.muted = true;
            mainStage.loop = true;
            mainStage.playsInline = true;
            mainStage.play().catch(() => { });
            cinemaViewer.appendChild(mainStage);

            // Playlist strip (HUD style)
            const playlist = document.createElement('div');
            playlist.className = 'cinema-playlist';

            videos.forEach((vid, index) => {
                const btn = document.createElement('button');
                btn.className = 'cinema-playlist-item' + (index === 0 ? ' active' : '');
                btn.dataset.src = vid.src;

                // HUD structure: index indicator + progress bar
                btn.innerHTML = `
                    <span class="playlist-index">${String(index + 1).padStart(2, '0')}</span>
                    <div class="playlist-progress"><div class="playlist-progress-fill"></div></div>
                `;

                btn.addEventListener('click', () => {
                    // Skip if already playing this video
                    if (mainStage.src.endsWith(vid.src.split('/').pop())) return;

                    // Long Decay transition: fade out → swap → fade in
                    mainStage.classList.add('fading');
                    setTimeout(() => {
                        mainStage.src = vid.src;
                        mainStage.play().catch(() => { });
                        mainStage.classList.remove('fading');
                    }, 400); // Match CSS transition duration

                    // Update active state
                    playlist.querySelectorAll('.cinema-playlist-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
                playlist.appendChild(btn);
            });

            cinemaViewer.appendChild(playlist);
            right.appendChild(cinemaViewer);
        }

        // ========== STRIP MODE: Horizontal Image Gallery ==========
        if (useStripMode) {
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

            // Scroll progress indicator (01 / 05 style)
            const indicator = document.createElement('div');
            indicator.className = 'strip-indicator';
            indicator.innerHTML = `<span class="strip-current">01</span> / <span class="strip-total">${String(images.length).padStart(2, '0')}</span>`;
            stripContainer.appendChild(indicator);

            // Update indicator on scroll
            strip.addEventListener('scroll', () => {
                const scrollLeft = strip.scrollLeft;
                const firstChild = strip.children[0];
                const itemWidth = firstChild ? (firstChild.offsetWidth + 16) : 1; // image width + gap
                const currentIndex = Math.min(Math.round(scrollLeft / itemWidth) + 1, images.length);
                indicator.querySelector('.strip-current').textContent = String(currentIndex).padStart(2, '0');
            });

            right.appendChild(stripContainer);
        }

        // ========== FALLBACK: Mixed Grid Layout ==========
        if (!useCinemaMode && !useStripMode && content.col_right && content.col_right.length > 0) {
            content.col_right.forEach(item => {
                switch (item.type) {
                    case 'video_hero':
                        const video = document.createElement('video');
                        video.className = 'dossier-video';
                        video.src = item.src;
                        video.autoplay = true;
                        video.muted = true;
                        video.loop = true;
                        video.playsInline = true;
                        video.play().catch(() => { });
                        right.appendChild(video);
                        break;

                    case 'image_grid':
                        if (item.srcs && item.srcs.length > 0) {
                            const imgGrid = document.createElement('div');
                            imgGrid.className = 'dossier-image-grid';
                            item.srcs.forEach(src => {
                                const img = document.createElement('img');
                                img.src = src;
                                img.alt = 'Project media';
                                img.loading = 'lazy';
                                imgGrid.appendChild(img);
                            });
                            right.appendChild(imgGrid);
                        }
                        break;

                    case 'image_full':
                        const imgFull = document.createElement('img');
                        imgFull.className = 'dossier-image-full';
                        imgFull.src = item.src;
                        imgFull.alt = 'Project media';
                        imgFull.loading = 'lazy';
                        right.appendChild(imgFull);
                        break;
                }
            });
        }

        grid.appendChild(right);
        this.dossierContainer.appendChild(grid);
    },

    /**
     * Inject dynamic CSS for the dossier
     */
    injectDossierStyles() {
        if (this.stylesInjected) return;

        const style = document.createElement('style');
        style.id = 'dossier-styles';
        style.textContent = `
            /* Container Reset */
            #project-detail.dossier-active {
                max-width: none !important;
                text-align: left !important;
                justify-content: flex-start;
                align-items: stretch;
            }
            .dossier-main-container {
                width: 100%;
                height: 100%;
            }
            /* Dossier Grid Layout */
            .dossier-grid {
                display: grid;
                grid-template-columns: 35% 65%;
                height: 100%;
                width: 100%;
                gap: 40px;
                padding: 80px 5%;
            }
            .dossier-left {
                position: sticky;
                top: 80px;
                align-self: start;
            }
            .dossier-title {
                font-family: var(--font-display);
                font-size: clamp(2rem, 5vw, 4rem);
                font-weight: 700;
                line-height: 1.05;
                margin-bottom: 16px;
                color: var(--text-primary);
            }
            .dossier-category {
                font-family: var(--font-main);
                font-size: 0.7rem;
                letter-spacing: 0.15em;
                text-transform: uppercase;
                opacity: 0.5;
                margin-bottom: 32px;
            }
            .dossier-description {
                font-family: var(--font-tech);
                font-size: 1rem;
                line-height: 1.7;
                opacity: 0.8;
                margin-bottom: 24px;
            }
            .dossier-specs {
                list-style: none;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 0;
                margin: 0;
            }
            .dossier-specs li {
                font-family: var(--font-main);
                font-size: 0.7rem;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                padding: 8px 16px;
                border: 1px solid rgba(255,255,255,0.2);
                opacity: 0.7;
            }
            /* Right Column - Hidden Scrollbar (Vision-First) */
            .dossier-right {
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 60px;
                scroll-behavior: smooth;
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
            .dossier-right::-webkit-scrollbar {
                display: none;
            }
            /* Media Elements */
            .dossier-video, .dossier-image-full {
                width: 100%;
                max-height: 60vh;
                object-fit: cover;
                border-radius: 4px;
            }
            .dossier-image-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }
            .dossier-image-grid img {
                width: 100%;
                height: 200px;
                object-fit: cover;
                border-radius: 4px;
            }

            /* ========== CINEMA MODE - Multi-Video Player ========== */
            .cinema-viewer {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .cinema-main-stage {
                width: 100%;
                aspect-ratio: 16 / 9;
                max-height: 55vh;
                object-fit: cover;
                border-radius: 4px;
                background: #0a0a0a;
                transition: opacity 0.4s var(--ease-voltera, cubic-bezier(0.16, 1, 0.3, 1));
            }
            .cinema-main-stage.fading {
                opacity: 0;
            }
            .cinema-playlist {
                display: flex;
                flex-direction: row;
                gap: 8px;
                flex-wrap: wrap;
            }
            .cinema-playlist-item {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                padding: 12px 20px 16px;
                min-width: 80px;
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.4);
                cursor: pointer;
                transition: all 0.3s var(--ease-voltera, cubic-bezier(0.16, 1, 0.3, 1));
            }
            .cinema-playlist-item:hover {
                border-color: rgba(255,255,255,0.3);
                color: rgba(255,255,255,0.7);
                background: rgba(255,255,255,0.04);
            }
            .cinema-playlist-item.active {
                border-color: rgba(255,255,255,0.5);
                color: rgba(255,255,255,1);
                background: rgba(255,255,255,0.06);
            }
            .playlist-index {
                font-family: var(--font-main);
                font-size: 0.65rem;
                letter-spacing: 0.15em;
                margin-bottom: 8px;
            }
            .playlist-progress {
                width: 100%;
                height: 2px;
                background: rgba(255,255,255,0.1);
                border-radius: 1px;
                overflow: hidden;
            }
            .playlist-progress-fill {
                width: 0%;
                height: 100%;
                background: rgba(255,255,255,0.6);
                transition: width 0.1s linear;
            }
            .cinema-playlist-item.active .playlist-progress-fill {
                width: 100%;
                animation: progressPulse 3s ease-in-out infinite;
            }
            @keyframes progressPulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }

            /* ========== STRIP MODE - Horizontal Image Gallery ========== */
            .media-strip-container {
                position: relative;
            }
            .media-strip {
                display: flex;
                flex-direction: row;
                gap: 16px;
                max-height: 60vh;
                aspect-ratio: 21 / 9;
                overflow-x: auto;
                overflow-y: hidden;
                scroll-snap-type: x mandatory;
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
            .media-strip::-webkit-scrollbar {
                display: none;
            }
            .media-strip img {
                height: 100%;
                width: auto;
                min-width: 280px;
                object-fit: cover;
                border-radius: 4px;
                scroll-snap-align: start;
                flex-shrink: 0;
                transition: transform 0.6s var(--ease-voltera, cubic-bezier(0.16, 1, 0.3, 1));
            }
            .media-strip img:hover {
                transform: scale(1.02);
            }
            .strip-indicator {
                position: absolute;
                bottom: 16px;
                right: 16px;
                font-family: var(--font-main);
                font-size: 0.7rem;
                letter-spacing: 0.15em;
                color: rgba(255,255,255,0.5);
                background: rgba(0,0,0,0.6);
                padding: 6px 12px;
                border-radius: 2px;
                backdrop-filter: blur(4px);
            }
            .strip-indicator .strip-current {
                color: rgba(255,255,255,0.9);
            }

            /* Responsive (Mobile/Tablet) */
            @media (max-width: 1023px) {
                .dossier-grid {
                    grid-template-columns: 1fr;
                    overflow-y: auto;
                    gap: 32px;
                    padding: 100px 5% 60px;
                }
                .dossier-left {
                    position: static;
                }
                .media-strip {
                    max-height: 300px;
                    aspect-ratio: auto;
                }
                .cinema-main-stage {
                    max-height: 40vh;
                }
            }
        `;
        document.head.appendChild(style);
        this.stylesInjected = true;
    }
};

export default ShowcaseUI;
