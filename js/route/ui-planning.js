// ========== 路径规划 UI · 规划流程与空结果建议 ==========

// ========== 检测未收录站点 ==========
let _outdatedStationsCache = null; // 缓存结果

function getOutdatedStations() {
    if (_outdatedStationsCache !== null) return _outdatedStationsCache;
    if (typeof ROUTE_GRAPH === 'undefined' || !ROUTE_GRAPH.loaded) return [];
    if (typeof LINE_STATIONS === 'undefined') return [];

    const result = [];
    for (const [line, stations] of Object.entries(LINE_STATIONS)) {
        // 排除 APM 和有轨电车
        if (line.includes('APM') || line.includes('有轨')) continue;

        for (const st of stations) {
            if (!st || st === '开始' || st === '结束') continue;

            // 如果本地图里查不到这个站
            if (!resolveGraphStationNode(st, 'start')) {
                result.push({ line, station: st });
            }
        }
    }
    _outdatedStationsCache = result;
    return result;
}

// ========== 辅助检测函数 ==========
/** 检查该站是否存在于官方实时数据中 */
function isStationInOfficialData(stationName) {
    if (!stationName) return false;
    for (const arr of Object.values(LINE_STATIONS)) {
        if (arr.includes(stationName)) return true;
    }
    return false;
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
        // ★ 动态计算：当前设置 + 1 分钟，最大不超过 60 分钟
        if (currentCfg.maxTransferMin < 60) {
            const nextLimit = currentCfg.maxTransferMin + 1;
            suggestions.push({
                action: 'set-max-transfer',
                label: `放宽到 ${nextLimit} 分钟`,
                value: nextLimit,
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

    // 3. 首末班车问题 → 建议调整时间
    const lastTrainReason = uniqueReasons.find(x =>
        x.includes('已无运营') || x.includes('已停运') || x.includes('末班车')
    );
    if (lastTrainReason) {
        const targetMin = getRouteDepartMin();

        if (_routeArriveMode) {
            // 到达模式：目标到达太晚，建议延后
            const later = targetMin + 30;
            if (later <= 26 * 60) {
                suggestions.push({
                    action: 'later-arrive',
                    label: `目标到达延后 30 分钟（${fmtHM(later)}）`,
                    value: 30,
                });
            }
        } else {
            // 出发模式：区分是"太早"还是"太晚"
            // 以 6:00 作为分界线，早于 6:00 认为是太早
            if (targetMin < 6 * 60) {
                const later = targetMin + 30;
                if (later <= 26 * 60) {
                    suggestions.push({
                        action: 'later-depart',
                        label: `延后 30 分钟出发（${fmtHM(later)}）`,
                        value: 30,
                    });
                }
            } else {
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
    }

    return suggestions;
}

function applyRouteSuggestion(action, value) {
    if (!_routeOverlay) return;

    if (action === 'disable-max-transfer') {
        const mtc = _routeOverlay.querySelector('#route-max-transfer-check');
        if (mtc) {
            mtc.checked = false;
            mtc.dispatchEvent(new Event('change'));
        }
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
    } else if (action === 'later-arrive' || action === 'later-depart') {
        const delta = parseInt(value, 10) || 30;
        _routeDepartMin = getRouteDepartMin() + delta;
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
    }

    setTimeout(() => runRoutePlanning(), 80);
}

/* ==========================================
   反向规划：给定目标到达时刻，二分查找最晚出发时刻
   ========================================== */
async function findLatestDepartureForArrival(start, end, targetArriveMin,
                                             sortMode, maxTransferMin, avoidOutOfStation, avoidCtrlStations) {
    const STEP = 5;   // 5 分钟粒度
    const EARLIEST = Math.max(5 * 60, targetArriveMin - 4 * 60);

    const loIdx = Math.floor(EARLIEST / STEP);
    const hiIdx = Math.floor(targetArriveMin / STEP);

    let bestIdx = -1;
    let L = loIdx, R = hiIdx;

    while (L <= R) {
        const midIdx = Math.floor((L + R) / 2);
        const t = midIdx * STEP;

        // 传入新增的 avoidCtrlStations 参数
        const r = await planRoutes(start, end, t, sortMode,
            maxTransferMin, avoidOutOfStation, true, avoidCtrlStations);
        const ok = r.results && r.results.length > 0
            && r.results.every(item => Math.floor(item.arriveMin) <= targetArriveMin);

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
   规划主流程
   ========================================== */
async function runRoutePlanning() {
    if (!_routeOverlay) return;

    const startInput = _routeOverlay.querySelector('#route-start');
    const endInput = _routeOverlay.querySelector('#route-end');
    const resultsEl = _routeOverlay.querySelector('#route-results');
    const goBtn = _routeOverlay.querySelector('#route-go');

    if (!startInput || !endInput || !resultsEl || !goBtn) return;

    // 1. 如果处于系统时间模式，点击规划时自动同步刷新时间为当前时间
    if (_routeDepartMin === null) {
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
    }

    // 2. 点击规划时，自动收起高级设置面板
    const advWrap = _routeOverlay.querySelector('#route-advanced');
    const advToggle = _routeOverlay.querySelector('#route-advanced-toggle');
    const wasOpen = advWrap && advWrap.classList.contains('open');
    if (wasOpen) {
        advWrap.classList.remove('open');
        advToggle.setAttribute('aria-expanded', 'false');
    }

    const start = startInput.value.trim();
    const end = endInput.value.trim();

    const startField = startInput.closest('.route-field');
    const endField = endInput.closest('.route-field');

    // 清除上一次的错误状态
    if (startField) startField.classList.remove('input-error');
    if (endField) endField.classList.remove('input-error');

    // 漏填 → 给对应输入框加红框抖动，不显示下方区域
    const missingStart = !start;
    const missingEnd = !end;

    if (missingStart && startField) startField.classList.add('input-error');
    if (missingEnd && endField) endField.classList.add('input-error');

    if (missingStart || missingEnd) {
        _routeOverlay.querySelector('#route-meta').style.display = 'none';
        resultsEl.style.display = 'none';
        return;
    }

    // 通过基础校验 → 显示下方区域
    _routeOverlay.querySelector('#route-meta').style.display = '';
    resultsEl.style.display = '';

    if (start === end) {
        resultsEl.innerHTML = `<div class="route-error">起点和终点不能相同</div>`;
        return;
    }

    // ★ 核心修复：只有当前没有任何结果卡片时（比如刚打开弹窗），才清空默认的空态提示文字
    // 如果已经存在规划结果，则保留原有内容，后续会被加上 is-loading 变成半透明
    if (!resultsEl.querySelector('.route-card')) {
        resultsEl.innerHTML = '';
    }

    // 读取各种参数 ... (这部分代码保持原样)
    const sortRadio = _routeOverlay.querySelector('input[name="route-sort"]:checked');
    const sortMode = sortRadio ? sortRadio.value : 'fastest';
    const departMin = getRouteDepartMin();

    _routeLastArrivedAt = null;

    let maxTransferMin = null;
    const mtc = _routeOverlay.querySelector('#route-max-transfer-check');
    const mti = _routeOverlay.querySelector('#route-max-transfer-min');
    if (mtc && mtc.checked && mti) {
        const v = parseInt(mti.value, 10);
        if (!isNaN(v) && v >= 0) {
            maxTransferMin = Math.min(v, 60);
        }
    }

    let avoidOutOfStation = false;
    const aoc = _routeOverlay.querySelector('#route-avoid-outdoor-check');
    if (aoc) avoidOutOfStation = aoc.checked;

    let avoidCtrlTransfer = false;
    const acc = _routeOverlay.querySelector('#route-avoid-ctrl-check');
    if (acc && !isTimeFarFromNow()) {
        avoidCtrlTransfer = acc.checked;
    }

    let walkSpeed = 1.5;
    const walkSpeedRadio = _routeOverlay.querySelector('input[name="route-walk-speed"]:checked');
    if (walkSpeedRadio) {
        const v = parseFloat(walkSpeedRadio.value);
        if (!isNaN(v) && v > 0) walkSpeed = v;
    }

    if (typeof ROUTE_GRAPH !== 'undefined' && ROUTE_GRAPH.loaded) {
        ROUTE_GRAPH.userWalkSpeed = walkSpeed;
    }

    saveRoutePrefs({
        sortMode,
        maxTransferChecked: !!(mtc && mtc.checked),
        maxTransferMin: (mtc && mtc.checked && mti)
            ? (parseInt(mti.value, 10) || 0)
            : 5,
        avoidOutOfStation,
        avoidCtrlTransfer,
        walkSpeed,
        arriveMode: _routeArriveMode,
    });

    pushRouteHistory('start', start);
    pushRouteHistory('end', end);

    goBtn.disabled = true;
    goBtn.classList.add('loading');
    resultsEl.classList.add('is-loading');

    // ★ 核心修复：如果刚才触发了收起动画，给 CSS 留出 300ms 播放时间，防止主线程计算阻塞动画
    if (wasOpen) {
        await new Promise(resolve => setTimeout(resolve, 300));
    } else {
        await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
    }

    try {
        // 先把用户输入的站名规范化（模糊匹配 / 别名 / 去括号）
        await loadRouteGraph();
        const resolvedStartNode = resolveGraphStationNode(start, 'start');
        const resolvedEndNode = resolveGraphStationNode(end, 'end');

        if (!resolvedStartNode) {
            let msg = `起点「${escapeHtml(start)}」不存在，请检查站名后重试`;
            if (isStationInOfficialData(start)) {
                msg = `起点「${escapeHtml(start)}」属于官方已有数据，但本地路网图暂未收录（本地图未更新），当前版本无法规划。`;
            }
            resultsEl.innerHTML = `<div class="route-error">${msg}</div>`;
            return;
        }

        const displayStart = resolvedStartNode.replace(/\|(开始|结束)$/, '');
        const displayEnd = resolvedEndNode.replace(/\|(开始|结束)$/, '');

        if (displayStart === displayEnd) {
            resultsEl.innerHTML = `<div class="route-error">起点和终点不能相同</div>`;
            return;
        }

        let r = null; // 用于存放底层规划结果
        let ctrlStationsForPlanner = null;

        // 如果时间离现在超过 2 小时，客控失效，跳过请求
        const timeFarFromNow = isTimeFarFromNow();
        let stationCtrl = null;

        if (!timeFarFromNow) {
            try {
                stationCtrl = await fetchStationControllers();
                if (avoidCtrlTransfer && stationCtrl) {
                    ctrlStationsForPlanner = Object.keys(stationCtrl);
                }
            } catch (_) {
                console.warn('获取客控数据失败，忽略此选项');
            }
        }

        if (_routeArriveMode) {
            const targetArriveMin = departMin;

            // ★ 1. 用中午 12:00 这个所有线路都在运营的安全时间，获取 Top 15 的拓扑路线
            // 这样底层的末班车过滤逻辑就不会误杀任何一条路线
            r = await planRoutes(displayStart, displayEnd, 12 * 60, sortMode,
                maxTransferMin, avoidOutOfStation, true, ctrlStationsForPlanner);

            if (!r.error && r.results && r.results.length > 0) {
                const validResults = [];

                for (const item of r.results) {
                    // ★ 2. 对每条路线进行二分查找，找出它的“最晚极限出发时间”
                    let lo = 5 * 60; // 最早的底线 05:00
                    let hi = targetArriveMin; // 最晚不能晚于目标到达时间
                    let bestCheck = null;
                    let bestDepart = null;

                    while (lo <= hi) {
                        const mid = Math.floor((lo + hi) / 2);
                        const check = checkReachability(item.path, mid);
                        // 如果这个时间出发能赶上末班车，且能准点抵达
                        if (check.feasible && Math.floor(check.arriveMin) <= targetArriveMin) {
                            bestDepart = mid;
                            bestCheck = check;
                            lo = mid + 1; // 尝试更晚出发
                        } else {
                            hi = mid - 1; // 出发太晚赶不上或没车，往前找
                        }
                    }

                    // 如果找到了合法的出发时间
                    if (bestDepart !== null && bestCheck) {
                        item.actualDepartMin = bestDepart;
                        item.arriveMin = bestCheck.arriveMin;
                        item.boardingMargins = bestCheck.boardingMargins;
                        item.interchanges = parseInterchangeKeys(item.path, bestDepart);
                        item.startMargin = (bestCheck.boardingMargins && bestCheck.boardingMargins.length > 0) ? bestCheck.boardingMargins[0] : null;

                        const validMargins = item.boardingMargins.filter(m => m != null && m !== 'unknown' && !isNaN(m));
                        item.urgentCount = validMargins.filter(m => m < 15).length;

                        validResults.push(item);
                    }
                }

                // ★ 3. 排序：出发时间越晚越靠前（让用户睡懒觉）；出发时间一样，耗时短的靠前
                validResults.sort((a, b) => {
                    if (Math.abs(b.actualDepartMin - a.actualDepartMin) > 0.01) {
                        return b.actualDepartMin - a.actualDepartMin;
                    }
                    return a.totalCost - b.totalCost;
                });

                r.results = validResults.slice(0, 3);
                r.results.forEach((item, idx) => { item.rank = idx + 1; });
            } else {
                r.results = [];
            }
            _routeActiveDepartMin = null;
            _routeLastArrivedAt = null;
        }
            // ==========================================
            // 模式 2：出发模式（正常计算）
        // ==========================================
        else {
            const actualDepartMin = departMin;
            _routeActiveDepartMin = actualDepartMin;
            r = await planRoutes(displayStart, displayEnd, actualDepartMin, sortMode,
                maxTransferMin, avoidOutOfStation, false, ctrlStationsForPlanner);
        }

        // ==========================================
        // 公共后处理（票价、客控、图例等）
        // ==========================================

        // 客控站点警告提取
        if (!r.error && stationCtrl && r.results && r.results.length > 0) {
            r.results.forEach(item => {
                item.stationWarnings = extractStationWarnings(item.path, stationCtrl);
            });
        }

        // 起终点异常提醒
        updateStartEndWarning(stationCtrl, displayStart, displayEnd);

        // 票价查询
        if (!r.error && r.results && r.results.length > 0) {
            let fare = null;
            try {
                fare = await fetchRouteFare(displayStart, displayEnd);
            } catch (_) {
                fare = null;
            }
            if (fare != null) {
                r.results.forEach(item => {
                    item.fare = fare;
                });
            }
        }

        if (r.error) {
            resultsEl.innerHTML = `<div class="route-error">${escapeHtml(r.error)}</div>`;
            hideAllRouteLegends();
            return;
        }

        // 换乘少特殊处理
        if (r.results.length === 0 && sortMode === 'fewer-transfers' && r.feasibleCount > 0) {
            hideAllRouteLegends();
            const rejectedList = r.rejected || [];
            const allNoService = rejectedList.length > 0 && rejectedList.every(x => (x.reason || '').includes('已无运营'));

            if (allNoService) {
                resultsEl.innerHTML = `<div class="route-empty"><div class="route-empty-title">当前时刻已结束运营</div><div class="route-empty-detail">所选时刻已超出该线路运营时间，请调整出发时间后重试。</div></div>`;
                return;
            }

            resultsEl.innerHTML = `
                <div class="route-empty">
                    <div class="route-empty-title">换乘少的方案时间代价较大</div>
                    <div class="route-empty-detail">已过滤比最优慢 30 分钟以上的换乘少方案，当前没有可用的换乘少路径。</div>
                    <div class="route-suggest-actions">
                        <button type="button" class="route-suggest-btn" data-action="switch-to-fastest">切回最快方案</button>
                    </div>
                </div>
            `;
            resultsEl.querySelectorAll('.route-suggest-btn[data-action="switch-to-fastest"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const radio = _routeOverlay.querySelector('input[name="route-sort"][value="fastest"]');
                    if (radio) {
                        radio.checked = true;
                        runRoutePlanning();
                    }
                });
            });
            return;
        }

        // 通用空结果处理
        if (r.results.length === 0) {
            let html = `<div class="route-empty">`;
            html += `<div class="route-empty-title">当前时刻没有可用的路径</div>`;

            // 如果是到达模式且没结果，提供延后建议
            if (_routeArriveMode) {
                const targetArriveMin = departMin;
                const suggestions = [];
                const later30 = targetArriveMin + 30;
                const later60 = targetArriveMin + 60;
                const LIMIT = 26 * 60;
                if (later30 <= LIMIT) suggestions.push({
                    action: 'later-arrive',
                    label: `目标到达延后 30 分钟（${fmtHM(later30)}）`,
                    value: 30
                });
                if (later60 <= LIMIT) suggestions.push({
                    action: 'later-arrive',
                    label: `目标到达延后 1 小时（${fmtHM(later60)}）`,
                    value: 60
                });

                if (suggestions.length > 0) {
                    html += `<div class="route-empty-suggest">💡 试试这些调整</div><div class="route-suggest-actions">`;
                    html += suggestions.map(s => `<button type="button" class="route-suggest-btn" data-action="${s.action}" data-value="${escapeHtml(String(s.value ?? ''))}">${escapeHtml(s.label)}</button>`).join('');
                    html += `</div>`;
                }
            } else {
                // 出发模式的建议
                const suggestions = buildRouteSuggestions(r, {maxTransferMin, avoidOutOfStation, sortMode});
                if (suggestions.length > 0) {
                    html += `<div class="route-empty-suggest">💡 试试这些调整</div><div class="route-suggest-actions">`;
                    html += suggestions.map(s => `<button type="button" class="route-suggest-btn" data-action="${s.action}" data-value="${escapeHtml(String(s.value ?? ''))}">${escapeHtml(s.label)}</button>`).join('');
                    html += `</div>`;
                }
            }
            // ★ 调整布局：左对齐，间距紧凑，样式与上方按钮一致
            html += `<div style="margin-top: 12px; display: flex; justify-content: flex-start; padding-left: 4px;">`;
            html += `<button type="button" class="route-suggest-btn" id="route-btn-external">`;
            html += `🗺️ 使用外部地图导航`;
            html += `</button>`;
            html += `</div>`;
            html += `</div>`;
            hideAllRouteLegends();
            resultsEl.innerHTML = html;

            // ★ 绑定外部导航按钮事件
            const extBtn = resultsEl.querySelector('#route-btn-external');
            if (extBtn) {
                extBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openExternalMap(displayStart, displayEnd);
                });
            }

            resultsEl.querySelectorAll('.route-suggest-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyRouteSuggestion(btn.dataset.action, btn.dataset.value);
                });
            });
            return;
        }

        // ---- 下面接着原来的 “渲染图例” 代码 ----

        let hasUrgent10 = false;
        let hasUrgent20 = false;

        r.results.forEach(item => {
            (item.boardingMargins || []).forEach(m => {
                if (m != null && m !== 'unknown') {
                    if (m >= 0 && m <= 10) hasUrgent10 = true;
                    else if (m > 10 && m <= 20) hasUrgent20 = true;
                }
            });
        });

        const legendEl = _routeOverlay.querySelector('#route-legend');
        if (legendEl) {
            legendEl.style.display = (hasUrgent10 || hasUrgent20) ? 'flex' : 'none';

            if (hasUrgent20 && !hasUrgent10) {
                legendEl.classList.add('single-row');
            } else {
                legendEl.classList.remove('single-row');
            }
        }

        const row20El = _routeOverlay.querySelector('#route-legend-row-20');
        if (row20El) row20El.style.display = hasUrgent20 ? 'flex' : 'none';

        const row10El = _routeOverlay.querySelector('#route-legend-row-10');
        if (row10El) row10El.style.display = hasUrgent10 ? 'flex' : 'none';

        const has3LineWarning = r.results.some(item =>
            item.warnings && item.warnings.some(w => w.risky3LineFrom && w.risky3LineTo)
        );
        const legend3LineEl = _routeOverlay.querySelector('#route-legend-3line');
        if (legend3LineEl) legend3LineEl.style.display = has3LineWarning ? 'flex' : 'none';

        let headlineHtml = '';

        // ★ 获取未收录站点并按线路分组
        const outdated = getOutdatedStations();
        if (outdated.length > 0) {
            const grouped = {};
            outdated.forEach(item => {
                if (!grouped[item.line]) grouped[item.line] = [];
                grouped[item.line].push(item.station);
            });

            // 限制最多展示 3 条线路，防止警告框过长
            let detailsHtml = '';
            const lines = Object.keys(grouped);
            const maxLines = 3;

            lines.slice(0, maxLines).forEach(line => {
                detailsHtml += `<div><b>${line}</b>：${grouped[line].join('、')}</div>`;
            });

            if (lines.length > maxLines) {
                detailsHtml += `<div style="opacity: 0.7;">等 ${lines.length} 条线路...</div>`;
            }

            headlineHtml += `
                <div class="route-outdated-notice">
                    <div style="font-size: 14px; margin-bottom: 4px;">检测到官方存在新站点，本地线路图未更新，规划结果可能不是最优：</div>
                    <div style="font-weight: 500; font-size: 12px; line-height: 1.6; opacity: 0.9;">
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }

        // 检测是否有客控换乘站，并渲染提示
        let hasCtrlLightning = false;
        r.results.forEach(item => {
            if (item.stationWarnings && item.stationWarnings.length > 0) {
                const transferStations = item.interchanges.map(o => o.key.split('|')[0]);
                if (item.stationWarnings.some(w => transferStations.includes(w.station))) {
                    hasCtrlLightning = true;
                }
            }
        });

        if (hasCtrlLightning) {
            headlineHtml += `<div class="route-ctrl-lightning-hint">
                <svg viewBox="0 0 24 24" class="ctrl-lightning-icon">
                    <path d="M13 2 L5 13 h6 l-1 9 l9 -12 h-6 l1 -8 z" fill="#f59e0b" stroke="#1f2b3c" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
                <span>换乘站客控中，请留意车站指引</span>
            </div>`;
        }

        // 渲染卡片
        resultsEl.innerHTML = headlineHtml + r.results.map((item, idx) =>
            renderRouteCard(item, idx, displayStart, displayEnd, sortMode)
        ).join('');

        // 卡片展开/收起
        resultsEl.querySelectorAll('.route-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // 拦截内部交互元素
                if (e.target.closest('.route-guide')) return;
                if (e.target.closest('.route-stations-toggle')) return;
                if (e.target.closest('.route-station-more-btn')) return;

                const isExpanding = !card.classList.contains('expanded');
                card.classList.toggle('expanded');

                // 如果正在展开，则触发自动滚动并锁定交互
                if (isExpanding) {
                    const routeBody = card.closest('.route-body');
                    if (!routeBody) return;

                    // 1. 锁定滚动与交互（阻止用户滚轮、触摸、拖拽滚动条）
                    const preventScroll = (ev) => { ev.preventDefault(); };
                    routeBody.addEventListener('wheel', preventScroll, { passive: false });
                    routeBody.addEventListener('touchmove', preventScroll, { passive: false });
                    routeBody.style.pointerEvents = 'none'; // 禁止点击，防止用户在动画期间乱点

                    const unlock = () => {
                        routeBody.removeEventListener('wheel', preventScroll);
                        routeBody.removeEventListener('touchmove', preventScroll);
                        routeBody.style.pointerEvents = '';
                    };

                    setTimeout(() => {
                        const bodyRect = routeBody.getBoundingClientRect();
                        const cardRect = card.getBoundingClientRect();
                        const padding = 20; // 底部留白
                        let scrollDistance = 0;

                        if (cardRect.height > bodyRect.height - padding) {
                            // 卡片超长，滚到顶部
                            scrollDistance = (cardRect.top - bodyRect.top) - 10;
                        } else if (cardRect.bottom > bodyRect.bottom) {
                            // 卡片底部被遮挡，向上滚动
                            scrollDistance = cardRect.bottom - bodyRect.bottom + padding;
                        }

                        // 3. 如果需要滚动，执行平滑滚动，并在滚动期间保持锁定
                        if (scrollDistance > 5) {
                            routeBody.scrollTo({ top: routeBody.scrollTop + scrollDistance, behavior: 'smooth' });
                            // 平滑滚动通常需要 300-500ms，这里预留 500ms 后再解锁
                            setTimeout(unlock, 500);
                        } else {
                            // 不需要滚动则直接解锁
                            unlock();
                        }
                    }, 120);
                }
            });
        });

        // 「展开中间 N 站」内联按钮
        resultsEl.querySelectorAll('.route-station-more-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.route-card');
                if (!card) return;

                const collapsedEl = card.querySelector('.route-stations-collapsed');
                const fullEl = card.querySelector('.route-stations-full');
                const toggleWrap = card.querySelector('.route-stations-toggle-wrap');
                const toggleBtn = toggleWrap ? toggleWrap.querySelector('.route-stations-toggle') : null;
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
                    collapsedEl.style.display = '';
                    fullEl.style.display = 'none';
                    btn.dataset.expanded = '0';
                    if (textEl) textEl.textContent = `展开全部 ${total} 站`;

                    const wrap = btn.closest('.route-stations-toggle-wrap');
                    if (wrap) wrap.style.display = 'none';
                } else {
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
        _routeActiveDepartMin = null;
        const goBtn2 = _routeOverlay.querySelector('#route-go');
        if (goBtn2) {
            goBtn2.disabled = false;
            goBtn2.classList.remove('loading');
        }
        resultsEl.classList.remove('is-loading');

        // ★ 修改此处：传入 true，表示规划结束后允许显示详细说明
        setRouteMeta(routeMetaText(true));
    }
}

/**
 * 从路径里提取命中的车站管制事件（按站名去重）。
 */
function extractStationWarnings(path, stationCtrl) {
    const warnings = [];
    const seen = new Set();
    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;
        const name = parts[1];
        if (name === '开始' || name === '结束') continue;
        if (seen.has(name)) continue;
        seen.add(name);
        const ctrl = stationCtrl[name];
        if (ctrl) {
            warnings.push({
                station: name,
                type: ctrl.type,
                typeText: ctrl.typeText,
            });
        }
    }
    return warnings;
}

/**
 * 渲染"起终点异常"横幅。
 */
function updateStartEndWarning(stationCtrl, startName, endName) {
    const wrap = _routeOverlay?.querySelector('#route-startend-warning');
    if (!wrap) return;

    if (!stationCtrl) {
        wrap.style.display = 'none';
        wrap.innerHTML = '';
        return;
    }

    const startCtrl = stationCtrl[startName];
    const endCtrl = stationCtrl[endName];

    if (!startCtrl && !endCtrl) {
        wrap.style.display = 'none';
        wrap.innerHTML = '';
        return;
    }

    // 按 typeText 分组
    const groups = new Map();   // typeText → [{role, name}]
    if (startCtrl) {
        if (!groups.has(startCtrl.typeText)) groups.set(startCtrl.typeText, []);
        groups.get(startCtrl.typeText).push({role: '起点', name: startName});
    }
    if (endCtrl) {
        if (!groups.has(endCtrl.typeText)) groups.set(endCtrl.typeText, []);
        groups.get(endCtrl.typeText).push({role: '终点', name: endName});
    }

    wrap.innerHTML = [...groups.entries()].map(([typeText, entries]) => {
        const body = entries.map(e =>
            `<span class="route-sew-tag">${escapeHtml(e.role)}</span>` +
            `<span class="route-sew-name">${escapeHtml(e.name)}</span>`
        ).join('<span class="route-sew-sep">·</span>');

        return `<div class="route-sew-item">
            <span class="route-sew-type">${escapeHtml(typeText)}</span>
            <span class="route-sew-body">${body}</span>
        </div>`;
    }).join('');

    wrap.style.display = 'flex';
}

/** 唤起外部地图 App */
function openExternalMap(start, end) {
    // 加上"广州市"和"地铁站"作为后缀，提高外部地图搜索的精准度
    const startStr = encodeURIComponent(`广州市 ${start}地铁站`);
    const endStr = encodeURIComponent(`广州市 ${end}地铁站`);

    const ua = navigator.userAgent.toLowerCase();
    // 严格判断真正的苹果移动设备（排除桌面端 Mac 和伪装 UA 的 Windows）
    const isIOS = /iphone|ipad|ipod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
        // 使用 Apple Maps 的通用 HTTPS 链接，iOS 上会自动拉起原生 App
        const url = `https://maps.apple.com/?saddr=${startStr}&daddr=${endStr}&dirflg=r`;
        // window.location.href = url;
        window.open(url, '_blank');
    } else {
        // 其他设备（Windows、安卓、Mac）：使用高德地图网页版
        // 手机会自动唤起高德App，电脑会打开高德网页版
        const url = `https://uri.amap.com/navigation?from=${startStr}&to=${endStr}&mode=bus&policy=1&src=mypage&coordinate=gaode&callnative=1`;
        window.open(url, '_blank');
    }
}