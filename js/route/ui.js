// ========== 路径规划 UI ==========

// 反向规划模式：false = 输入出发时刻，true = 输入到达时刻
let _routeArriveMode = false;
// 最近一次成功反向搜索得到的最晚出发时刻（分钟），用于结果区展示
let _routeLastArrivedAt = null;
// 当前规划使用的出发时刻（分钟），供 getSegmentDirection 等下游函数使用
let _routeActiveDepartMin = null;

let _routeOverlay = null;
let _routeDepartMin = null;

let _routeTimeDocClickBound = false;

/* ==========================================
   偏好设置 / 起终点历史（localStorage 持久化）
   ========================================== */
const ROUTE_PREFS_KEY   = 'route_prefs';
const ROUTE_HISTORY_KEY = 'route_history';
const ROUTE_HISTORY_MAX = 5;

function loadRoutePrefs() {
    try {
        const raw = localStorage.getItem(ROUTE_PREFS_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : null;
    } catch (_) { return null; }
}

function saveRoutePrefs(prefs) {
    try { localStorage.setItem(ROUTE_PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
}

function loadRouteHistory() {
    try {
        const raw = localStorage.getItem(ROUTE_HISTORY_KEY);
        if (!raw) return { starts: [], ends: [] };
        const obj = JSON.parse(raw);
        return {
            starts: Array.isArray(obj.starts) ? obj.starts : [],
            ends:   Array.isArray(obj.ends)   ? obj.ends   : [],
        };
    } catch (_) {
        return { starts: [], ends: [] };
    }
}

function saveRouteHistory(history) {
    try { localStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
}

function pushRouteHistory(kind, station) {
    if (!station) return;
    const history = loadRouteHistory();
    const arr = kind === 'start' ? history.starts : history.ends;
    const idx = arr.indexOf(station);
    if (idx >= 0) arr.splice(idx, 1);
    arr.unshift(station);
    if (arr.length > ROUTE_HISTORY_MAX) arr.length = ROUTE_HISTORY_MAX;
    saveRouteHistory(history);
}

function getRouteHistoryArr(kind) {
    const history = loadRouteHistory();
    return kind === 'start' ? history.starts : history.ends;
}

function routeHistoryKind(inputEl) {
    if (!inputEl) return null;
    if (inputEl.id === 'route-start') return 'start';
    if (inputEl.id === 'route-end')   return 'end';
    return null;
}

/** 把保存的偏好应用到弹窗 UI */
function applyRoutePrefs(ov) {
    if (!ov) return;
    const prefs = loadRoutePrefs();
    if (!prefs) return;

    // 排序模式
    if (prefs.sortMode === 'conservative' || prefs.sortMode === 'fastest') {
        const radio = ov.querySelector(`input[name="route-sort"][value="${prefs.sortMode}"]`);
        if (radio) radio.checked = true;
    }

    // 时间模式
    if (typeof prefs.arriveMode === 'boolean') {
        _routeArriveMode = prefs.arriveMode;
        const wrap = ov.querySelector('#route-time-mode');
        if (wrap) {
            wrap.querySelectorAll('.route-time-mode-btn').forEach(b => {
                b.classList.toggle('active',
                    (b.dataset.mode === 'arrive') === _routeArriveMode);
            });
        }
        const nowBtn = ov.querySelector('#route-now');
        if (nowBtn) nowBtn.style.display = _routeArriveMode ? 'none' : '';
    }

    // 单次换乘上限
    const mtc = ov.querySelector('#route-max-transfer-check');
    const mti = ov.querySelector('#route-max-transfer-min');
    if (mtc && mti) {
        if (prefs.maxTransferChecked) {
            mtc.checked = true;
            mti.disabled = false;
            if (typeof prefs.maxTransferMin === 'number' &&
                prefs.maxTransferMin >= 0 && prefs.maxTransferMin <= 60) {
                mti.value = String(prefs.maxTransferMin);
            }
        } else {
            mtc.checked = false;
            mti.disabled = true;
        }
    }

    // 步行速度
    const wss = ov.querySelector('#route-walk-speed');
    if (wss && prefs.walkSpeed) {
        wss.value = String(prefs.walkSpeed);
    }

    // 不走站外换乘
    const aoc = ov.querySelector('#route-avoid-outdoor-check');
    if (aoc) aoc.checked = !!prefs.avoidOutOfStation;

    // 高级设置展开状态
    if (prefs.advancedOpen) {
        const advWrap   = ov.querySelector('#route-advanced');
        const advToggle = ov.querySelector('#route-advanced-toggle');
        if (advWrap && advToggle) {
            advWrap.classList.add('open');
            advToggle.setAttribute('aria-expanded', 'true');
        }
    }
}

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
                    <div class="route-field route-time-field">
                        <div class="route-time-trigger" id="route-hour-trigger">09</div>
                        <span class="route-time-sep">:</span>
                        <div class="route-time-trigger" id="route-minute-trigger">30</div>
                         <div class="route-time-mode" id="route-time-mode">
                            <button type="button" class="route-time-mode-btn active"
                                    data-mode="depart">出发</button>
                            <button type="button" class="route-time-mode-btn"
                                    data-mode="arrive">到达</button>
                        </div>
                        <button id="route-now" class="route-now-btn" type="button">现在</button>
                        <div class="route-time-panel" id="route-hour-panel"></div>
                        <div class="route-time-panel" id="route-minute-panel"></div>
                    </div>
                    <div class="route-advanced" id="route-advanced">
                        <button type="button" class="route-advanced-toggle"
                                id="route-advanced-toggle" aria-expanded="false">
                            <span class="route-advanced-title">⚙ 高级设置</span>
                            <svg class="route-advanced-icon" viewBox="0 0 24 24"
                                 width="14" height="14" fill="none" stroke="currentColor"
                                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="route-advanced-body">
                            <div class="route-advanced-inner">

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
                                    <label class="route-extra-option route-extra-speed">
                                        <span>步行速度</span>
                                                                    <select id="route-walk-speed" class="route-walk-speed-select">
                                <option value="1.2">悠闲 · 1.2 m/s</option>
                                <option value="1.5" selected>中等 · 1.5 m/s</option>
                                <option value="1.8">快走 · 1.8 m/s</option>
                            </select>
                                    </label>
                                </div>

                            </div>
                        </div>
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

    // 高级设置折叠
    const advWrap   = ov.querySelector('#route-advanced');
    const advToggle = ov.querySelector('#route-advanced-toggle');
    if (advWrap && advToggle) {
        advToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = advWrap.classList.toggle('open');
            advToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    // 时间模式 Tab：出发 / 到达
    const timeModeWrap = ov.querySelector('#route-time-mode');
    if (timeModeWrap) {
        timeModeWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.route-time-mode-btn');
            if (!btn) return;
            e.stopPropagation();
            const mode = btn.dataset.mode;
            if (mode === 'arrive' && !_routeArriveMode) {
                _routeArriveMode = true;
            } else if (mode === 'depart' && _routeArriveMode) {
                _routeArriveMode = false;
            } else {
                return;
            }
            timeModeWrap.querySelectorAll('.route-time-mode-btn').forEach(b => {
                b.classList.toggle('active', b === btn);
            });
            // 到达模式：隐藏"现在"按钮（"现在到达"语义不成立）
            const nowBtn = ov.querySelector('#route-now');
            if (nowBtn) nowBtn.style.display = _routeArriveMode ? 'none' : '';
            setRouteMeta(routeMetaText());
        });
    }

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

    // 步行速度变化
    const wssChange = ov.querySelector('#route-walk-speed');
    if (wssChange) {
        wssChange.addEventListener('change', () => {
            const v = parseFloat(wssChange.value);
            if (typeof ROUTE_GRAPH !== 'undefined' && ROUTE_GRAPH.loaded && !isNaN(v)) {
                ROUTE_GRAPH.userWalkSpeed = v;
            }
        });
    }

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
    applyRoutePrefs(ov);
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
            // ★ 空输入 → 显示历史
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
        // 统一走 updateSuggestions：空输入自动显示历史
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

    if (_routeArriveMode) {
        if (_routeLastArrivedAt != null) {
            return `目标到达 ${fmtHM(min)} · 建议出发 ${fmtHM(_routeLastArrivedAt)}（${mode}）`;
        }
        return `目标到达 ${fmtHM(min)}（${mode}）`;
    }
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
   空结果引导
   ========================================== */
function buildRouteSuggestions(r, currentCfg) {
    const suggestions = [];
    const reasons = r.rejected.map(x => x.reason).join(' ');
    const uniqueReasons = [...new Set(r.rejected.map(x => x.reason))];

    // 1. 单次换乘上限被卡住 → 建议关闭或提高
    if (currentCfg.maxTransferMin != null &&
        reasons.includes('超过设定上限')) {
        suggestions.push({
            action: 'disable-max-transfer',
            label: '关闭"单次换乘时间不超过"',
            value: '',
        });
        if (currentCfg.maxTransferMin < 15) {
            suggestions.push({
                action: 'set-max-transfer',
                label: `放宽到 15 分钟`,
                value: 15,
            });
        }
    }

    // 2. 不走站外换乘被卡住 → 建议关闭
    if (currentCfg.avoidOutOfStation &&
        reasons.includes('站外换乘')) {
        suggestions.push({
            action: 'allow-outdoor',
            label: '允许站外换乘（琶洲、五羊邨）',
            value: '',
        });
    }

    // 3. 末班车已收 → 建议提前出发
    const lastTrainReason = uniqueReasons.find(x =>
        x.includes('已无运营') || x.includes('已停运') || x.includes('末班车')
    );
    if (lastTrainReason) {
        const targetMin = getRouteDepartMin();
        if (_routeArriveMode) {
            // 反向模式：希望更晚到达才能赶上末班车 → 目标到达时刻 +30
            const later = targetMin + 30;
            if (later <= 26 * 60) {
                suggestions.push({
                    action: 'later-arrive',
                    label: `目标到达延后 30 分钟（${fmtHM(later)}）`,
                    value: 30,
                });
            }
        } else {
            // 正向模式：更早出发
            const earlier = targetMin - 30;
            if (earlier >= 5 * 60) {
                suggestions.push({
                    action: 'earlier-depart',
                    label: `提前 30 分钟出发（${fmtHM(earlier)}）`,
                    value: 30,
                });
            }
        }
    }

    return suggestions;
}

function applyRouteSuggestion(action, value) {
    if (!_routeOverlay) return;

    if (action === 'disable-max-transfer') {
        const mtc = _routeOverlay.querySelector('#route-max-transfer-check');
        if (mtc) { mtc.checked = false; mtc.dispatchEvent(new Event('change')); }

    } else if (action === 'set-max-transfer') {
        const mtc = _routeOverlay.querySelector('#route-max-transfer-check');
        const mti = _routeOverlay.querySelector('#route-max-transfer-min');
        if (mtc && mti) {
            mtc.checked = true;
            mtc.dispatchEvent(new Event('change'));
            mti.value = String(value);
        }

    } else if (action === 'allow-outdoor') {
        const aoc = _routeOverlay.querySelector('#route-avoid-outdoor-check');
        if (aoc) aoc.checked = false;

    } else if (action === 'earlier-depart') {
        const delta = parseInt(value, 10) || 30;
        _routeDepartMin = getRouteDepartMin() - delta;
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());

    } else if (action === 'later-arrive') {
        const delta = parseInt(value, 10) || 30;
        _routeDepartMin = getRouteDepartMin() + delta;
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
    }

    // 自动重算
    setTimeout(() => runRoutePlanning(), 80);
}

/* ==========================================
   反向规划：给定目标到达时刻，二分查找最晚出发时刻
   ========================================== */
async function findLatestDepartureForArrival(start, end, targetArriveMin,
                                             sortMode, maxTransferMin, avoidOutOfStation) {
    const STEP = 5;   // 5 分钟粒度
    // 最早不早于 5:00，最多往前找 4 小时
    const EARLIEST = Math.max(5 * 60, targetArriveMin - 4 * 60);

    const loIdx = Math.floor(EARLIEST   / STEP);
    const hiIdx = Math.floor(targetArriveMin / STEP);

    let bestIdx = -1;
    let L = loIdx, R = hiIdx;

    while (L <= R) {
        const midIdx = Math.floor((L + R) / 2);
        const t = midIdx * STEP;

        const r = await planRoutes(start, end, t, sortMode,
            maxTransferMin, avoidOutOfStation);
        const ok = r.results && r.results.length > 0
            && r.results.some(item => Math.round(item.arriveMin) <= targetArriveMin);

        if (ok) {
            bestIdx = midIdx;
            L = midIdx + 1;
        } else {
            R = midIdx - 1;
        }
    }

    return bestIdx >= 0 ? bestIdx * STEP : null;
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

    // 反向规划：把用户填的时刻当作"期望到达时刻"，先算出最晚出发时刻
    _routeLastArrivedAt = null;

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

    // 读取步行速度
    let walkSpeed = 1.5;
    const wssEl = _routeOverlay.querySelector('#route-walk-speed');
    if (wssEl) {
        const v = parseFloat(wssEl.value);
        if (!isNaN(v) && v > 0) walkSpeed = v;
    }

    // ★ 应用到 ROUTE_GRAPH
    if (typeof ROUTE_GRAPH !== 'undefined' && ROUTE_GRAPH.loaded) {
        ROUTE_GRAPH.userWalkSpeed = walkSpeed;
    }

    const advWrapEl = _routeOverlay.querySelector('#route-advanced');
    saveRoutePrefs({
        sortMode,
        maxTransferChecked: !!(mtc && mtc.checked),
        maxTransferMin: (mtc && mtc.checked && mti)
            ? (parseInt(mti.value, 10) || 0)
            : 5,
        avoidOutOfStation,
        walkSpeed,
        arriveMode: _routeArriveMode,
        advancedOpen: !!(advWrapEl && advWrapEl.classList.contains('open')),
    });

    // ★ 把起终点推进历史
    pushRouteHistory('start', start);
    pushRouteHistory('end', end);

    // 进入 loading 状态：用 class，不动 textContent
    goBtn.disabled = true;
    goBtn.classList.add('loading');
    resultsEl.classList.add('is-loading');
    setRouteMeta('正在计算路径…');

    await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

    try {
        // ★ 反向规划：先算出最晚出发时刻
        let actualDepartMin = departMin;
        if (_routeArriveMode) {
            const targetArriveMin = departMin;
            const found = await findLatestDepartureForArrival(
                start, end, targetArriveMin, sortMode,
                maxTransferMin, avoidOutOfStation
            );

            if (found == null) {
                const earliest = Math.max(5 * 60, targetArriveMin - 4 * 60);
                let html = `<div class="route-empty">`;
                html += `<div class="route-empty-title">当前时刻没有可用的路径</div>`;
                html += `<div class="route-empty-detail">`;
                html += `无法在 ${fmtHM(earliest)} ~ ${fmtHM(targetArriveMin)} 之间找到`;
                html += `能于 ${fmtHM(targetArriveMin)} 前到达的路径`;
                html += `</div>`;

                // ★ 反向失败时唯一能做的就是让目标到达时间更晚
                const suggestions = [];
                const later30 = targetArriveMin + 30;
                const later60 = targetArriveMin + 60;
                const LIMIT   = 26 * 60;   // 次日 02:00 上限

                if (later30 <= LIMIT) {
                    suggestions.push({
                        action: 'later-arrive',
                        label: `目标到达延后 30 分钟（${fmtHM(later30)}）`,
                        value: 30,
                    });
                }
                if (later60 <= LIMIT) {
                    suggestions.push({
                        action: 'later-arrive',
                        label: `目标到达延后 1 小时（${fmtHM(later60)}）`,
                        value: 60,
                    });
                }

                if (suggestions.length > 0) {
                    html += `<div class="route-empty-suggest">💡 试试这些调整</div>`;
                    html += `<div class="route-suggest-actions">`;
                    html += suggestions.map(s =>
                        `<button type="button" class="route-suggest-btn"
                                 data-action="${s.action}"
                                 data-value="${escapeHtml(String(s.value ?? ''))}">
                            ${escapeHtml(s.label)}
                        </button>`
                    ).join('');
                    html += `</div>`;
                }
                html += `</div>`;

                hideAllRouteLegends();
                resultsEl.innerHTML = html;

                resultsEl.querySelectorAll('.route-suggest-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        applyRouteSuggestion(btn.dataset.action, btn.dataset.value);
                    });
                });
                return;
            }

            actualDepartMin = found;
            _routeLastArrivedAt = found;
        }

        _routeActiveDepartMin = actualDepartMin;

        const r = await planRoutes(start, end, actualDepartMin, sortMode,
            maxTransferMin, avoidOutOfStation);

        if (r.error) {
            resultsEl.innerHTML = `<div class="route-error">${escapeHtml(r.error)}</div>`;
            hideAllRouteLegends();
            return;
        }
        if (r.results.length === 0) {
            let html = `<div class="route-empty">`;
            html += `<div class="route-empty-title">当前时刻没有可用的路径</div>`;

            // ★ 生成可操作的引导
            const suggestions = buildRouteSuggestions(r, {
                maxTransferMin, avoidOutOfStation, sortMode,
            });
            if (suggestions.length > 0) {
                html += `<div class="route-empty-suggest">💡 试试这些调整</div>`;
                html += `<div class="route-suggest-actions">`;
                html += suggestions.map(s =>
                    `<button type="button" class="route-suggest-btn"
                             data-action="${s.action}"
                             data-value="${escapeHtml(String(s.value ?? ''))}">
                        ${escapeHtml(s.label)}
                    </button>`
                ).join('');
                html += `</div>`;
            }
            html += `</div>`;
            hideAllRouteLegends();
            resultsEl.innerHTML = html;

            // ★ 绑定建议按钮
            resultsEl.querySelectorAll('.route-suggest-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyRouteSuggestion(btn.dataset.action, btn.dataset.value);
                });
            });
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

        // ★ 反向规划模式：顶部加一条"建议出发"提示
        let headlineHtml = '';
        if (_routeArriveMode && _routeLastArrivedAt != null) {
            headlineHtml = `<div class="route-arrive-headline">
                ✅ 最晚 <b>${fmtHM(_routeLastArrivedAt)}</b> 抵达站台候车，
                可于 <b>${fmtHM(departMin)}</b> 前到达
            </div>`;
        }

        resultsEl.innerHTML = headlineHtml + r.results.map((item, idx) =>
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
        _routeActiveDepartMin = null;    // ★ 清理
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

    // ★ 优先用"当前规划所用出发时刻"，回退到 getRouteDepartMin
    let currentMin = _routeActiveDepartMin;
    if (currentMin == null) {
        currentMin = (typeof getRouteDepartMin === 'function')
            ? getRouteDepartMin() : null;
    }
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
 * 11 号线是环线，原始方向字段只有「外环」「内环」。
 * 根据当前时刻判断：
 *   - 全程车还在运营 → 保持「往外环」/「往内环」
 *   - 全程已收、区间车还在 → 显示区间终点「往龙潭」/「往赤沙」
 *   - 都停了 → 保持原始方向（让上层过滤逻辑处理）
 */
function get11LineDirectionFromPath(path, startStation) {
    // 1. 读原始方向字段
    let rawDir = null;
    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length >= 4
            && parts[0] === '11号线'
            && parts[1] === startStation
            && parts[3] === '站台') {
            rawDir = parts[2];   // "外环方向" 或 "内环方向"
            break;
        }
    }
    if (!rawDir) return null;

    // 2. 拿该站该方向的运营数据
    const data = (typeof lineDirectionTime !== 'undefined')
        ? lineDirectionTime['11号线']?.[startStation] : null;
    if (!data) return rawDir;

    // 3. 取当前规划出发时刻
    let currentMin = (typeof _routeActiveDepartMin !== 'undefined' && _routeActiveDepartMin != null)
        ? _routeActiveDepartMin
        : (typeof getRouteDepartMin === 'function' ? getRouteDepartMin() : null);
    if (currentMin == null) return rawDir;

    const isOuter = rawDir.includes('外环');
    const isInner = rawDir.includes('内环');
    if (!isOuter && !isInner) return rawDir;

    const full        = isOuter ? data.upFull     : data.downFull;
    const terminal    = isOuter ? data.upTerminal : data.downTerminal;
    const terminalEnd = isOuter ? '龙潭' : '赤沙';

    const fullActive = !!(full &&
        currentMin >= full.first && currentMin <= full.last);
    const terminalActive = !!(terminal &&
        currentMin >= terminal.first && currentMin <= terminal.last);

    if (fullActive) {
        return rawDir;                       // 全程车还在 → 往外环 / 往内环
    }
    if (terminalActive) {
        return terminalEnd + '方向';         // 只剩区间车 → 往龙潭 / 往赤沙
    }
    return rawDir;                           // 都停了 → 保持原始方向
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
                ${guideHtml}
                ${buildStationListHtml(startName, endName, item.stationRoute)}
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