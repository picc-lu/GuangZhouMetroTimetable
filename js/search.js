// ========== 站点搜索 ==========
/** 从 LINE_STATIONS 构建站点到线路的映射 */
function buildStationIndex() {
    STATION_INDEX = {};
    for (const [line, stations] of Object.entries(LINE_STATIONS)) {
        for (const st of stations) {
            if (!STATION_INDEX[st]) STATION_INDEX[st] = [];
            if (!STATION_INDEX[st].includes(line)) STATION_INDEX[st].push(line);
        }
    }
    if (typeof buildStationPinyinIndex === 'function') buildStationPinyinIndex();
}

/** 搜索时归一化：去掉所有空白字符，并转小写 */
function normalizeForSearch(s) {
    return String(s).replace(/\s+/g, '').toLowerCase();
}

function searchStations(query) {
    const q = normalizeForSearch(query);
    if (!q) return [];

    // 懒构建（沿用之前逻辑）
    if (Object.keys(STATION_INDEX).length === 0 && Object.keys(LINE_STATIONS).length > 0) {
        buildStationIndex();
    }
    if (Object.keys(STATION_PINYIN_INDEX).length === 0 && Object.keys(STATION_INDEX).length > 0) {
        buildStationPinyinIndex();
    }

    const isAscii = /^[a-z0-9]+$/.test(q);
    const results = [];

    for (const [station, lines] of Object.entries(STATION_INDEX)) {
        const stationNorm = normalizeForSearch(station);
        let score = -1;

        // 1. 中文包含（站名和查询都去掉空白后再比）
        if (stationNorm.includes(q)) {
            score = stationNorm.indexOf(q) === 0 ? 0 : 1;
        }
        // 2. 拼音 / 首字母（仅纯字母数字查询）
        else if (isAscii) {
            const p = STATION_PINYIN_INDEX[station];
            if (p) {
                if (p.abbr === q)              score = 2;
                else if (p.abbr.startsWith(q)) score = 3;
                else if (p.py.startsWith(q))   score = 4;
                else if (p.py.includes(q))     score = 5;
            }
        }

        if (score >= 0) results.push({ station, lines, score });
    }

    results.sort((a, b) => a.score - b.score || a.station.localeCompare(b.station, 'zh'));
    return results.slice(0, 12);
}

/** 简化线路名显示 */
function shortLineName(line) {
    let name = line.replace(/号线/g, '');
    if (name.includes('佛山')) name = name.replace(/佛山/g, '佛');
    return name;
}

/** 渲染搜索结果下拉 */
function renderSearchResults(results) {
    const box = document.getElementById('search-results');
    const input = document.getElementById('search-input');
    if (!box || !input) return;

    if (!input.value.trim()) {
        box.style.display = 'none';
        return;
    }

    if (results.length === 0) {
        box.innerHTML = `<div class="search-empty">未找到该站点</div>`;
        box.style.display = 'block';
        return;
    }

    box.innerHTML = results.map(r => {
        const isTransfer = r.lines.length > 1;
        const cls = isTransfer ? 'is-transfer' : 'is-single';
        const safeStation = escapeHtml(r.station);
        const badges = r.lines.map(l => {
            const color = LINE_COLORS[l] || '#888';
            const textColor = getContrastColor(color);
            return `<button class="search-line-badge"
                        data-line="${escapeHtml(l)}"
                        data-station="${safeStation}"
                        style="background:${color}; color:${textColor};">${escapeHtml(shortLineName(l))}</button>`;
        }).join('');

        const rowAttrs = isTransfer
            ? ''
            : `data-line="${escapeHtml(r.lines[0])}" data-station="${safeStation}"`;

        return `<div class="search-result ${cls}" ${rowAttrs}>
            <div class="search-station">${safeStation}</div>
            <div class="search-line-badges">${badges}</div>
        </div>`;
    }).join('');
    box.style.display = 'block';

    // 单线路站：整行点击
    box.querySelectorAll('.search-result.is-single').forEach(el => {
        el.addEventListener('click', () => {
            doSearchJump(el.dataset.line, el.dataset.station);
        });
    });

    // 所有徽章点击（换乘站和单线路站都生效）
    box.querySelectorAll('.search-line-badge').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            doSearchJump(btn.dataset.line, btn.dataset.station);
        });
    });
}

/** 执行搜索跳转 */
function doSearchJump(line, station) {
    hideSearchResults();
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    showLineDetails(line, false, false, station);
}

function hideSearchResults() {
    const box = document.getElementById('search-results');
    if (box) box.style.display = 'none';
}

function expandSearch() {
    const wrapper = document.getElementById('search-wrapper');
    const input = document.getElementById('search-input');
    if (!wrapper || !input) return;
    wrapper.classList.add('expanded');
    requestAnimationFrame(() => input.focus());
}

function collapseSearch() {
    const wrapper = document.getElementById('search-wrapper');
    if (!wrapper) return;
    wrapper.classList.remove('expanded');
}

/** 初始化搜索框 */
function initStationSearch() {
    const wrapper = document.getElementById('search-wrapper');
    const input = document.getElementById('search-input');
    const box = document.getElementById('search-results');
    if (!wrapper || !input || !box) return;

    // 跟踪输入法组合状态，避免在拼音候选阶段修改 value
    let isComposing = false;
    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend', () => {
        isComposing = false;
        // 组合结束立刻重跑一次清理（iOS 会在 compositionend 之后补空格）
        queueMicrotask(cleanAndRender);
    });

    function cleanAndRender() {
        // 只有在非组合状态、且值是纯 ASCII 字母数字+空格时，才移除空格
        // 中文站名里的空格（如「虫雷 岗」）不动
        if (!isComposing && /^[a-zA-Z0-9\s]+$/.test(input.value) && /\s/.test(input.value)) {
            const pos = input.selectionStart;
            const before = input.value.slice(0, pos);
            // 计算删除空格后光标应处的位置
            const newPos = before.replace(/\s+/g, '').length;
            input.value = input.value.replace(/\s+/g, '');
            try { input.setSelectionRange(newPos, newPos); } catch (_) {}
        }
        renderSearchResults(searchStations(input.value));
    }

    input.addEventListener('input', cleanAndRender);

    input.addEventListener('focus', () => {
        if (input.value.trim()) {
            renderSearchResults(searchStations(input.value));
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            hideSearchResults();
            input.blur();
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            hideSearchResults();
        }
    });
}