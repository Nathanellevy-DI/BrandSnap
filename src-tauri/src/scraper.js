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
                    // Convert to Hex for consistency, or keep RGB?
                    // Keeping standard computed style (usually RGB) is fine, but hex is better for UI.
                    // Let's store the raw value for now or convert.
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
