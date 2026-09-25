// ========== 通用工具函数 ==========

function getContrastColor(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') return '#000000';
    let r, g, b;
    if (hexColor.startsWith('#')) {
        const hex = hexColor.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            return '#000000';
        }
    } else {
        return '#000000';
    }
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 140 ? '#000000' : '#ffffff';
}

function getExtraFontSize(text) {
    const len = text.length;
    if (len <= 2) return 20;
    if (len <= 4) return 18;
    return 15;
}

function initDragScroll() {
    const scrollAreas = document.querySelectorAll('.scroll-area');
    scrollAreas.forEach(area => {
        let isDown = false;
        let startX;
        let scrollLeft;

        area.addEventListener('mousedown', (e) => {
            isDown = true;
            area.classList.add('active');
            startX = e.pageX - area.offsetLeft;
            scrollLeft = area.scrollLeft;
            e.preventDefault();
        });

        area.addEventListener('mouseleave', () => {
            isDown = false;
            area.classList.remove('active');
        });

        area.addEventListener('mouseup', () => {
            isDown = false;
            area.classList.remove('active');
        });

        area.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - area.offsetLeft;
            const walk = (x - startX) * 1.5;
            area.scrollLeft = scrollLeft - walk;
        });
    });
}

function timeStrToMinutes(t) {
    if (!t || t === '——') return null;
    let [h, m] = t.split(':').map(Number);
    if (h >= 0 && h <= 1) return (24 + h) * 60 + m;
    return h * 60 + m;
}

function minutesToDisplayStr(min) {
    if (min === null || min === undefined) return '--:--';
    let h = Math.floor(min / 60) % 24;
    let m = min % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

function getCurrentMinutes() {
    if (currentCustomTime !== null) {
        let h = currentCustomTime.getHours();
        let m = currentCustomTime.getMinutes();
        if (h >= 0 && h <= 1) return (24 + h) * 60 + m;
        return h * 60 + m;
    } else {
        const d = new Date();
        let h = d.getHours();
        let m = d.getMinutes();
        if (h >= 0 && h <= 1) return (24 + h) * 60 + m;
        return h * 60 + m;
    }
}

function getGrayscaleColor(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') return '#888888';
    let r, g, b;
    if (hexColor.startsWith('#')) {
        const hex = hexColor.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            return '#888888';
        }
    } else {
        return '#888888';
    }
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const grayHex = gray.toString(16).padStart(2, '0');
    return `#${grayHex}${grayHex}${grayHex}`;
}

function highlightActiveMode() {
    const customPanel = document.getElementById('custom-time-panel');
    const systemPanel = document.getElementById('system-time-panel');
    if (currentCustomTime !== null) {
        customPanel.classList.add('active-mode');
        systemPanel.classList.remove('active-mode');
    } else {
        systemPanel.classList.add('active-mode');
        customPanel.classList.remove('active-mode');
    }
}