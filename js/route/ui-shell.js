// ========== 路径规划 UI · 弹窗壳与时间选择器 ==========

let _routeTooltipTimer = null;

function showRouteTooltip(targetEl, text) {
    let tooltip = document.getElementById('route-tooltip');
    if (tooltip) tooltip.remove(); // 移除旧的

    tooltip = document.createElement('div');
    tooltip.id = 'route-tooltip';
    tooltip.className = 'route-tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    // 计算位置（在按钮正上方留出 8px 间距）
    const rect = targetEl.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = (rect.top - 8) + 'px';

    // 初始状态（稍微靠下一点，用于实现上浮动画）
    tooltip.style.transform = 'translate(-50%, -100%) translateY(4px)';

    // 下一帧触发动画显示
    requestAnimationFrame(() => {
        tooltip.classList.add('show');
    });

    // 3秒后自动消失
    if (_routeTooltipTimer) clearTimeout(_routeTooltipTimer);
    _routeTooltipTimer = setTimeout(() => {
        tooltip.classList.remove('show');
        // 等过渡动画结束再移除 DOM
        setTimeout(() => tooltip.remove(), 200);
    }, 3000);
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
                            <div class="route-autocomplete" style="position: relative; display: flex; align-items: center; flex: 1; min-width: 0;">
                                <input id="route-start" class="route-input"
                                       placeholder="出发站" autocomplete="off">
                                <button type="button" class="route-locate-btn" id="route-start-locate" title="定位当前起点" style="position: absolute; right: 4px;">
                                    <svg class="locate-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    <span class="locate-spinner" style="display: none;"></span>
                                </button>
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
                    <!-- 高级设置内容面板（移除了原来的触发按钮） -->
                    <div class="route-advanced" id="route-advanced">
                        <div class="route-advanced-body">
                            <div class="route-advanced-inner">
                                <!-- ▼ 原来的 route-sort-row 和 route-extra-options 内容保持完全不变，放在这里 ▼ -->

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
                                               maxlength="2" value="3" disabled>
                                        <span>分钟</span>
                                    </label>
                                    <div class="route-extra-row">
                                        <label class="route-extra-option" id="route-avoid-ctrl-label">
                                            <span class="route-switch">
                                                <input type="checkbox" id="route-avoid-ctrl-check">
                                                <span class="route-switch-track"><span class="route-switch-thumb"></span></span>
                                            </span>
                                            <span class="route-extra-option-label">
                                                <span class="route-extra-option-title">尽量不走客控中的换乘站</span>
                                                <span class="route-extra-option-sub">优先展示避开客控站的路线</span>
                                            </span>
                                        </label>
                                        <span class="route-extra-reason" id="route-avoid-ctrl-reason"></span>
                                    </div>
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
<div class="route-extra-speed-group">
    <span class="route-extra-speed-label">步行速度</span>
    <div class="route-speed-options-wrap">
        <label class="route-sort-option route-speed-option">
            <input type="radio" name="route-walk-speed" value="1.2">
            <span class="route-sort-label">悠闲</span>
            <span class="route-sort-hint">1.2 m/s</span>
        </label>
        <label class="route-sort-option route-speed-option">
            <input type="radio" name="route-walk-speed" value="1.5" checked>
            <span class="route-sort-label">中等</span>
            <span class="route-sort-hint">1.5 m/s</span>
        </label>
        <label class="route-sort-option route-speed-option">
            <input type="radio" name="route-walk-speed" value="1.8">
            <span class="route-sort-label">快走</span>
            <span class="route-sort-hint">1.8 m/s</span>
        </label>
    </div>
</div>
                                </div>
                                <!-- ▲ 原有内容结束 ▲ -->
                            </div>
                        </div>
                    </div>
                    
                                       <!-- ★ 底部操作栏：规划 + 齿轮 -->
                    <div class="route-footer-actions">
                        <button id="route-go" class="route-go" type="button">
                            <span class="route-go-text">规划</span>
                            <span class="route-go-spinner" aria-hidden="true"></span>
                        </button>
                        <button type="button" class="route-advanced-toggle" id="route-advanced-toggle" aria-expanded="false" title="高级设置">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="route-meta" id="route-meta" style="display:none">正在加载线路图…</div>
                <div class="route-startend-warning" id="route-startend-warning" style="display:none"></div>
                <div class="route-legend" id="route-legend" style="display:none">
                    <!-- 20分钟图例：倒三角 -->
                    <div class="route-legend-row" id="route-legend-row-20">
                        <div class="route-legend-icon-wrap">
                            <svg class="route-legend-triangle" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2 2 L22 2 L12 22 Z" fill="#f59e0b" stroke="#1f2b3c" stroke-width="1.8" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span>到达该线路时，末班车<u>小于 20 分钟</u></span>
                    </div>
                    <!-- 10分钟图例：黄、橘、红三色示例 -->
                    <div class="route-legend-row" id="route-legend-row-10">
                        <div class="route-legend-icon-wrap route-legend-colors">
                            <!-- 黄色示例 (8分) -->
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" fill="rgb(255, 221, 0)"/>
                                <line x1="12" y1="7" x2="12" y2="13" stroke="#1f2b3c" stroke-width="2.5" stroke-linecap="round"/>
                                <circle cx="12" cy="17" r="1.5" fill="#1f2b3c"/>
                            </svg>
                            <!-- 橘色示例 (5分) -->
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" fill="rgb(255, 110, 0)"/>
                                <line x1="12" y1="7" x2="12" y2="13" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                                <circle cx="12" cy="17" r="1.5" fill="#ffffff"/>
                            </svg>
                            <!-- 红色示例 (1分) -->
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" fill="#dc2626"/>
                                <line x1="12" y1="7" x2="12" y2="13" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                                <circle cx="12" cy="17" r="1.5" fill="#ffffff"/>
                            </svg>
                        </div>
                        <span>到达该线路时，末班车<u>小于 10 分钟</u>，请慎重选择</span>
                    </div>
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

    const hPanel = ov.querySelector('#route-hour-panel');
    const mPanel = ov.querySelector('#route-minute-panel');
    if (hPanel) {
        hPanel.style.display = 'none';
        document.body.appendChild(hPanel);
    }
    if (mPanel) {
        mPanel.style.display = 'none';
        document.body.appendChild(mPanel);
    }

    initRouteTimePickers(ov);

    // 高级设置折叠
    const advWrap = ov.querySelector('#route-advanced');
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
            updateCtrlOptionStatus();
        });
    }

    // ★ 新增：起点定位按钮逻辑
    const startLocateBtn = ov.querySelector('#route-start-locate');
    if (startLocateBtn) {
        if (typeof IS_TOY_ENV !== 'undefined' && IS_TOY_ENV) {
            startLocateBtn.style.display = 'none';
        } else {
            startLocateBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 防止触发弹窗外部的点击隐藏
                if (startLocateBtn.classList.contains('loading')) return;

                // 进入加载状态
                startLocateBtn.classList.add('loading');
                const icon = startLocateBtn.querySelector('.locate-icon');
                const spinner = startLocateBtn.querySelector('.locate-spinner');
                if (icon) icon.style.display = 'none';
                if (spinner) spinner.style.display = 'block';

                try {
                    // 调用我们马上要写的定位获取函数
                    const nearest = await getNearestStationForRoute();
                    if (nearest) {
                        const startInput = ov.querySelector('#route-start');
                        startInput.value = nearest;
                        // 清除错误红框
                        const field = startInput.closest('.route-field');
                        if (field) field.classList.remove('input-error');
                        // 触发一次 input 事件，让系统知道内容变了
                        startInput.dispatchEvent(new Event('input'));
                        // 收起软键盘
                        if (_isIOSDevice) startInput.blur();
                    }
                } catch (err) {
                    showRouteTooltip(startLocateBtn, err.message || err);
                } finally {
                    // 恢复按钮状态
                    startLocateBtn.classList.remove('loading');
                    if (icon) icon.style.display = 'block';
                    if (spinner) spinner.style.display = 'none';
                }
            });

            const startInput = ov.querySelector('#route-start');
            if (startInput && !(typeof IS_TOY_ENV !== 'undefined' && IS_TOY_ENV)) {
                const updateLocateBtnDisplay = () => {
                    startLocateBtn.style.display = startInput.value.trim() === '' ? 'flex' : 'none';
                };
                startInput.addEventListener('input', updateLocateBtnDisplay);
                updateLocateBtnDisplay();
            }
        }
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
    const walkSpeedRadios = ov.querySelectorAll('input[name="route-walk-speed"]');
    walkSpeedRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const v = parseFloat(e.target.value);
                if (typeof ROUTE_GRAPH !== 'undefined' && ROUTE_GRAPH.loaded && !isNaN(v)) {
                    ROUTE_GRAPH.userWalkSpeed = v;
                }
            }
        });
    });

    // 交换起终点
    ov.querySelector('#route-swap').addEventListener('click', () => {
        const startInput = ov.querySelector('#route-start');
        const endInput = ov.querySelector('#route-end');
        const stops = ov.querySelector('.route-stops');
        const btn = ov.querySelector('#route-swap');
        if (!startInput || !endInput || !stops) return;

        if (stops.classList.contains('swap-out') ||
            stops.classList.contains('swap-in')) return;

        btn.classList.toggle('spinning');
        stops.classList.add('swap-out');

        setTimeout(() => {
            const tmp = startInput.value;
            startInput.value = endInput.value;
            endInput.value = tmp;

            startInput.dispatchEvent(new Event('input'));

            const s1 = document.getElementById('route-start-suggestions');
            const s2 = document.getElementById('route-end-suggestions');
            if (s1) {
                s1.style.display = 'none';
                s1.innerHTML = '';
            }
            if (s2) {
                s2.style.display = 'none';
                s2.innerHTML = '';
            }

            // 交换后清除错误高亮
            ov.querySelectorAll('.route-field.input-error')
                .forEach(f => f.classList.remove('input-error'));

            stops.classList.remove('swap-out');
            stops.classList.add('swap-in');
            setTimeout(() => {
                stops.classList.remove('swap-in');
            }, 240);
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

    // 排序方式切换 → 同步更新底部 meta 文案，并自动执行规划
    ov.querySelectorAll('input[name="route-sort"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                setRouteMeta(routeMetaText());
                // ★ 新增：只要起点和终点有内容，就自动触发一次规划
                const startVal = ov.querySelector('#route-start').value.trim();
                const endVal = ov.querySelector('#route-end').value.trim();
                if (startVal && endVal && typeof runRoutePlanning === 'function') {
                    runRoutePlanning();
                }
            }
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
            const hPanel = document.getElementById('route-hour-panel');
            const mPanel = document.getElementById('route-minute-panel');
            const hTrigger = _routeOverlay.querySelector('#route-hour-trigger');
            const mTrigger = _routeOverlay.querySelector('#route-minute-trigger');

            if (hPanel && !hPanel.contains(e.target) && !hTrigger.contains(e.target)) {
                hPanel.style.display = 'none';
            }
            if (mPanel && !mPanel.contains(e.target) && !mTrigger.contains(e.target)) {
                mPanel.style.display = 'none';
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
    updateCtrlOptionStatus();
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
    const hourPanel = document.getElementById('route-hour-panel') || ov.querySelector('#route-hour-panel');
    const minutePanel = document.getElementById('route-minute-panel') || ov.querySelector('#route-minute-panel');

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
            updateSortOptionStatus();
            updateCtrlOptionStatus();
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
            updateSortOptionStatus();
            updateCtrlOptionStatus();
        });
    });

    // 3. 点击“现在”
    ov.querySelector('#route-now').addEventListener('click', () => {
        _routeDepartMin = null;
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
        updateSortOptionStatus();
        updateCtrlOptionStatus();
        hourPanel.style.display = 'none';
        minutePanel.style.display = 'none';
    });

    hourTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        minutePanel.style.display = 'none';
        const isHidden = hourPanel.style.display === 'none' || !hourPanel.style.display;
        if (isHidden) {
            hourPanel.style.display = 'grid'; // 先显示
            positionTimePanel(hourPanel, hourTrigger); // 再定位
        } else {
            hourPanel.style.display = 'none';
        }
        this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    minuteTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        hourPanel.style.display = 'none';
        const isHidden = minutePanel.style.display === 'none' || !minutePanel.style.display;
        if (isHidden) {
            minutePanel.style.display = 'grid';
            positionTimePanel(minutePanel, minuteTrigger);
        } else {
            minutePanel.style.display = 'none';
        }
        this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
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
    const vh = window.innerHeight;
    const pw = panel.classList.contains('rows-3') ? 380 : 330;

    let left = rect.left;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;

    panel.style.position = 'fixed';
    panel.style.left = left + 'px';
    panel.style.right = 'auto';
    panel.style.width = pw + 'px';

    // ★ 强行先显示，才能获取到真实高度
    panel.style.display = 'grid';
    const ph = panel.offsetHeight;

    // ★ 如果下方空间不足以容纳面板高度（留 20px 的安全边距），则改为向上弹出
    if (rect.bottom + 6 + ph > vh - 20) {
        panel.style.top = 'auto';
        panel.style.bottom = (vh - rect.top + 6) + 'px';
    } else {
        panel.style.bottom = 'auto';
        panel.style.top = (rect.bottom + 6) + 'px';
    }
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
    // ★ 关闭移出的面板
    const hPanel = document.getElementById('route-hour-panel');
    const mPanel = document.getElementById('route-minute-panel');
    if (hPanel) hPanel.style.display = 'none';
    if (mPanel) mPanel.style.display = 'none';

    unlockBodyScroll();
}

function routeMetaText(showFewerDetail = false) {
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
    // ★ 修改此处：仅当传入 showFewerDetail = true 时才显示副标题，并更新文案
    if (sortMode === 'fewer-transfers' && showFewerDetail) {
        return line1
            + `<br><span class="route-meta-sub">最多显示 5 个比「最快优先」首位慢 30 分钟以内的结果</span>`;
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

/** 根据时间距离，动态更新“不走客控”选项的状态 */
function updateCtrlOptionStatus() {
    if (!_routeOverlay) return;

    const ctrlCheck = _routeOverlay.querySelector('#route-avoid-ctrl-check');
    const label = _routeOverlay.querySelector('#route-avoid-ctrl-label');
    const reasonEl = _routeOverlay.querySelector('#route-avoid-ctrl-reason');

    if (!ctrlCheck || !label || !reasonEl) return;

    const isFar = isTimeFarFromNow();

    if (isFar) {
        ctrlCheck.disabled = true;
        ctrlCheck.checked = false;
        label.classList.add('is-disabled');

        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const startMin = nowMin;
        // 到达模式 3小时，出发模式 2小时
        const limitMinutes = _routeArriveMode ? 180 : 120;
        const endMin = nowMin + limitMinutes;

        const fmt = (min) => {
            const m = ((min % 1440) + 1440) % 1440;
            return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
        };

        const rangeStr = `${fmt(startMin)} ~ ${fmt(endMin)}`;

        reasonEl.textContent = `仅 ${rangeStr} 可用`;
        reasonEl.classList.add('show');
    } else {
        ctrlCheck.disabled = false;
        label.classList.remove('is-disabled');
        reasonEl.textContent = '';
        reasonEl.classList.remove('show');
    }
}

/** 获取距离当前定位最近的（可用于规划的）地铁站 */
function getNearestStationForRoute() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject('您的浏览器不支持定位功能');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const {latitude, longitude} = pos.coords;
                // 转换为 GCJ02 坐标系（高德/腾讯坐标系）
                const [gcjLat, gcjLng] = wgs84ToGcj02(latitude, longitude);

                let minDist = Infinity;
                let nearestName = '';

                if (typeof STATION_COORDS === 'undefined' || !STATION_COORDS) {
                    reject('站点坐标未加载');
                    return;
                }

                for (const [name, coord] of Object.entries(STATION_COORDS)) {
                    // 排除不支持路径规划的站（如有轨电车等）
                    const lines = STATION_INDEX[name] || [];
                    if (typeof isRouteEligibleStation === 'function' && !isRouteEligibleStation(name, lines)) {
                        continue;
                    }

                    const [sLng, sLat] = coord;
                    const dist = haversineDistance(gcjLat, gcjLng, sLat, sLng);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestName = name;
                    }
                }

                if (nearestName) resolve(nearestName);
                else reject('附近没有合适的地铁站');
            },
            (err) => {
                let msg = '定位失败';
                if (err.code === 1) {
                    if (err.message && err.message.includes('permissions policy')) {
                        msg = '当前平台禁止获取位置权限，请直接在输入框手动输入起点站名。';
                    } else if (!window.isSecureContext) {
                        msg = '当前环境非 HTTPS 或 localhost，浏览器禁止定位';
                    } else {
                        msg = '定位权限被拒绝';
                    }
                } else if (err.code === 2) {
                    msg = '无法获取位置信息';
                } else if (err.code === 3) {
                    msg = '定位超时';
                }
                reject(msg);
            },
            {enableHighAccuracy: true, timeout: 10000, maximumAge: 0}
        );
    });
}