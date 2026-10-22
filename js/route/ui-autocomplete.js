// ========== 路径规划 UI · 起终点自动补全与站点搜索过滤 ==========

const ROUTE_EXCLUDED_LINE_PATTERNS = [
    /有轨/,      // 海珠有轨1号线、黄埔有轨1号线…
    /^APM$/,     // APM
];

/** 该站是否可以进入路径规划搜索：名字带"（有轨）"或全部线路均被排除 → 隐藏 */
function isRouteEligibleStation(name, lines) {
    if (name.includes('（有轨）')) return false;
    if (!lines || lines.length === 0) return false;
    return lines.some(l => !ROUTE_EXCLUDED_LINE_PATTERNS.some(re => re.test(l)));
}

function searchRouteStations(query, limit) {
    if (typeof STATION_INDEX !== 'undefined'
        && Object.keys(STATION_INDEX).length === 0
        && typeof LINE_STATIONS !== 'undefined'
        && typeof buildStationIndex === 'function') {
        try {
            buildStationIndex();
        } catch (_) {
        }
    }

    if (typeof searchStations === 'function') {
        try {
            const arr = searchStations(query, {
                filter: isRouteEligibleStation,
                limit: limit,
            });
            return arr.map(r => r.station);
        } catch (_) {
        }
    }

    // 兜底（STATION_PINYIN_INDEX 不可用时）
    const stations = Object.keys(STATION_INDEX || {});
    const q = query.toLowerCase();
    return stations
        .filter(s => isRouteEligibleStation(s, STATION_INDEX[s]))
        .filter(s => s.toLowerCase().includes(q))
        .slice(0, limit);
}

function setupRouteAutocomplete(inputEl, suggestionsEl) {
    let activeIndex = -1;
    let currentItems = [];

    /** 贴输入框正下方；列表高度不超过键盘顶部 */
    function positionSuggestions() {
        if (!suggestionsEl || suggestionsEl.style.display === 'none') return;

        const vp = getVisualViewport();
        const MARGIN = 8;
        const GAP = 4;
        const DESIRED_MAX = 340;

        // 以整个 .route-field（含「起/终」标签）为参照，视觉上等同于"输入框宽度"
        const fieldEl = inputEl.closest('.route-field');
        const rect = fieldEl ? fieldEl.getBoundingClientRect()
                             : inputEl.getBoundingClientRect();

        // ---- 水平：与 .route-field 同宽，不溢出视口 ----
        let left = rect.left;
        let width = rect.width;
        if (left < MARGIN) { width -= (MARGIN - left); left = MARGIN; }
        if (left + width > vp.width - MARGIN) {
            width = Math.max(80, vp.width - MARGIN - left);
        }

        // ---- 垂直：贴输入框正下方；高度截止到键盘顶部 ----
        // iOS 键盘弹出后 getBoundingClientRect() 返回的是"相对 visual viewport"
        // 的坐标，而 position:fixed 的 top 相对"layout viewport"。两者相差
        // vv.offsetTop（键盘把 visual viewport 上推的距离），必须补偿。
        const coordOffset = _isIOSDevice ? (vp.offsetTop || 0) : 0;
        const top = rect.bottom + coordOffset + GAP;
        const maxH = Math.max(80, Math.min(DESIRED_MAX, vp.height - rect.bottom - GAP - MARGIN));

        suggestionsEl.style.position  = 'fixed';
        suggestionsEl.style.top       = top + 'px';
        suggestionsEl.style.bottom    = 'auto';
        suggestionsEl.style.left      = left + 'px';
        suggestionsEl.style.width     = width + 'px';
        suggestionsEl.style.right     = 'auto';
        suggestionsEl.style.maxHeight = maxH + 'px';
        suggestionsEl.style.zIndex    = '3000';
    }

    function hide() {
        suggestionsEl.style.display = 'none';
        suggestionsEl.innerHTML = '';
        suggestionsEl.style.position = '';
        suggestionsEl.style.top = '';
        suggestionsEl.style.bottom = '';
        suggestionsEl.style.left = '';
        suggestionsEl.style.width = '';
        suggestionsEl.style.right = '';
        suggestionsEl.style.maxHeight = '';
        activeIndex = -1;
        currentItems = [];
    }

    function render(items, headerText) {
        currentItems = items;
        if (items.length === 0) {
            hide();
            return;
        }
        const headerHtml = headerText
            ? `<div class="route-suggestions-header">${escapeHtml(headerText)}</div>`
            : '';
        suggestionsEl.innerHTML = headerHtml + items.map((s, i) => {
            const cls = i === activeIndex ? 'route-suggestion active' : 'route-suggestion';
            return `<div class="${cls}" data-value="${escapeHtml(s)}">${escapeHtml(s)}</div>`;
        }).join('');
        suggestionsEl.style.display = 'block';
        positionSuggestions();

        suggestionsEl.querySelectorAll('.route-suggestion').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                inputEl.value = el.dataset.value;

                // ★ 核心修复：手动触发 input 事件，让清除红框和隐藏定位按钮的逻辑生效
                inputEl.dispatchEvent(new Event('input'));

                hide();
                try {
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                } catch (_) {}

                // iOS Safari：mousedown 里 preventDefault 会让键盘状态机不复位，
                // 主动 blur 让下一次点击其他输入框能立即聚焦
                if (_isIOSDevice) {
                    inputEl.blur();
                }
            });
        });
    }

    function updateSuggestions() {
        const q = inputEl.value.trim();
        if (!q) {
            // 空输入 → 显示历史
            const kind = routeHistoryKind(inputEl);
            if (kind) {
                const arr = getRouteHistoryArr(kind);
                if (arr.length > 0) {
                    activeIndex = -1;
                    render(arr, '最近使用');
                    return;
                }
            }
            hide();
            return;
        }
        const items = searchRouteStations(q, 20);
        // 唯一候选 == 输入值 → 不显示
        if (items.length === 1 && items[0] === q) {
            hide();
            return;
        }
        activeIndex = -1;
        render(items);
    }

    inputEl.addEventListener('input', updateSuggestions);

    inputEl.addEventListener('focus', () => {
        updateSuggestions();
    });

    inputEl.addEventListener('keydown', (e) => {
        const listVisible = suggestionsEl.style.display !== 'none';
        if (!listVisible) {
            if (e.key === 'Enter') {
                e.preventDefault();
                runRoutePlanning();
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            render(currentItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, -1);
            render(currentItems);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && currentItems[activeIndex]) {
                inputEl.value = currentItems[activeIndex];
                hide();
            } else {
                runRoutePlanning();
            }
        } else if (e.key === 'Escape') {
            hide();
        }
    });

    document.addEventListener('click', (e) => {
        if (!inputEl.parentElement.contains(e.target)) hide();
    });

    // ---- 滚动 / 视口变化处理 ----
    // 弹窗内部滚动 → 列表跟着输入框一起移出可见区，直接隐藏最干净
    const routeBody = inputEl.closest('.route-body');
    if (routeBody) {
        routeBody.addEventListener('scroll', () => hide(), { passive: true });
    }

    // 视口变化（键盘弹出/收起、旋转）→ 重新定位（不隐藏，用户正在输入）
    const repositionIfVisible = () => {
        if (suggestionsEl.style.display !== 'none' && currentItems.length > 0) {
            positionSuggestions();
        }
    };

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', repositionIfVisible, { passive: true });
        window.visualViewport.addEventListener('scroll', repositionIfVisible, { passive: true });
    }
    window.addEventListener('resize', repositionIfVisible, { passive: true });

    // 输入框失焦 → 隐藏（延迟，避免与 mousedown 冲突）
    inputEl.addEventListener('blur', () => {
        setTimeout(() => {
            if (document.activeElement !== inputEl) hide();
        }, 120);
    });
}