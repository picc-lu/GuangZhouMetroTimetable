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
                            <label>起</label>
                            <div class="route-autocomplete">
                                <input id="route-start" class="route-input"
                                       placeholder="出发站" autocomplete="off">
                                <div class="route-suggestions" id="route-start-suggestions"></div>
                            </div>
                        </div>
                        <div class="route-field route-field-end">
                            <label>终</label>
                            <div class="route-autocomplete">
                                <input id="route-end" class="route-input"
                                       placeholder="到达站" autocomplete="off">
                                <div class="route-suggestions" id="route-end-suggestions"></div>
                            </div>
                        </div>
                        <button id="route-swap" class="route-swap-btn" type="button"
                                title="交换起点和终点" aria-label="交换起点和终点">
                            <svg class="swap-icon" viewBox="0 0 24 24" width="16" height="16"
                                 fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="4 7 20 7"></polyline>
                                <polyline points="16 3 20 7 16 11"></polyline>
                                <polyline points="20 17 4 17"></polyline>
                                <polyline points="8 13 4 17 8 21"></polyline>
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
                    <div class="route-extra-options">
                        <label class="route-extra-option">
                            <span class="route-switch">
                                <input type="checkbox" id="route-max-transfer-check">
                                <span class="route-switch-track"><span class="route-switch-thumb"></span></span>
                            </span>
                            <span>单次换乘时间不超过</span>
                            <input type="text" id="route-max-transfer-min"
                                   class="route-max-transfer-input"
                                   inputmode="numeric" pattern="[0-9]*"
                                   maxlength="2" value="5" disabled>
                            <span>分钟</span>
                        </label>
                        <label class="route-extra-option">
                            <span class="route-switch">
                                <input type="checkbox" id="route-avoid-outdoor-check">
                                <span class="route-switch-track"><span class="route-switch-thumb"></span></span>
                            </span>
                            <span class="route-extra-option-label">
                                <span class="route-extra-option-title">不走站外换乘</span>
                                <span class="route-extra-option-sub">目前仅琶洲 8↔11 与五羊邨 5↔10</span>
                            </span>
                        </label>
                    </div>
                    <button id="route-go" class="route-go" type="button">
                        <span class="route-go-text">规划</span>
                        <span class="route-go-spinner" aria-hidden="true"></span>
                    </button>
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
                    <span>此标志表示到达该线路时，距离末班车小于 5 分钟，请慎重选择</span>
                </div>
                <div class="route-legend route-legend-3line" id="route-legend-3line" style="display:none">
                    <svg class="route-legend-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" fill="#dc2626"/>
                        <line x1="12" y1="7" x2="12" y2="13"
                              stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                        <circle cx="12" cy="17" r="1.5" fill="#ffffff"/>
                    </svg>
                    <span>3 号线出现该标志，表示该路径存在跨段风险，请展开卡片查看换乘指引</span>
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

    enableSelectAllOnFocus(ov.querySelector('#route-start'));
    enableSelectAllOnFocus(ov.querySelector('#route-end'));
    enableSelectAllOnFocus(ov.querySelector('#route-max-transfer-min'));

    ov.querySelector('#route-swap').addEventListener('click', () => {
        const startInput = ov.querySelector('#route-start');
        const endInput   = ov.querySelector('#route-end');
        const stops      = ov.querySelector('.route-stops');
        const btn        = ov.querySelector('#route-swap');
        if (!startInput || !endInput || !stops) return;

        // 防止连点导致动画/数据错乱
        if (stops.classList.contains('swap-out') ||
            stops.classList.contains('swap-in')) return;

        // 按钮自身的旋转（沿用之前的 spinning class）
        btn.classList.toggle('spinning');

        // ---- 阶段 1：文字向外滑出 ----
        stops.classList.add('swap-out');

        setTimeout(() => {
            // ---- 交换数据 ----
            const tmp = startInput.value;
            startInput.value = endInput.value;
            endInput.value = tmp;

            // 关闭候选框
            const s1 = ov.querySelector('#route-start-suggestions');
            const s2 = ov.querySelector('#route-end-suggestions');
            if (s1) { s1.style.display = 'none'; s1.innerHTML = ''; }
            if (s2) { s2.style.display = 'none'; s2.innerHTML = ''; }

            // ---- 阶段 2：文字从反方向滑入 ----
            stops.classList.remove('swap-out');
            stops.classList.add('swap-in');

            setTimeout(() => {
                stops.classList.remove('swap-in');
            }, 240);
        }, 220);
    });

    // 最大换乘时长复选框：勾选时启用数字输入框（不自动聚焦，避免 iOS 弹出键盘）
    const maxTransferCheck = ov.querySelector('#route-max-transfer-check');
    const maxTransferInput = ov.querySelector('#route-max-transfer-min');
    if (maxTransferCheck && maxTransferInput) {
        maxTransferCheck.addEventListener('change', () => {
            maxTransferInput.disabled = !maxTransferCheck.checked;
        });

        // 输入过滤：只允许 0-9，范围 0~60
        maxTransferInput.addEventListener('input', () => {
            let v = maxTransferInput.value.replace(/\D/g, '');
            if (v === '') {
                maxTransferInput.value = '';
                return;
            }
            let n = parseInt(v, 10);
            if (isNaN(n) || n < 0) n = 0;
            if (n > 60) n = 60;
            maxTransferInput.value = String(n);
        });
        maxTransferInput.addEventListener('blur', () => {
            if (maxTransferInput.value === '') maxTransferInput.value = '5';
        });
    }

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
    // 时面板 7 列，分面板 6 列（单元格加大后同步加宽面板）
    const pw = panel.classList.contains('rows-3') ? 380 : 330;

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
    let min;
    if (_routeDepartMin !== null) {
        min = _routeDepartMin;
    } else {
        const d = new Date();
        min = d.getHours() * 60 + d.getMinutes();
    }
    // 0:00~1:59 归入次日凌晨（+1440），与 timeStrToMinutes 的解析规则保持一致
    if (min < 120) min += 1440;
    return min;
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
                try {
                    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
                } catch (_) {}
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

/* ==========================================
   路径规划搜索过滤：排除 APM / 有轨电车
   ========================================== */
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

/** 隐藏所有图例（5 分钟紧急 + 3 号线跨段） */
function hideAllRouteLegends() {
    if (!_routeOverlay) return;
    const l1 = _routeOverlay.querySelector('#route-legend');
    const l2 = _routeOverlay.querySelector('#route-legend-3line');
    if (l1) l1.style.display = 'none';
    if (l2) l2.style.display = 'none';
}

/* ==========================================
   规划
   ========================================== */
async function runRoutePlanning() {
    if (!_routeOverlay) return;

    const startInput = _routeOverlay.querySelector('#route-start');
    const endInput = _routeOverlay.querySelector('#route-end');
    const resultsEl = _routeOverlay.querySelector('#route-results');
    const goBtn = _routeOverlay.querySelector('#route-go');

    if (!startInput || !endInput || !resultsEl || !goBtn) return;

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

    // 读取"单次换乘时间不超过 n 分钟"（允许 0）
    let maxTransferMin = null;
    const mtc = _routeOverlay.querySelector('#route-max-transfer-check');
    const mti = _routeOverlay.querySelector('#route-max-transfer-min');
    if (mtc && mtc.checked && mti) {
        const v = parseInt(mti.value, 10);
        if (!isNaN(v) && v >= 0) {
            maxTransferMin = Math.min(v, 60);
        }
    }

    // 读取"不走站外换乘"
    let avoidOutOfStation = false;
    const aoc = _routeOverlay.querySelector('#route-avoid-outdoor-check');
    if (aoc) avoidOutOfStation = aoc.checked;

    // 进入 loading 状态：用 class，不动 textContent
    goBtn.disabled = true;
    goBtn.classList.add('loading');
    resultsEl.classList.add('is-loading');
    setRouteMeta('正在计算路径…');

    await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

    try {
        const r = await planRoutes(start, end, departMin, sortMode,
            maxTransferMin, avoidOutOfStation);

        if (r.error) {
            resultsEl.innerHTML = `<div class="route-error">${escapeHtml(r.error)}</div>`;
            hideAllRouteLegends();
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
            hideAllRouteLegends();
            resultsEl.innerHTML = html;
            return;
        }

        const hasUrgent = r.results.some(item =>
            (item.boardingMargins || []).some(m =>
                m != null && m !== 'unknown' && m >= 0 && m <= 5
            )
        );
        const legendEl = _routeOverlay.querySelector('#route-legend');
        if (legendEl) legendEl.style.display = hasUrgent ? 'flex' : 'none';

        const has3LineWarning = r.results.some(item =>
            item.warnings && item.warnings.some(w => w.risky3LineFrom && w.risky3LineTo)
        );
        const legend3LineEl = _routeOverlay.querySelector('#route-legend-3line');
        if (legend3LineEl) legend3LineEl.style.display = has3LineWarning ? 'flex' : 'none';

        resultsEl.innerHTML = r.results.map((item, idx) =>
            renderRouteCard(item, idx, start, end)
        ).join('');

        // 卡片展开/收起
        resultsEl.querySelectorAll('.route-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.route-guide')) return;
                if (e.target.closest('.route-stations-toggle')) return;
                if (e.target.closest('.route-station-more-btn')) return;   // ★ 新增
                card.classList.toggle('expanded');
            });
        });

        // 「展开中间 N 站」内联按钮：展开完整列表，并让底部切换按钮接管
        resultsEl.querySelectorAll('.route-station-more-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.route-card');
                if (!card) return;

                const collapsedEl = card.querySelector('.route-stations-collapsed');
                const fullEl      = card.querySelector('.route-stations-full');
                const toggleWrap  = card.querySelector('.route-stations-toggle-wrap');
                const toggleBtn   = toggleWrap ? toggleWrap.querySelector('.route-stations-toggle') : null;
                if (!collapsedEl || !fullEl || !toggleWrap) return;

                collapsedEl.style.display = 'none';
                fullEl.style.display = '';
                toggleWrap.style.display = '';

                if (toggleBtn) {
                    toggleBtn.dataset.expanded = '1';
                    const textEl = toggleBtn.querySelector('.route-stations-toggle-text');
                    if (textEl) textEl.textContent = '收起站点列表';
                }
            });
        });

        // 站点列表展开/收起
        resultsEl.querySelectorAll('.route-stations-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.route-card');
                if (!card) return;
                const collapsedEl = card.querySelector('.route-stations-collapsed');
                const fullEl = card.querySelector('.route-stations-full');
                if (!collapsedEl || !fullEl) return;

                const expanded = btn.dataset.expanded === '1';
                const total = btn.dataset.total;
                const textEl = btn.querySelector('.route-stations-toggle-text');

                if (expanded) {
                    // 收起：回到折叠状态，同时隐藏底部按钮
                    // （让中间的「展开中间 N 站」按钮成为唯一入口）
                    collapsedEl.style.display = '';
                    fullEl.style.display = 'none';
                    btn.dataset.expanded = '0';
                    if (textEl) textEl.textContent = `展开全部 ${total} 站`;

                    const wrap = btn.closest('.route-stations-toggle-wrap');
                    if (wrap) wrap.style.display = 'none';
                } else {
                    // 展开：正常显示完整列表
                    collapsedEl.style.display = 'none';
                    fullEl.style.display = '';
                    btn.dataset.expanded = '1';
                    if (textEl) textEl.textContent = '收起站点列表';
                }
            });
        });

    } catch (e) {
        const resultsEl2 = _routeOverlay.querySelector('#route-results');
        if (resultsEl2) {
            resultsEl2.innerHTML =
                `<div class="route-error">规划失败：${escapeHtml(e.message || String(e))}</div>`;
        }
    } finally {
        const goBtn2 = _routeOverlay.querySelector('#route-go');
        if (goBtn2) {
            goBtn2.disabled = false;
            goBtn2.classList.remove('loading');
        }
        resultsEl.classList.remove('is-loading');
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

function renderRouteSegmentsHtml(path, boardingMargins, has3LineWarning) {
    const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(path) : [];
    if (segs.length === 0) return '';
    const margins = boardingMargins || [];

    return `<span class="route-segments">` + segs.map((s, i) => {
        const m = margins[i];
        const isUrgent = (m != null && m !== 'unknown' && m >= 0 && m <= 5);
        const is3LineWarn = has3LineWarning && s.fullLine === '3号线';

        const urgentSvg = isUrgent
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

        const warn3Svg = is3LineWarn
            ? `<svg class="route-segment-warn-3line" viewBox="0 0 24 24" aria-hidden="true">
                   <circle cx="12" cy="12" r="10" fill="#dc2626"/>
                   <line x1="12" y1="7" x2="12" y2="13"
                         stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.5" fill="#ffffff"/>
               </svg>`
            : '';

        const badge = `<span class="route-segment-badge${isUrgent ? ' urgent' : ''}${is3LineWarn ? ' warn-3line' : ''}"
                            style="background:${s.color}; color:${s.textColor};">
                            ${escapeHtml(s.shortName)}${urgentSvg}${warn3Svg}
                       </span>`;
        return i === 0 ? badge : `<span class="route-seg-arrow">→</span>${badge}`;
    }).join('') + `</span>`;
}

/* ==========================================
   站点列表：默认折叠，超过阈值才显示切换按钮
   ========================================== */
const STATION_LIST_COLLAPSE_THRESHOLD = 12;   // 含首尾站点，超过即折叠
const STATION_LIST_HEAD = 4;                  // 折叠时头部保留站数（不含起点）
const STATION_LIST_TAIL = 4;                  // 折叠时尾部保留站数（不含终点）

function buildStationListHtml(startName, endName, stationRoute) {
    const totalStations = stationRoute.length + 2;

    const fullHtml = `
        <span class="route-station">${escapeHtml(startName)}</span>
        ${stationRoute.map(s =>
        `<span class="route-arrow">→</span><span class="route-station">${escapeHtml(s)}</span>`
    ).join('')}
        <span class="route-arrow">→</span><span class="route-station">${escapeHtml(endName)}</span>
    `;

    // 短路径：直接铺开，不显示切换按钮
    if (totalStations <= STATION_LIST_COLLAPSE_THRESHOLD) {
        return `<div class="route-stations">${fullHtml}</div>`;
    }

    // 长路径：默认折叠
    const head = stationRoute.slice(0, STATION_LIST_HEAD);
    const tail = stationRoute.slice(-STATION_LIST_TAIL);
    const hiddenCount = stationRoute.length - STATION_LIST_HEAD - STATION_LIST_TAIL;

    // 折叠视图：中间的「… 中间 N 站 …」改为可点击按钮
    const collapsedHtml = `
        <span class="route-station">${escapeHtml(startName)}</span>
        ${head.map(s =>
        `<span class="route-arrow">→</span><span class="route-station">${escapeHtml(s)}</span>`
    ).join('')}
        <span class="route-arrow">→</span><button type="button"
                class="route-station-more-btn"
                data-hidden-count="${hiddenCount}"
                title="点击展开中间 ${hiddenCount} 站">展开中间 ${hiddenCount} 站</button>
        ${tail.map(s =>
        `<span class="route-arrow">→</span><span class="route-station">${escapeHtml(s)}</span>`
    ).join('')}
        <span class="route-arrow">→</span><span class="route-station">${escapeHtml(endName)}</span>
    `;

    // 底部的「展开/收起」按钮容器初始 display:none，
    // 由中间按钮点击后接管显示（避免两个入口同时出现）
    return `
        <div class="route-stations route-stations-collapsed">${collapsedHtml}</div>
        <div class="route-stations route-stations-full" style="display:none">${fullHtml}</div>
        <div class="route-stations-toggle-wrap" style="display:none">
            <button class="route-stations-toggle" type="button"
                    data-expanded="0" data-total="${totalStations}">
                <span class="route-stations-toggle-text">展开全部 ${totalStations} 站</span>
                <svg class="route-stations-toggle-icon" viewBox="0 0 24 24" width="14" height="14"
                     fill="none" stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
        </div>
    `;
}

/* ==========================================
   从路径中提取指定线路、指定站的上车方向
   - 11 号线环线：用路径实际末端的站名
   - 多终点线路：优先显示"末班车未过"的最远终点
   - 其他线路：直接用原始方向字段
   ========================================== */
function getSegmentDirection(path, station, lineName) {
    if (!lineName || !path || !path.nodes) return null;

    // 11 号线环线走独立逻辑
    if (lineName === '11号线') {
        return get11LineDirectionFromPath(path, station);
    }

    // 1. 读原始方向字段（兜底）
    let rawDirection = null;
    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length >= 4
            && parts[0] === lineName
            && parts[1] === station
            && parts[3] === '站台') {
            rawDirection = parts[2];
            break;
        }
    }
    if (!rawDirection) return null;

    // 2. 数据不足 → 直接返回原始方向
    const lineData = (typeof lineDirectionTime !== 'undefined')
        ? lineDirectionTime[lineName] : null;
    const stationData = lineData && lineData[station];
    const lineStations = (typeof LINE_STATIONS !== 'undefined' && LINE_STATIONS[lineName]) || [];
    if (!stationData || lineStations.length === 0) return rawDirection;

    // 3. 找出该段在 path 里的实际末端站
    const segmentEnd = getSegmentEndStation(path, station, lineName);
    if (!segmentEnd) return rawDirection;

    // 4. 找到原始方向对应的数据数组（up / down）
    const dirName = rawDirection.replace(/方向$/, '');
    let dirArray = null;
    for (const key of ['up', 'down']) {
        if (!Array.isArray(stationData[key])) continue;
        if (stationData[key].some(t =>
            (t.to || '').split(/[（(]/)[0] === dirName
        )) {
            dirArray = stationData[key];
            break;
        }
    }
    if (!dirArray || dirArray.length === 0) return rawDirection;

    // 5. 线路顺序索引
    const idxStation = lineStations.indexOf(station);
    const idxEnd     = lineStations.indexOf(segmentEnd);
    if (idxStation < 0 || idxEnd < 0) return rawDirection;

    // ★ 用路径规划的出发时刻判断方向，而非主页面的自定义时间
    const currentMin = (typeof getRouteDepartMin === 'function')
        ? getRouteDepartMin() : null;
    if (currentMin == null) return rawDirection;

    const isForward = idxEnd > idxStation;

    // 6. 从 segmentEnd 出发，沿运行方向向远端遍历，
    //    找到第一个"末班车未过"的终点站作为方向名。
    if (isForward) {
        for (let i = lineStations.length - 1; i >= idxEnd; i--) {
            const cand = lineStations[i];
            const hasService = dirArray.some(t =>
                (t.to || '').split(/[（(]/)[0] === cand && currentMin <= t.last
            );
            if (hasService) return cand + '方向';
        }
    } else {
        for (let i = 0; i <= idxEnd; i++) {
            const cand = lineStations[i];
            const hasService = dirArray.some(t =>
                (t.to || '').split(/[（(]/)[0] === cand && currentMin <= t.last
            );
            if (hasService) return cand + '方向';
        }
    }

    return rawDirection;
}

/** 收集某条线路所有方向数据里出现过的终点站名（去括号后缀） */
function collectTerminalCandidates(lineName) {
    const set = new Set();
    const lineData = (typeof lineDirectionTime !== 'undefined')
        ? lineDirectionTime[lineName] : null;
    if (!lineData) return set;

    for (const st in lineData) {
        const d = lineData[st];
        if (!d) continue;
        for (const t of (d.up || [])) {
            const n = (t.to || '').split(/[（(]/)[0];
            if (n) set.add(n);
        }
        for (const t of (d.down || [])) {
            const n = (t.to || '').split(/[（(]/)[0];
            if (n) set.add(n);
        }
    }
    return set;
}

/** 从 path 里，从 startStation 开始、到离开 lineName 为止的最后一个站名 */
function getSegmentEndStation(path, startStation, lineName) {
    let foundStart = false;
    let lastStation = null;

    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;

        if (parts[0] !== lineName) {
            if (foundStart) break;
            continue;
        }

        const st = parts[1];
        if (st === '开始' || st === '结束') continue;

        if (!foundStart) {
            if (st === startStation) {
                foundStart = true;
                lastStation = st;
            }
        } else if (st !== lastStation) {
            lastStation = st;
        }
    }

    return lastStation;
}

/**
 * 从 path 中，提取从 startStation 开始、到离开 11 号线为止的
 * 最后一个站名，作为该段 11 号线的前进方向。
 *
 * 例：path 里有 「11号线|五凤|外环方向|站台」→「11号线|大塘|...」→「11号线|龙潭|...」
 *     则 startStation='五凤' 返回 '龙潭方向'
 */
function get11LineDirectionFromPath(path, startStation) {
    let foundStart = false;
    let lastStation = null;

    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;

        if (parts[0] !== '11号线') {
            if (foundStart) break;   // 离开 11 号线，停止收集
            continue;
        }

        const st = parts[1];
        if (st === '开始' || st === '结束') continue;

        if (!foundStart) {
            if (st === startStation) {
                foundStart = true;
                lastStation = st;
            }
        } else if (st !== lastStation) {
            lastStation = st;
        }
    }

    if (lastStation && lastStation !== startStation) {
        return lastStation + '方向';
    }
    return null;
}

/** 把 "芳村方向" 格式化成 " · 往芳村方向" */
function formatDirectionText(direction) {
    if (!direction) return '';
    const name = direction.replace(/方向$/, '');
    return `<span class="route-guide-direction">· 往${escapeHtml(name)}</span>`;
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
        // 直达路径：起点 boarding 余量 ≤15 分钟时提示"剩 x 分"
        const startMargin = (item.boardingMargins && item.boardingMargins.length > 0
            && item.boardingMargins[0] != null
            && item.boardingMargins[0] !== 'unknown')
            ? Math.round(item.boardingMargins[0]) : null;

        let marginHtml = '';
        if (startMargin !== null && startMargin >= 0 && startMargin <= 15) {
            marginHtml = `<span class="route-guide-margin urgent">剩${startMargin}分</span>`;
        }

        guideHtml = `<div class="route-guide">
            <div class="route-guide-empty">
                <span>✓ 直达，无需换乘</span>
                ${marginHtml}
            </div>
        </div>`;
    } else {
        // ---- 组装"上车点列表"：起点 + 每个换乘站 ----
        const boardingPoints = [];
        const segs = (typeof parseRouteSegments === 'function')
            ? parseRouteSegments(item.path) : [];
        const firstSeg = segs[0] || null;
        const firstDir = firstSeg
            ? getSegmentDirection(item.path, startName, firstSeg.fullLine)
            : null;

        boardingPoints.push({
            station: startName,
            fromShort: null,
            toShort: firstSeg ? firstSeg.shortName : null,   // ★ 起点也用 toShort
            direction: firstDir,                             // ★ 起点也带方向
            note: null,
            door: null,
            timeMin: null,
            walkMin: null,
            boardingTime: null,
            marginMin: item.startMargin,
        });

        for (let i = 0; i < item.interchanges.length; i++) {
            const o = item.interchanges[i];
            const g = ROUTE_GRAPH.guides.get(o.key);
            const parts = o.key.split('|');
            const toLine   = g ? g.toLine   : parts[3];
            const toStation = g ? g.station : parts[0];

            boardingPoints.push({
                station: toStation,
                fromShort: routeShortLineName(g ? g.fromLine : parts[1]),
                toShort:   routeShortLineName(toLine),
                lineShort: null,
                direction: getSegmentDirection(item.path, toStation, toLine),  // ★ 换乘方向
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
            // ★ 起点与换乘统一使用同一模板
            const changeHtml = bp.toShort
                ? `<span class="route-guide-change">${escapeHtml(bp.toShort)}${formatDirectionText(bp.direction)}</span>`
                : '';
            const noteHtml = bp.note
                ? `<span class="route-guide-note">${escapeHtml(bp.note)}</span>`
                : '';
            const doorHtml = bp.door
                ? `<span class="route-guide-doors">门 ${escapeHtml(bp.door)}</span>`
                : '';

            // 右侧时间信息
            const arriveStr = (bp.timeMin != null && !isNaN(bp.timeMin)) ? fmtHM(bp.timeMin) : '';
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
                    <div class="route-line-path">${renderRouteSegmentsHtml(item.path, item.boardingMargins, item.warnings && item.warnings.length > 0)}</div>
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
            <div class="route-detail">
                ${warningHtml}
                ${buildStationListHtml(startName, endName, item.stationRoute)}
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

/* ==========================================
   输入框：点击（聚焦）时自动全选内容
   ========================================== */
function enableSelectAllOnFocus(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('focus', () => {
        // 延迟到下一个任务，让浏览器先完成默认的聚焦光标定位
        setTimeout(() => {
            // 焦点已转移则不再全选（例如用户迅速点了别处）
            if (document.activeElement !== inputEl) return;
            try { inputEl.select(); } catch (_) {}
        }, 0);
    });
}