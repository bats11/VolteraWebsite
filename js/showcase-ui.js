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
    closeCallback: null,
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


};

export default ShowcaseUI;
