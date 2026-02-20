(function () {
    function getHex(color) {
        if (color.startsWith('#')) return color;
        const rgb = color.match(/\d+/g);
        if (!rgb || rgb.length < 3) return color;
        return "#" + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
    }

    function analyze() {
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

        // ── Image Extraction ──
        const imageMap = new Map(); // src -> { src, alt, width, height }

        // Collect from <img> tags
        document.querySelectorAll('img').forEach(img => {
            const src = img.src || img.currentSrc;
            if (!src || src.startsWith('data:') || imageMap.has(src)) return;
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (w < 30 && h < 30) return; // skip tiny icons
            imageMap.set(src, {
                src: src,
                alt: img.alt || '',
                width: w,
                height: h
            });
        });

        // Collect from <picture> <source> tags
        document.querySelectorAll('picture source').forEach(source => {
            const srcset = source.srcset;
            if (!srcset) return;
            const src = srcset.split(',')[0].trim().split(' ')[0];
            if (!src || src.startsWith('data:') || imageMap.has(src)) return;
            imageMap.set(src, { src: src, alt: '', width: 0, height: 0 });
        });

        // Collect CSS background images from visible elements
        allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage !== 'none') {
                const match = bgImage.match(/url\(["']?(.*?)["']?\)/);
                if (match && match[1] && !match[1].startsWith('data:') && !imageMap.has(match[1])) {
                    imageMap.set(match[1], { src: match[1], alt: '', width: 0, height: 0 });
                }
            }
        });

        data.images = Array.from(imageMap.values()).slice(0, 50);

        // ── Text Content Extraction ──
        const textBlocks = [];
        const seenText = new Set();
        const textSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'figcaption', 'a', 'span', 'td', 'th', 'label', 'button'];

        textSelectors.forEach(tag => {
            document.querySelectorAll(tag).forEach(el => {
                // Get direct text only – not nested children's text for containers
                let text = '';
                if (['span', 'a', 'li', 'button', 'label', 'td', 'th'].includes(tag)) {
                    text = el.textContent?.trim() || '';
                } else {
                    // For block elements, get only direct text nodes
                    text = Array.from(el.childNodes)
                        .filter(n => n.nodeType === Node.TEXT_NODE || ['STRONG', 'EM', 'B', 'I', 'A', 'SPAN', 'BR'].includes(n.nodeName))
                        .map(n => n.textContent?.trim() || '')
                        .join(' ')
                        .trim();
                }

                if (!text || text.length < 3 || seenText.has(text)) return;
                seenText.add(text);
                textBlocks.push({ tag: tag.toUpperCase(), text: text });
            });
        });

        data.text_content = textBlocks.slice(0, 100);

        // Emit result
        if (window.__TAURI__ && window.__TAURI__.core) {
            window.__TAURI__.core.invoke('complete_analysis', { data })
                .then(() => console.log('Analysis sent'))
                .catch(e => console.error('Failed to send analysis', e));
        } else {
            console.error('Tauri API not found');
        }
    }

    if (document.readyState === 'complete') {
        analyze();
    } else {
        window.addEventListener('load', analyze);
    }
})();
