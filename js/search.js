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

function searchStations(query) {
    const q = query.trim();
    if (!q) return [];

    // 懒构建
    if (Object.keys(STATION_INDEX).length === 0 && Object.keys(LINE_STATIONS).length > 0) {
        buildStationIndex();
    }
    if (Object.keys(STATION_PINYIN_INDEX).length === 0 && Object.keys(STATION_INDEX).length > 0) {
        buildStationPinyinIndex();
    }

    const qLower = q.toLowerCase();
    const isAscii = /^[a-z0-9]+$/.test(qLower);
    const results = [];

    for (const [station, lines] of Object.entries(STATION_INDEX)) {
        let score = -1;

        // 1. 中文包含（最优先）
        if (station.includes(q)) {
            score = station.indexOf(q) === 0 ? 0 : 1;
        }
        // 2. 拼音 / 首字母（仅当查询是纯字母数字）
        else if (isAscii) {
            const p = STATION_PINYIN_INDEX[station];
            if (p) {
                if (p.abbr === qLower)               score = 2;  // 首字母全匹配
                else if (p.abbr.startsWith(qLower))  score = 3;  // 首字母前缀
                else if (p.py.startsWith(qLower))    score = 4;  // 全拼前缀
                else if (p.py.includes(qLower))      score = 5;  // 全拼包含
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
        const badges = r.lines.map(l => {
            const color = LINE_COLORS[l] || '#888';
            const textColor = getContrastColor(color);
            return `<button class="search-line-badge" data-line="${l}" data-station="${r.station}" style="background:${color}; color:${textColor};">${shortLineName(l)}</button>`;
        }).join('');

        // 单线路站整行可点，所以把 data 放在行上
        const rowAttrs = isTransfer ? '' : `data-line="${r.lines[0]}" data-station="${r.station}"`;

        return `<div class="search-result ${cls}" ${rowAttrs}>
            <div class="search-station">${r.station}</div>
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

    input.addEventListener('input', () => {
        renderSearchResults(searchStations(input.value));
    });

    // 重新聚焦时，如果输入框有内容，重新显示结果
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

    // 点击外部收起
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            hideSearchResults();
        }
    });
}