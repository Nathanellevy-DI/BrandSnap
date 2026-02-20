(function () {
    function getHex(color) {
        if (color.startsWith('#')) return color;
        const rgb = color.match(/\d+/g);
        if (!rgb || rgb.length < 3) return color;
        return "#" + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
    }

    // Scroll the entire page to trigger lazy-loaded images
    async function scrollPage() {
        return new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    window.scrollTo(0, 0);
                    setTimeout(resolve, 500);
                }
            }, 100);
            setTimeout(() => { clearInterval(timer); resolve(); }, 10000);
        });
    }

    // Normalize URL to detect duplicates even across resolutions
    function normalizeUrl(src) {
        if (!src) return '';
        try { src = new URL(src, document.location.href).href; } catch (e) { }
        // Strip query params, hash, trailing slashes
        let norm = src.split('?')[0].split('#')[0].replace(/\/+$/, '');
        // Strip common resolution/size patterns from filename:
        norm = norm
            .replace(/[-_](cc_ft_|ft_)?\d{2,4}(x\d{2,4})?(\.\w+)$/, '$3')
            .replace(/-\d+x\d+(\.\w+)$/, '$1')
            .replace(/@\dx(\.\w+)$/, '$1')
            .replace(/[-_](small|medium|large|thumb|thumbnail|scaled|preview|mini|full|original)(\.\w+)$/i, '$2')
            .replace(/[-_]\d{2,4}w(\.\w+)$/, '$1');
        return norm;
    }

    async function analyze() {
        await scrollPage();

        const data = {
            colors: [],
            fonts: [],
            images: [],
            text_content: [],
            metadata: {
                title: document.title,
                description: document.querySelector('meta[name="description"]')?.content || '',
                favicon: document.querySelector('link[rel*="icon"]')?.href || ''
            }
        };

        const allElements = document.querySelectorAll('*');
        const colorMap = {};
        const fontSet = new Set();

        allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundColor;
            const color = style.color;
            [bg, color].forEach(c => {
                if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                    colorMap[c] = (colorMap[c] || 0) + 1;
                }
            });
            const font = style.fontFamily;
            if (font) {
                font.split(',').forEach(f => fontSet.add(f.trim().replace(/['"]/g, '')));
            }
        });

        data.colors = Object.entries(colorMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([c]) => c);

        data.fonts = Array.from(fontSet);

        // ── Image Extraction (deduplicated — one per visual image) ──
        const seenNormalized = new Set();
        const imageList = [];

        function addImage(rawSrc, alt, w, h) {
            if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) return;
            let src;
            try { src = new URL(rawSrc, document.location.href).href; } catch (e) { src = rawSrc; }
            const norm = normalizeUrl(src);
            if (seenNormalized.has(norm)) return;
            seenNormalized.add(norm);
            imageList.push({ src, alt: alt || '', width: w || 0, height: h || 0 });
        }

        // 1. All <img> tags — take only the BEST source per element (no srcset duplicates)
        document.querySelectorAll('img').forEach(img => {
            // currentSrc = what the browser actually loaded (best resolution for viewport)
            const bestSrc = img.currentSrc || img.src
                || img.getAttribute('data-src')
                || img.getAttribute('data-lazy-src')
                || img.getAttribute('data-original')
                || img.getAttribute('data-lazy')
                || img.getAttribute('data-url')
                || img.getAttribute('data-image');
            addImage(bestSrc, img.alt, img.naturalWidth, img.naturalHeight);
        });

        // 2. <picture> <source> — take only the best (last/largest) from each srcset
        document.querySelectorAll('picture source, source[srcset]').forEach(source => {
            const srcset = source.srcset || source.getAttribute('data-srcset');
            if (srcset) {
                const parts = srcset.split(',').map(s => s.trim());
                const best = parts[parts.length - 1].split(' ')[0]; // last = highest res
                addImage(best, '', 0, 0);
            }
        });

        // 3. CSS background images
        allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none') {
                const matches = bgImage.matchAll(/url\(["']?(.*?)["']?\)/g);
                for (const match of matches) {
                    if (match[1] && !match[1].includes('gradient')) {
                        addImage(match[1], '', 0, 0);
                    }
                }
            }
        });

        // 4. Video posters
        document.querySelectorAll('video[poster]').forEach(v => addImage(v.poster, 'Video poster', 0, 0));

        // 5. Open Graph / Twitter Card / Schema.org meta images
        document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[itemprop="image"]').forEach(meta => {
            addImage(meta.content, 'Social preview', 0, 0);
        });

        // 6. SVG embedded images
        document.querySelectorAll('svg image').forEach(svgImg => {
            addImage(svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href'), '', 0, 0);
        });

        // 7. <a> tags linking to images
        document.querySelectorAll('a[href]').forEach(a => {
            const h = a.href.toLowerCase();
            if (h.match(/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tiff)(\?.*)?$/)) {
                addImage(a.href, a.textContent?.trim() || '', 0, 0);
            }
        });

        // 8. Inline style background images
        document.querySelectorAll('[style*="background"]').forEach(el => {
            const style = el.getAttribute('style') || '';
            const matches = style.matchAll(/url\(["']?(.*?)["']?\)/g);
            for (const match of matches) {
                addImage(match[1], '', 0, 0);
            }
        });

        // 9. <noscript> fallback images
        document.querySelectorAll('noscript').forEach(ns => {
            const temp = document.createElement('div');
            temp.innerHTML = ns.textContent || '';
            temp.querySelectorAll('img').forEach(img => {
                addImage(img.getAttribute('src'), img.getAttribute('alt') || '', 0, 0);
            });
        });

        // 10. Scan ALL <script> tags for image URLs embedded in JSON/JS
        // This catches sites like Zillow that store carousel images in JSON-LD or JS objects
        document.querySelectorAll('script').forEach(script => {
            const text = script.textContent || '';
            if (text.length < 10 || text.length > 500000) return; // skip tiny/huge scripts
            // Find all image URLs in the script content
            const urlPattern = /(?:https?:)?\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|avif|bmp|tiff|svg)(?:\?[^\s"'<>]*)?/gi;
            const matches = text.matchAll(urlPattern);
            for (const match of matches) {
                let url = match[0];
                // Fix protocol-relative URLs
                if (url.startsWith('//')) url = 'https:' + url;
                // Clean up escaped slashes from JSON
                url = url.replace(/\\\//g, '/');
                addImage(url, '', 0, 0);
            }
        });

        // 11. JSON-LD structured data (common for real estate, e-commerce, etc.)
        document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
            try {
                const json = JSON.parse(script.textContent);
                function extractImagesFromJson(obj) {
                    if (!obj || typeof obj !== 'object') return;
                    if (Array.isArray(obj)) { obj.forEach(extractImagesFromJson); return; }
                    for (const [key, value] of Object.entries(obj)) {
                        if (typeof value === 'string' && value.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)/i)) {
                            addImage(value, '', 0, 0);
                        } else if (typeof value === 'object') {
                            extractImagesFromJson(value);
                        }
                    }
                }
                extractImagesFromJson(json);
            } catch (e) { }
        });

        data.images = imageList.slice(0, 500);

        // ── Text Extraction ──
        const textBlocks = [];
        const seenText = new Set();
        const textTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'figcaption'];

        textTags.forEach(tag => {
            document.querySelectorAll(tag).forEach(el => {
                const text = el.textContent?.trim();
                if (!text || text.length < 3 || seenText.has(text)) return;
                seenText.add(text);
                textBlocks.push({ tag: tag.toUpperCase(), text });
            });
        });

        data.text_content = textBlocks.slice(0, 200);

        if (window.__TAURI__ && window.__TAURI__.core) {
            window.__TAURI__.core.invoke('complete_analysis', { data })
                .then(() => console.log('Browser analysis sent — images: ' + data.images.length + ', text: ' + data.text_content.length))
                .catch(e => console.error('Failed to send analysis', e));
        } else {
            console.error('Tauri API not found');
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(analyze, 1000);
    } else {
        window.addEventListener('load', () => setTimeout(analyze, 1000));
    }
})();
