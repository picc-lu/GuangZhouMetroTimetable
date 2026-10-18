// ========== 路径规划 UI · 弹窗壳与时间选择器 ==========

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
                                        <input type="radio" name="route-sort" value="fewer-transfers">
                                        <span class="route-sort-label">换乘少优先</span>
                                        <span class="route-sort-hint">减少换乘次数</span>
                                    </label>
                                    <label class="route-sort-option">
                                        <input type="radio" name="route-sort" value="conservative">
                                        <span class="route-sort-label">保守优先</span>
                                        <span class="route-sort-hint">末班车时间充裕</span>
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
                <div class="route-meta" id="route-meta" style="display:none">正在加载线路图…</div>
                <div class="route-startend-warning" id="route-startend-warning" style="display:none"></div>
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
                    <span>此标志表示到达该线路时，距离末班车小于 15 分钟，请慎重选择</span>
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
                <div class="route-results" id="route-results" style="display:none">
                    <div class="route-empty">填写起点和终点，点击「规划」查看前 ${PLAN_TARGET} 条推荐路径</div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
    _routeOverlay = ov;

    // ★ 把建议列表挂到 body 下，避免被 .route-overlay 的 backdrop-filter
    //   和 .route-container 的 transform 建立 containing block，导致 fixed 定位错乱
    document.body.appendChild(ov.querySelector('#route-start-suggestions'));
    document.body.appendChild(ov.querySelector('#route-end-suggestions'));

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
            // ★ 滑块动画：切换容器上的 mode-arrive 类
            timeModeWrap.classList.toggle('mode-arrive', _routeArriveMode);
            // 到达模式：隐藏"现在"按钮
            const nowBtn = ov.querySelector('#route-now');
            if (nowBtn) nowBtn.style.display = _routeArriveMode ? 'none' : '';
            setRouteMeta(routeMetaText());
            updateSortOptionStatus();
        });
    }

    setupRouteAutocomplete(
        ov.querySelector('#route-start'),
        document.getElementById('route-start-suggestions')
    );
    setupRouteAutocomplete(
        ov.querySelector('#route-end'),
        document.getElementById('route-end-suggestions')
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

    // 交换起终点
    ov.querySelector('#route-swap').addEventListener('click', () => {
        const startInput = ov.querySelector('#route-start');
        const endInput   = ov.querySelector('#route-end');
        const stops      = ov.querySelector('.route-stops');
        const btn        = ov.querySelector('#route-swap');
        if (!startInput || !endInput || !stops) return;

        if (stops.classList.contains('swap-out') ||
            stops.classList.contains('swap-in')) return;

        btn.classList.toggle('spinning');
        stops.classList.add('swap-out');

        setTimeout(() => {
            const tmp = startInput.value;
            startInput.value = endInput.value;
            endInput.value = tmp;

            const s1 = document.getElementById('route-start-suggestions');
            const s2 = document.getElementById('route-end-suggestions');
            if (s1) { s1.style.display = 'none'; s1.innerHTML = ''; }
            if (s2) { s2.style.display = 'none'; s2.innerHTML = ''; }

            // 交换后清除错误高亮
            ov.querySelectorAll('.route-field.input-error')
              .forEach(f => f.classList.remove('input-error'));

            stops.classList.remove('swap-out');
            stops.classList.add('swap-in');
            setTimeout(() => { stops.classList.remove('swap-in'); }, 240);
        }, 220);
    });

    // 最大换乘时长复选框
    const maxTransferCheck = ov.querySelector('#route-max-transfer-check');
    const maxTransferInput = ov.querySelector('#route-max-transfer-min');
    if (maxTransferCheck && maxTransferInput) {
        maxTransferCheck.addEventListener('change', () => {
            maxTransferInput.disabled = !maxTransferCheck.checked;
        });
        maxTransferInput.addEventListener('input', () => {
            let v = maxTransferInput.value.replace(/\D/g, '');
            if (v === '') { maxTransferInput.value = ''; return; }
            let n = parseInt(v, 10);
            if (isNaN(n) || n < 0) n = 0;
            if (n > 60) n = 60;
            maxTransferInput.value = String(n);
        });
        maxTransferInput.addEventListener('blur', () => {
            if (maxTransferInput.value === '') maxTransferInput.value = '5';
        });
    }

    // 排序方式切换 → 同步更新底部 meta 文案
    ov.querySelectorAll('input[name="route-sort"]').forEach(radio => {
        radio.addEventListener('change', () => {
            setRouteMeta(routeMetaText());
        });
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

    // 输入时清除错误红框
    ['#route-start', '#route-end'].forEach(sel => {
        const el = ov.querySelector(sel);
        if (!el) return;
        el.addEventListener('input', () => {
            if (el.value.trim()) {
                const field = el.closest('.route-field');
                if (field) field.classList.remove('input-error');
            }
        });
    });

    applyRoutePrefs(ov);
    updateSortOptionStatus();
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

    hourPanel.classList.add('rows-3');
    minutePanel.classList.add('rows-2');

    hourPanel.innerHTML = ROUTE_HOURS.map(h =>
        `<div class="route-time-cell" data-hour="${h}">${String(h).padStart(2, '0')}</div>`
    ).join('');

    minutePanel.innerHTML = ROUTE_MINUTES.map(m =>
        `<div class="route-time-cell" data-minute="${m}">${String(m).padStart(2, '0')}</div>`
    ).join('');

    // 1. 选择小时
    hourPanel.querySelectorAll('.route-time-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const h = parseInt(cell.dataset.hour, 10);
            const curMin = parseInt(minuteTrigger.textContent, 10);
            _routeDepartMin = h * 60 + curMin;
            hourTrigger.textContent = String(h).padStart(2, '0');
            hourPanel.style.display = 'none';
            setRouteMeta(routeMetaText());
            updateSortOptionStatus(); // 👈 新增
        });
    });

    // 2. 选择分钟
    minutePanel.querySelectorAll('.route-time-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const m = parseInt(cell.dataset.minute, 10);
            const curHour = parseInt(hourTrigger.textContent, 10);
            _routeDepartMin = curHour * 60 + m;
            minuteTrigger.textContent = String(m).padStart(2, '0');
            minutePanel.style.display = 'none';
            setRouteMeta(routeMetaText());
            updateSortOptionStatus(); // 👈 新增
        });
    });

    // 3. 点击“现在”
    ov.querySelector('#route-now').addEventListener('click', () => {
        _routeDepartMin = null;
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
        updateSortOptionStatus(); // 👈 新增
        hourPanel.style.display = 'none';
        minutePanel.style.display = 'none';
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

function getRouteDepartMin() {
    let min;
    if (_routeDepartMin !== null) {
        min = _routeDepartMin;
    } else {
        const d = new Date();
        min = d.getHours() * 60 + d.getMinutes();
    }
    // 0:00~1:59 归入次日凌晨（+1440）
    if (min < 120) min += 1440;
    return min;
}

/* ==========================================
   弹窗打开 / 关闭 / 元信息
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
    document.querySelectorAll('.route-suggestions').forEach(el => {
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

    const sortRadio = _routeOverlay
        ? _routeOverlay.querySelector('input[name="route-sort"]:checked')
        : null;
    const sortMode = sortRadio ? sortRadio.value : 'fastest';

    if (_routeArriveMode) {
        return `目标到达 ${fmtHM(min)}（${mode}） · 仅显示 3 个结果`;
    }

    const line1 = `出发时刻 ${fmtHM(min)}（${mode}）`;
    if (sortMode === 'fewer-transfers') {
        return line1
            + `<br><span class="route-meta-sub">最多显示 5 个结果，仅显示比「最快优先」首位慢 30 分钟以内的结果</span>`;
    }
    return line1;
}

function setRouteMeta(html) {
    const el = _routeOverlay && _routeOverlay.querySelector('#route-meta');
    if (el) el.innerHTML = html;
}

/** 隐藏所有图例（5 分钟紧急 + 3 号线跨段） */
function hideAllRouteLegends() {
    if (!_routeOverlay) return;
    const l1 = _routeOverlay.querySelector('#route-legend');
    const l2 = _routeOverlay.querySelector('#route-legend-3line');
    if (l1) l1.style.display = 'none';
    if (l2) l2.style.display = 'none';
}

/** 根据当前设置的时间，动态更新排序选项的禁用状态 */
function updateSortOptionStatus() {
    if (!_routeOverlay) return;

    // 获取当前选定的时间（出发模式为出发时间，到达模式为目标到达时间）
    const timeMin = getRouteDepartMin();

    // 判断是否在 05:00 (300) ~ 21:00 (1260) 之间
    const isDaytime = (timeMin >= 5 * 60 && timeMin < 21 * 60);

    const consInput = _routeOverlay.querySelector('input[name="route-sort"][value="conservative"]');
    if (!consInput) return;
    const consLabel = consInput.closest('.route-sort-option');

    if (isDaytime) {
        // 白天：禁用
        consInput.disabled = true;
        consLabel.classList.add('is-disabled');

        // 如果此时选中的正好是“保守优先”，自动切回“最快优先”
        if (consInput.checked) {
            const fastestRadio = _routeOverlay.querySelector('input[name="route-sort"][value="fastest"]');
            if (fastestRadio) {
                fastestRadio.checked = true;
                setRouteMeta(routeMetaText()); // 刷新底部提示文字
            }
        }
    } else {
        // 夜间：恢复
        consInput.disabled = false;
        consLabel.classList.remove('is-disabled');
    }
}