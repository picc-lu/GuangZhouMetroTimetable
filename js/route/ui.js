// ========== 路径规划 UI ==========

let _routeOverlay = null;
let _routeDepartMin = null;

let _routeTimeDocClickBound = false;

function initRouteUI() {
    const btn = document.getElementById('route-plan-btn');
    if (btn) btn.addEventListener('click', openRoutePlanner);
}

function ensureRouteOverlay() {
    if (_routeOverlay) return _routeOverlay;

    const ov = document.createElement('div');
    ov.className = 'route-overlay';
    ov.innerHTML = `
        <div class="route-container">
            <div class="route-header">
                <h3>🧭 路径规划 <span class="route-header-note">（未包含 APM 和有轨电车）</span></h3>
                <button class="route-close" type="button" aria-label="关闭">✕</button>
            </div>
            <div class="route-body">
                <div class="route-form">
                    <div class="route-field route-time-field">
                        <label>时间</label>
                        <div class="route-time-trigger" id="route-hour-trigger">09</div>
                        <span class="route-time-sep">:</span>
                        <div class="route-time-trigger" id="route-minute-trigger">30</div>
                        <button id="route-now" class="route-now-btn" type="button">现在</button>
                        <div class="route-time-panel" id="route-hour-panel"></div>
                        <div class="route-time-panel" id="route-minute-panel"></div>
                    </div>
                   <div class="route-stops">
    <div class="route-field">
        <label>起点</label>
        <div class="route-autocomplete">
            <input id="route-start" class="route-input"
                   placeholder="输入站名，如 体育西路" autocomplete="off">
            <div class="route-suggestions" id="route-start-suggestions"></div>
        </div>
    </div>
    <div class="route-field">
        <label>终点</label>
        <div class="route-autocomplete">
            <input id="route-end" class="route-input"
                   placeholder="输入站名，如 广州南站" autocomplete="off">
            <div class="route-suggestions" id="route-end-suggestions"></div>
        </div>
    </div>
    <button id="route-swap" class="route-swap-btn" type="button"
            title="交换起点和终点" aria-label="交换起点和终点">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="7 4 7 20"></polyline>
            <polyline points="3 8 7 4 11 8"></polyline>
            <polyline points="17 20 17 4"></polyline>
            <polyline points="13 16 17 20 21 16"></polyline>
        </svg>
    </button>
</div>
<div class="route-sort-row">
    <label class="route-sort-option">
        <input type="radio" name="route-sort" value="fastest" checked>
        <span class="route-sort-label">最快优先</span>
        <span class="route-sort-hint">按总耗时排序</span>
    </label>
    <label class="route-sort-option">
        <input type="radio" name="route-sort" value="conservative">
        <span class="route-sort-label">保守优先</span>
        <span class="route-sort-hint">末班车时间充裕优先</span>
    </label>
</div>
                    <button id="route-go" class="route-go" type="button">规划</button>
                </div>
                                <div class="route-meta" id="route-meta">正在加载线路图…</div>
                <div class="route-legend" id="route-legend" style="display:none">
                    <svg class="route-legend-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 2 L22 20 L2 20 Z"
          fill="#f59e0b"
          stroke="#1f2b3c"
          stroke-width="1.8"
          stroke-linejoin="round"/>
    <line x1="12" y1="9" x2="12" y2="14"
          stroke="#1f2b3c" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="1.2" fill="#1f2b3c"/>
</svg>
                    <span>带此标志的线路代表换乘到该线路时，距离末班车小于 5 分钟，请慎重选择</span>
                </div>
                <div class="route-results" id="route-results">
                    <div class="route-empty">填写起点和终点，点击「规划」查看前 ${PLAN_TARGET} 条推荐路径</div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
    _routeOverlay = ov;

    initRouteTimePickers(ov);

    setupRouteAutocomplete(
        ov.querySelector('#route-start'),
        ov.querySelector('#route-start-suggestions')
    );
    setupRouteAutocomplete(
        ov.querySelector('#route-end'),
        ov.querySelector('#route-end-suggestions')
    );

    ov.querySelector('#route-swap').addEventListener('click', () => {
        const startInput = ov.querySelector('#route-start');
        const endInput = ov.querySelector('#route-end');
        const tmp = startInput.value;
        startInput.value = endInput.value;
        endInput.value = tmp;

        // 清掉两边的候选
        ov.querySelector('#route-start-suggestions').style.display = 'none';
        ov.querySelector('#route-end-suggestions').style.display = 'none';

        // 不聚焦，避免触发 iOS 缩放和键盘弹出
    });

    ov.querySelector('#route-go').addEventListener('click', runRoutePlanning);
    ov.querySelector('.route-close').addEventListener('click', closeRoutePlanner);
    ov.addEventListener('click', (e) => {
        if (e.target === ov) closeRoutePlanner();
    });

    if (!_routeTimeDocClickBound) {
        _routeTimeDocClickBound = true;
        document.addEventListener('click', (e) => {
            if (!_routeOverlay) return;
            const hourPanel = _routeOverlay.querySelector('#route-hour-panel');
            const minutePanel = _routeOverlay.querySelector('#route-minute-panel');
            const hourTrigger = _routeOverlay.querySelector('#route-hour-trigger');
            const minuteTrigger = _routeOverlay.querySelector('#route-minute-trigger');
            if (!hourPanel.contains(e.target) && !hourTrigger.contains(e.target)) {
                hourPanel.style.display = 'none';
            }
            if (!minutePanel.contains(e.target) && !minuteTrigger.contains(e.target)) {
                minutePanel.style.display = 'none';
            }
        });
    }

    return ov;
}

/* ==========================================
   时间选择（下拉面板：每行一个）
   ========================================== */
const ROUTE_HOURS = (() => {
    const arr = [];
    for (let h = 5; h <= 23; h++) arr.push(h);
    arr.push(0, 1);
    return arr;
})();

const ROUTE_MINUTES = (() => {
    const arr = [];
    for (let m = 0; m < 60; m += 5) arr.push(m);
    return arr;
})();

function initRouteTimePickers(ov) {
    const hourTrigger = ov.querySelector('#route-hour-trigger');
    const minuteTrigger = ov.querySelector('#route-minute-trigger');
    const hourPanel = ov.querySelector('#route-hour-panel');
    const minutePanel = ov.querySelector('#route-minute-panel');

    // 时 3 行、分 2 行
    hourPanel.classList.add('rows-3');
    minutePanel.classList.add('rows-2');

    hourPanel.innerHTML = ROUTE_HOURS.map(h =>
        `<div class="route-time-cell" data-hour="${h}">${String(h).padStart(2, '0')}</div>`
    ).join('');

    minutePanel.innerHTML = ROUTE_MINUTES.map(m =>
        `<div class="route-time-cell" data-minute="${m}">${String(m).padStart(2, '0')}</div>`
    ).join('');

    hourPanel.querySelectorAll('.route-time-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const h = parseInt(cell.dataset.hour, 10);
            const curMin = parseInt(minuteTrigger.textContent, 10);
            _routeDepartMin = h * 60 + curMin;
            hourTrigger.textContent = String(h).padStart(2, '0');
            hourPanel.style.display = 'none';
            setRouteMeta(routeMetaText());
        });
    });

    minutePanel.querySelectorAll('.route-time-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const m = parseInt(cell.dataset.minute, 10);
            const curHour = parseInt(hourTrigger.textContent, 10);
            _routeDepartMin = curHour * 60 + m;
            minuteTrigger.textContent = String(m).padStart(2, '0');
            minutePanel.style.display = 'none';
            setRouteMeta(routeMetaText());
        });
    });

    hourTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        minutePanel.style.display = 'none';
        const isHidden = hourPanel.style.display === 'none' || !hourPanel.style.display;
        if (isHidden) {
            positionTimePanel(hourPanel, hourTrigger);
            hourPanel.style.display = 'grid';
        } else {
            hourPanel.style.display = 'none';
        }
    });

    minuteTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        hourPanel.style.display = 'none';
        const isHidden = minutePanel.style.display === 'none' || !minutePanel.style.display;
        if (isHidden) {
            positionTimePanel(minutePanel, minuteTrigger);
            minutePanel.style.display = 'grid';
        } else {
            minutePanel.style.display = 'none';
        }
    });

    ov.querySelector('#route-now').addEventListener('click', () => {
        _routeDepartMin = null;
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
        hourPanel.style.display = 'none';
        minutePanel.style.display = 'none';
    });

    refreshRouteTimeTriggers();
}

function positionTimePanel(panel, trigger) {
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    // 时面板 7 列，分面板 6 列（对应新的单元格尺寸）
    const pw = panel.classList.contains('rows-3') ? 340 : 295;

    let left = rect.left;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;

    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 6) + 'px';
    panel.style.left = left + 'px';
    panel.style.right = 'auto';
    panel.style.width = pw + 'px';
}

function refreshRouteTimeTriggers() {
    const min = getRouteDepartMin();
    const mm = ((min % 1440) + 1440) % 1440;
    let h = Math.floor(mm / 60);
    const m = mm % 60;

    if (!ROUTE_HOURS.includes(h)) h = 5;

    _routeOverlay.querySelector('#route-hour-trigger').textContent = String(h).padStart(2, '0');
    _routeOverlay.querySelector('#route-minute-trigger').textContent = String(m).padStart(2, '0');
}

/** 真实系统时间（分钟），不受主界面自定义时间影响 */
function getRealCurrentMinutes() {
    const d = new Date();
    let h = d.getHours();
    let m = d.getMinutes();
    if (h >= 0 && h <= 1) return (24 + h) * 60 + m;
    return h * 60 + m;
}

function getRouteDepartMin() {
    if (_routeDepartMin !== null) return _routeDepartMin;
    return getRealCurrentMinutes();
}

/* ==========================================
   起点/终点 自动完成
   ========================================== */
function setupRouteAutocomplete(inputEl, suggestionsEl) {
    let activeIndex = -1;
    let currentItems = [];

    function hide() {
        suggestionsEl.style.display = 'none';
        suggestionsEl.innerHTML = '';
        activeIndex = -1;
        currentItems = [];
    }

    function render(items) {
        currentItems = items;
        if (items.length === 0) {
            hide();
            return;
        }
        suggestionsEl.innerHTML = items.map((s, i) => {
            const cls = i === activeIndex ? 'route-suggestion active' : 'route-suggestion';
            return `<div class="${cls}" data-value="${escapeHtml(s)}">${escapeHtml(s)}</div>`;
        }).join('');
        suggestionsEl.style.display = 'block';

        suggestionsEl.querySelectorAll('.route-suggestion').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                inputEl.value = el.dataset.value;
                hide();
            });
        });
    }

    function updateSuggestions() {
        const q = inputEl.value.trim();
        if (!q) {
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
        const q = inputEl.value.trim();
        if (!q) {
            hide();
            return;
        }
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
            const arr = searchStations(query);
            return arr.slice(0, limit).map(r => r.station);
        } catch (_) {
        }
    }
    const stations = Object.keys(STATION_INDEX || {});
    const q = query.toLowerCase();
    return stations.filter(s => s.toLowerCase().includes(q)).slice(0, limit);
}

/* ==========================================
   弹窗
   ========================================== */
async function openRoutePlanner() {
    ensureRouteOverlay();
    _routeOverlay.style.display = 'flex';
    lockBodyScroll();

    refreshRouteTimeTriggers();
    setRouteMeta('正在加载线路图…');

    try {
        await loadRouteGraph();
        setRouteMeta(routeMetaText());
    } catch (e) {
        setRouteMeta('线路图加载失败：' + e.message);
    }
}

function closeRoutePlanner() {
    if (!_routeOverlay) return;
    _routeOverlay.style.display = 'none';
    _routeOverlay.querySelectorAll('.route-suggestions').forEach(el => {
        el.style.display = 'none';
        el.innerHTML = '';
    });
    _routeOverlay.querySelector('#route-hour-panel').style.display = 'none';
    _routeOverlay.querySelector('#route-minute-panel').style.display = 'none';
    unlockBodyScroll();
}

function routeMetaText() {
    const min = getRouteDepartMin();
    const mode = _routeDepartMin !== null ? '自定义时间' : '系统时间';
    return `出发时刻 ${fmtHM(min)}（${mode}）`;
}

function setRouteMeta(text) {
    const el = _routeOverlay && _routeOverlay.querySelector('#route-meta');
    if (el) el.textContent = text;
}

/* ==========================================
   规划
   ========================================== */
async function runRoutePlanning() {
    const startInput = _routeOverlay.querySelector('#route-start');
    const endInput = _routeOverlay.querySelector('#route-end');
    const resultsEl = _routeOverlay.querySelector('#route-results');
    const goBtn = _routeOverlay.querySelector('#route-go');

    const start = startInput.value.trim();
    const end = endInput.value.trim();
    if (!start || !end) {
        resultsEl.innerHTML = `<div class="route-error">请填写起点和终点</div>`;
        return;
    }
    if (start === end) {
        resultsEl.innerHTML = `<div class="route-error">起点和终点不能相同</div>`;
        return;
    }

    const sortRadio = _routeOverlay.querySelector('input[name="route-sort"]:checked');
    const sortMode = sortRadio ? sortRadio.value : 'fastest';
    const departMin = getRouteDepartMin();

    goBtn.disabled = true;
    goBtn.textContent = '规划中…';
    resultsEl.innerHTML = `<div class="route-loading">正在计算前 ${PLAN_TARGET} 条路径…</div>`;

    try {
        const r = await planRoutes(start, end, departMin, sortMode);

        if (r.error) {
            resultsEl.innerHTML = `<div class="route-error">${escapeHtml(r.error)}</div>`;
            return;
        }
        if (r.results.length === 0) {
            let html = `<div class="route-empty">`;
            html += `<div class="route-empty-title">当前时刻没有可用的路径</div>`;
            if (r.rejected.length > 0) {
                html += `<div class="route-reject-hint">${r.rejected.length} 条路径因末班车已停运被过滤</div>`;
                const reasons = [...new Set(r.rejected.map(x => x.reason))].slice(0, 3);
                html += `<ul class="route-reject-list">${reasons.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
            }
            html += `</div>`;
            const legendEl = _routeOverlay.querySelector('#route-legend');
            if (legendEl) legendEl.style.display = 'none';
            resultsEl.innerHTML = html;
            return;
        }

        // 有任一结果里带紧急徽章 → 显示图例
        const hasUrgent = r.results.some(item =>
            (item.boardingMargins || []).some(m =>
                m != null && m !== 'unknown' && m >= 0 && m <= 5
            )
        );
        const legendEl = _routeOverlay.querySelector('#route-legend');
        if (legendEl) legendEl.style.display = hasUrgent ? 'flex' : 'none';

        resultsEl.innerHTML = r.results.map((item, idx) =>
            renderRouteCard(item, idx, start, end)
        ).join('');

        resultsEl.querySelectorAll('.route-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.route-guide')) return;
                card.classList.toggle('expanded');
            });
        });
    } catch (e) {
        console.error('[路径规划] 失败', e);
        resultsEl.innerHTML = `<div class="route-error">规划失败：${escapeHtml(e.message)}</div>`;
    } finally {
        goBtn.disabled = false;
        goBtn.textContent = '规划';
        setRouteMeta(routeMetaText());
    }
}

/* ==========================================
   渲染
   ========================================== */
function formatDuration(seconds) {
    const s = Math.round(seconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h}小时${mm}分${r}秒`;
    }
    if (m > 0) return `${m}分${r}秒`;
    return `${r}秒`;
}

function renderRouteSegmentsHtml(path, boardingMargins) {
    const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(path) : [];
    if (segs.length === 0) return '';
    const margins = boardingMargins || [];

    return `<span class="route-segments">` + segs.map((s, i) => {
        const m = margins[i];
        const isUrgent = (m != null && m !== 'unknown' && m >= 0 && m <= 5);

        const warnSvg = isUrgent
            ? `<svg class="route-segment-warn" viewBox="0 0 24 24" aria-hidden="true">
                   <path d="M12 2 L22 20 L2 20 Z"
                         fill="#f59e0b"
                         stroke="#1f2b3c"
                         stroke-width="1.8"
                         stroke-linejoin="round"/>
                   <line x1="12" y1="9" x2="12" y2="14"
                         stroke="#1f2b3c" stroke-width="2.2" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.2" fill="#1f2b3c"/>
               </svg>`
            : '';

        const badge = `<span class="route-segment-badge${isUrgent ? ' urgent' : ''}"
                            style="background:${s.color}; color:${s.textColor};">
                            ${escapeHtml(s.shortName)}${warnSvg}
                       </span>`;
        return i === 0 ? badge : `<span class="route-seg-arrow">→</span>${badge}`;
    }).join('') + `</span>`;
}

function renderRouteCard(item, idx, startName, endName) {
    const rank = item.rank || (idx + 1);
    const transferStations = item.interchanges.map(o => o.key.split('|')[0]).filter(Boolean);
    const transferText = transferStations.length > 0
        ? transferStations.join(' · ')
        : '直达';

    let warningHtml = '';
    if (item.warnings && item.warnings.length > 0) {
        warningHtml = `<div class="route-warnings">` + item.warnings.map(w => {
            const content = w.messageHtml ? w.messageHtml : escapeHtml(w.message || '');
            return `<div class="route-warning">
                <span class="route-warning-icon">⚠️</span>
                <span class="route-warning-text">${content}</span>
            </div>`;
        }).join('') + `</div>`;
    }

    // ---- 换乘指引 ----
    let guideHtml;
    if (item.interchanges.length === 0) {
        guideHtml = `<div class="route-guide"><div class="route-guide-empty">✓ 直达，无需换乘</div></div>`;
    } else {
        // ---- 组装"上车点列表"：起点 + 每个换乘站 ----
        const boardingPoints = [];
        boardingPoints.push({
            station: startName,
            fromShort: null,
            toShort: null,
            note: null,
            door: null,
            timeMin: null,
            walkMin: null,
            boardingTime: null,
            marginMin: item.startMargin,                      // ← 改成这个
        });

        for (let i = 0; i < item.interchanges.length; i++) {
            const o = item.interchanges[i];
            const g = ROUTE_GRAPH.guides.get(o.key);
            const parts = o.key.split('|');
            boardingPoints.push({
                station: g ? g.station : parts[0],
                fromShort: routeShortLineName(g ? g.fromLine : parts[1]),
                toShort: routeShortLineName(g ? g.toLine : parts[3]),
                note: g && g.detail ? g.detail : null,
                door: null,
                timeMin: o.timeMin,
                walkMin: o.walkMin,
                boardingTime: o.boardingTime,
                marginMin: o.marginMin,
            });
        }

        // 门号填充：boardingPoints[i] 的门号来自 interchanges[i] 的 guide.screenDoors
        // （"在当前上车的这条线上，为方便下一次换乘应站的门"）
        for (let i = 0; i < boardingPoints.length; i++) {
            if (i < item.interchanges.length) {
                const g = ROUTE_GRAPH.guides.get(item.interchanges[i].key);
                if (g && g.screenDoors && g.screenDoors.length > 0) {
                    boardingPoints[i].door = formatScreenDoorsRange(g.screenDoors);
                }
            }
        }

        guideHtml = `<div class="route-guide">` + boardingPoints.map(bp => {
            const stationHtml = `<span class="route-guide-station">${escapeHtml(bp.station)}</span>`;
            const changeHtml = bp.fromShort
                ? `<span class="route-guide-change">${escapeHtml(bp.fromShort)}→${escapeHtml(bp.toShort)}</span>`
                : '';
            const noteHtml = bp.note
                ? `<span class="route-guide-note">${escapeHtml(bp.note)}</span>`
                : '';
            const doorHtml = bp.door
                ? `<span class="route-guide-doors">门 ${escapeHtml(bp.door)}</span>`
                : '';

            // 右侧时间信息
            const arriveStr  = (bp.timeMin      != null && !isNaN(bp.timeMin))      ? fmtHM(bp.timeMin)      : '';
            const boardingStr = (bp.boardingTime != null && !isNaN(bp.boardingTime)) ? fmtHM(bp.boardingTime) : '';
            let walkStr = '';
            if (bp.walkMin != null && bp.walkMin > 0) {
                if (bp.walkMin < 1) {
                    walkStr = `走${Math.max(1, Math.round(bp.walkMin * 60))}秒`;
                } else {
                    walkStr = `走${Math.round(bp.walkMin)}分`;
                }
            }

            let marginStr = '';
            if (bp.marginMin != null && !isNaN(bp.marginMin)) {
                const m = Math.round(bp.marginMin);
                if (m >= 0 && m <= 15) {
                    marginStr = `<span class="route-guide-margin urgent">剩${m}分</span>`;
                }
            }

            let timeHtml = '';
            if (arriveStr || marginStr) {
                let row1 = '';
                let row2 = '';

                if (arriveStr) {
                    const row1Parts = [`<span class="route-guide-time">到${arriveStr}</span>`];
                    if (walkStr) row1Parts.push(`<span class="route-guide-walk">${walkStr}</span>`);
                    row1 = `<span class="route-guide-time-row">${row1Parts.join('<span class="route-guide-dot">·</span>')}</span>`;
                }

                if (boardingStr || marginStr) {
                    const row2Parts = [];
                    if (boardingStr) row2Parts.push(`<span class="route-guide-time">候${boardingStr}</span>`);
                    if (marginStr) row2Parts.push(marginStr);
                    row2 = row2Parts.length > 0
                        ? `<span class="route-guide-time-row">${row2Parts.join('<span class="route-guide-dot">·</span>')}</span>`
                        : '';
                }

                timeHtml = `<span class="route-guide-time-wrap">${row1}${row2}</span>`;
            }

            return `<div class="route-guide-item">
                <div class="route-guide-head">
                    ${stationHtml}
                    ${changeHtml}
                    ${noteHtml}
                    ${doorHtml}
                </div>
                ${timeHtml}
            </div>`;
        }).join('') + `</div>`;
    }

    return `
        <div class="route-card" data-rank="${rank}">
            <div class="route-rank">${rank}</div>
            <div class="route-card-head">
                <div class="route-summary">
                                        <div class="route-line-path">${renderRouteSegmentsHtml(item.path, item.boardingMargins)}</div>
                    <div class="route-sub">
                        <span>⏱ ${formatDuration(item.totalCost)}</span>
                        <span>换 ${item.interchanges.length} 次</span>
                        <span>${item.stationRoute.length + 2} 站</span>
                        <span>🚏 ${escapeHtml(transferText)}</span>
                    </div>
                </div>
                <div class="route-arrive">
                    <div class="route-arrive-time">${fmtHM(item.arriveMin)}</div>
                    <div class="route-arrive-label">到达</div>
                </div>
            </div>
            ${warningHtml}
            <div class="route-detail">
                <div class="route-stations">
                    <span class="route-station">${escapeHtml(startName)}</span>
                    ${item.stationRoute.map(s =>
        `<span class="route-arrow">→</span><span class="route-station">${escapeHtml(s)}</span>`
    ).join('')}
                    <span class="route-arrow">→</span><span class="route-station">${escapeHtml(endName)}</span>
                </div>
                ${guideHtml}
            </div>
        </div>
    `;
}

function formatScreenDoorsRange(doors) {
    const arr = [...doors].filter(x => typeof x === 'number').sort((a, b) => a - b);
    if (arr.length === 0) return '';
    const out = [];
    let start = 0;
    for (let i = 0; i < arr.length; i++) {
        if (i === arr.length - 1 || arr[i + 1] !== arr[i] + 1) {
            if (i - start >= 2) {
                out.push(arr[start] + '至' + arr[i]);
            } else {
                for (let j = start; j <= i; j++) out.push(String(arr[j]));
            }
            start = i + 1;
        }
    }
    return out.join('\\');
}

/** 线路名简写：1号线 → 1，广佛线 → 广佛，佛山2号线 → 佛2 */
function routeShortLineName(line) {
    if (!line) return '';
    let name = line.replace(/号线/g, '');
    if (name.includes('佛山')) name = name.replace(/佛山/g, '佛');
    if (name.endsWith('线')) name = name.slice(0, -1);
    return name;
}