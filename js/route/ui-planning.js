// ========== 路径规划 UI · 规划流程与空结果建议 ==========

// ====== 临近站点映射表 ======
const NEARBY_STATION_MAP = {
    '流花': '越秀公园', '越秀公园': '流花',
    '乐嘉路': '飞翔公园', '飞翔公园': '乐嘉路',
    '石牌桥': '体育中心', '体育中心': '石牌桥',
    '广州塔': '赤岗塔', '赤岗塔': '广州塔',
    '中大': '中大南门', '中大南门': '中大',
    '石溪': '工业大道南', '工业大道南': '石溪'
};

// ========== 检测未收录站点 ==========
let _outdatedStationsCache = null; // 缓存结果

function invalidateOutdatedStationsCache() {
    _outdatedStationsCache = null;
}

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
                result.push({line, station: st});
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

    // 如果有 STATION_INDEX，直接 O(1) 判断
    if (typeof STATION_INDEX !== 'undefined' && STATION_INDEX[stationName]) {
        return true;
    }

    // 兜底（防止索引未构建时漏判）
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
    const reasons = r.rejected ? r.rejected.map(x => x.reason).join(' ') : '';
    const uniqueReasons = r.rejected ? [...new Set(r.rejected.map(x => x.reason))] : [];

    // 1. 单次换乘上限被卡住 → 建议放宽或关闭
    if (currentCfg.maxTransferMin != null && reasons.includes('超过设定上限')) {
        if (currentCfg.maxTransferMin < 60) {
            const nextLimit = currentCfg.maxTransferMin + 1;
            suggestions.push({
                action: 'set-max-transfer',
                label: `单次换乘放宽至 ${nextLimit} 分钟`,
                value: nextLimit,
            });
        }
        suggestions.push({
            action: 'disable-max-transfer',
            label: '关闭单次换乘限制',
            value: '',
        });
    }

    // 2. 不走站外换乘被卡住 → 建议关闭
    if (currentCfg.avoidOutOfStation && reasons.includes('站外换乘')) {
        suggestions.push({
            action: 'allow-outdoor',
            label: '允许站外换乘',
            value: '',
        });
    }

    // 3. 尽量不走客控中换乘站 → 建议关闭
    if (currentCfg.avoidCtrlTransfer) {
        suggestions.push({
            action: 'allow-ctrl',
            label: '允许经过客控换乘站',
            value: '',
        });
    }

    // 4. 首末班车问题 → 建议调整时间
    const lastTrainReason = uniqueReasons.find(x =>
        x.includes('已无运营') || x.includes('已停运') || x.includes('末班车')
    );
    if (lastTrainReason) {
        const targetMin = getRouteDepartMin();
        if (_routeArriveMode) {
            const later = targetMin + 30;
            if (later <= 26 * 60) {
                suggestions.push({
                    action: 'later-arrive',
                    label: `目标到达延后 30 分钟（${fmtHM(later)}）`,
                    value: 30,
                });
            }
        } else {
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
    } else if (action === 'allow-ctrl') {
        const acc = _routeOverlay.querySelector('#route-avoid-ctrl-check');
        if (acc) acc.checked = false;
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
   规划主流程（已模块化拆分）
   ========================================== */
let _isRoutePlanning = false; // 防止并发点击的状态锁

async function runRoutePlanning() {
    if (_isRoutePlanning) return;
    if (!_routeOverlay) return;

    const startInput = _routeOverlay.querySelector('#route-start');
    const endInput = _routeOverlay.querySelector('#route-end');
    const resultsEl = _routeOverlay.querySelector('#route-results');
    const goBtn = _routeOverlay.querySelector('#route-go');
    const advWrap = _routeOverlay.querySelector('#route-advanced');
    const advToggle = _routeOverlay.querySelector('#route-advanced-toggle');

    if (!startInput || !endInput || !resultsEl || !goBtn) return;
    if (goBtn.disabled || goBtn.classList.contains('loading')) return;

    // 1. 如果处于系统时间模式，点击规划时自动同步刷新时间为当前时间
    if (_routeDepartMin === null) {
        refreshRouteTimeTriggers();
        setRouteMeta(routeMetaText());
        updateSortOptionStatus();
        updateCtrlOptionStatus();
    }

    // 2. 自动收起高级设置面板
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

    // 漏填校验
    if (!start || !end) {
        if (!start && startField) startField.classList.add('input-error');
        if (!end && endField) endField.classList.add('input-error');
        _routeOverlay.querySelector('#route-meta').style.display = 'none';
        resultsEl.style.display = 'none';
        return;
    }

    // 基础校验通过，显示下方区域
    _routeOverlay.querySelector('#route-meta').style.display = '';
    resultsEl.style.display = '';

    if (start === end) {
        resultsEl.innerHTML = `<div class="route-error">起点和终点不能相同</div>`;
        return;
    }

    // ==========================================
    // 核心修复：校验通过后，立刻加锁并改变 UI
    // ==========================================
    _isRoutePlanning = true;
    goBtn.disabled = true;
    goBtn.classList.add('loading');
    resultsEl.classList.add('is-loading');

    if (!resultsEl.querySelector('.route-card')) {
        resultsEl.innerHTML = '';
    }

    _routeLastArrivedAt = null;

    try {
        // 等待动画帧，防止界面卡顿
        if (wasOpen) {
            await new Promise(resolve => setTimeout(resolve, 300));
        } else {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }

        // 执行主规划流水线
        await _executePlanningPipeline(start, end, resultsEl);
    } catch (e) {
        resultsEl.innerHTML = `<div class="route-error">规划失败：${escapeHtml(e.message || String(e))}</div>`;
    } finally {
        // 释放锁并恢复 UI
        _isRoutePlanning = false;
        _routeActiveDepartMin = null;
        goBtn.disabled = false;
        goBtn.classList.remove('loading');
        resultsEl.classList.remove('is-loading');
        setRouteMeta(routeMetaText(true));

        saveRouteSession();
    }
}

function _applyWaitRatioToResults(results) {
    if (typeof _routeWaitRatio === 'undefined' || _routeWaitRatio === 0.5 || !results) return;
    results.forEach(item => {
        const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(item.path) : [];
        if (segs.length === 0) return;
        let delta = 0;
        const startTime = item.actualDepartMin || _routeActiveDepartMin || getRouteDepartMin();
        const h1 = typeof getHeadwayAt === 'function' ? getHeadwayAt(segs[0].fullLine, startTime) : 0;
        if (h1) delta += h1 * (_routeWaitRatio - 0.5);

        if (item.interchanges) {
            item.interchanges.forEach(o => {
                const toLine = o.key.split('|')[3];
                const h = typeof getHeadwayAt === 'function' ? getHeadwayAt(toLine, o.boardingTime) : 0;
                if (h) delta += h * (_routeWaitRatio - 0.5);
            });
        }

        if (Math.abs(delta) > 0.01) {
            item.totalCost += delta * 60;
            if (!_routeArriveMode) item.arriveMin += delta;
        }
    });
}

/**
 * 核心流水线：串联配置读取、算路、排序与渲染
 */
async function _executePlanningPipeline(start, end, resultsEl) {
    await loadRouteGraph();

    // 1. 读取配置项
    const cfg = _getRoutePlanningOptions();
    const departMin = getRouteDepartMin();

    // 2. 处理临近站，获取合法组合
    const comboResult = _getValidStationCombos(start, end);
    if (comboResult.error) {
        resultsEl.innerHTML = `<div class="route-error">${comboResult.error}</div>`;
        return;
    }
    const {startCands, endCands, validCombos} = comboResult;

    // 3. 获取客控数据
    let ctrlStationsForPlanner = null;
    let stationCtrl = null;
    const now = new Date();
    const isDeadTime = now.getHours() >= 2 && now.getHours() <= 4;
    if (!isTimeFarFromNow() && !isDeadTime) {
        try {
            stationCtrl = await fetchStationControllers();
            if (cfg.avoidCtrlTransfer && stationCtrl) {
                ctrlStationsForPlanner = Object.keys(stationCtrl);
            }
        } catch (_) {
        }
    }

    // 4. 分支执行算路
    let r;
    if (_routeArriveMode) {
        r = await _performArrivePlanning(validCombos, departMin, cfg, ctrlStationsForPlanner);
        _routeActiveDepartMin = null;
    } else {
        _routeActiveDepartMin = departMin;
        r = await _performDepartPlanning(validCombos, departMin, cfg, ctrlStationsForPlanner);
    }

    // 5. 票价与客控后处理
    if (!r.error && r.results && r.results.length > 0) {
        if (stationCtrl) {
            r.results.forEach(item => {
                item.stationWarnings = extractStationWarnings(item.path, stationCtrl);
            });
        }
        await Promise.all(r.results.map(async item => {
            try {
                const getMappedStationName = (station, lineName) => {
                    if (lineName === 'TNH1' || lineName === '南海有轨1号线') {
                        if (station === '虫雷 岗' || station === '礌岗') return '虫雷 岗（有轨）';
                    }
                    return station;
                };

                const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(item.path) : [];

                const hasAPM = segs.some(s => s.fullLine === 'APM');
                let hasTNH1GuangfoDirect = false;
                for (let i = 0; i < segs.length - 1; i++) {
                    const s1 = segs[i], s2 = segs[i + 1];
                    // 只有 TNH1 和 广佛线 直接换乘（礌岗）才算出闸
                    if ((s1.fullLine === 'TNH1' && s2.fullLine === '广佛线') ||
                        (s1.fullLine === '广佛线' && s2.fullLine === 'TNH1')) {
                        hasTNH1GuangfoDirect = true;
                        break;
                    }
                }
                const needSplit = hasAPM || hasTNH1GuangfoDirect;

                if (!needSplit) {
                    let queryStart = item._realStart;
                    let queryEnd = item._realEnd;

                    // 核心修复：如果路径的第一段是 TNH1，把起点站名替换为“虫雷 岗（有轨）”
                    const firstSeg = segs[0];
                    if (firstSeg && (firstSeg.fullLine === 'TNH1' || firstSeg.fullLine === '南海有轨1号线')) {
                        if (queryStart === '虫雷 岗' || queryStart === '礌岗') {
                            queryStart = '虫雷 岗（有轨）';
                        }
                    }
                    // 如果最后一段是 TNH1，同理替换终点
                    const lastSeg = segs[segs.length - 1];
                    if (lastSeg && (lastSeg.fullLine === 'TNH1' || lastSeg.fullLine === '南海有轨1号线')) {
                        if (queryEnd === '虫雷 岗' || queryEnd === '礌岗') {
                            queryEnd = '虫雷 岗（有轨）';
                        }
                    }

                    let overallFare = await fetchRouteFare(queryStart, queryEnd);

                    if (overallFare != null) {
                        item.fare = overallFare;
                        return; // 查到总价直接返回
                    }
                }

                // 👇 3. 需要强制拆分，或者查不到总价时的兜底分段计算
                const INDEPENDENT_FARE_LINES = ['APM', 'TNH1', '南海有轨1号线', '海珠有轨1号线', '黄埔有轨1号线', '黄埔有轨2号线'];
                const hasIndependentLine = segs.some(s => INDEPENDENT_FARE_LINES.includes(s.fullLine));

                if (!hasIndependentLine) {
                    const fare = await fetchRouteFare(item._realStart, item._realEnd);
                    if (fare != null) item.fare = fare;
                } else {
                    let totalFare = 0;
                    let segmentStart = item._realStart;
                    let validFare = false; // 标记是否至少查到了一段票价

                    for (const seg of segs) {
                        if (INDEPENDENT_FARE_LINES.includes(seg.fullLine)) {
                            if (segmentStart !== seg.fromStation) {
                                const f1 = await fetchRouteFare(segmentStart, seg.fromStation);
                                if (f1 != null) {
                                    totalFare += f1;
                                    validFare = true;
                                }
                            }

                            const actualFrom = getMappedStationName(seg.fromStation, seg.fullLine);
                            const actualTo = getMappedStationName(seg.toStation, seg.fullLine);
                            let fSeg = await fetchRouteFare(actualFrom, actualTo);
                            if (fSeg != null) {
                                totalFare += fSeg;
                                validFare = true;
                            }

                            segmentStart = seg.toStation;
                        }
                    }
                    if (segmentStart !== item._realEnd) {
                        const f2 = await fetchRouteFare(segmentStart, item._realEnd);
                        if (f2 != null) {
                            totalFare += f2;
                            validFare = true;
                        }
                    }

                    if (validFare) item.fare = totalFare;
                }
            } catch (e) {
                console.warn('票价计算失败', e);
            }
        }));
    }

    updateStartEndWarning(stationCtrl, startCands[0].real, endCands[0].real);

    if (r.error) {
        resultsEl.innerHTML = `<div class="route-error">${escapeHtml(r.error)}</div>`;
        hideAllRouteLegends();
        return;
    }

    // 6. 渲染结果
    _renderRouteResults(r, start, end, cfg, resultsEl);
}

/**
 * 读取路径规划的各项参数配置
 */
function _getRoutePlanningOptions() {
    const sortRadio = _routeOverlay.querySelector('input[name="route-sort"]:checked');
    const sortMode = sortRadio ? sortRadio.value : 'fastest';

    let maxTransferMin = null;
    const mtc = _routeOverlay.querySelector('#route-max-transfer-check');
    const mti = _routeOverlay.querySelector('#route-max-transfer-min');
    if (mtc && mtc.checked && mti) {
        const v = parseInt(mti.value, 10);
        if (!isNaN(v) && v >= 0) maxTransferMin = Math.min(v, 60);
    }

    let avoidOutOfStation = false;
    const aoc = _routeOverlay.querySelector('#route-avoid-outdoor-check');
    if (aoc) avoidOutOfStation = aoc.checked;

    let avoidCtrlTransfer = false;
    const acc = _routeOverlay.querySelector('#route-avoid-ctrl-check');
    if (acc && !isTimeFarFromNow()) avoidCtrlTransfer = acc.checked;

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
        maxTransferMin: (mtc && mtc.checked && mti) ? (parseInt(mti.value, 10) || 0) : 5,
        avoidOutOfStation,
        avoidCtrlTransfer,
        walkSpeed,
        arriveMode: _routeArriveMode,
    });

    return {sortMode, maxTransferMin, avoidOutOfStation, avoidCtrlTransfer};
}

/**
 * 处理临近站映射，构建合法的起终点组合
 */
function _getValidStationCombos(start, end) {
    const isMutualNearby = NEARBY_STATION_MAP[start] === end || NEARBY_STATION_MAP[end] === start;

    const startCands = [];
    const startIsValid = !!resolveGraphStationNode(start, 'start');
    if (startIsValid) startCands.push({input: start, real: start});
    if ((!isMutualNearby || !startIsValid) && NEARBY_STATION_MAP[start]) {
        const alias = NEARBY_STATION_MAP[start];
        if (alias !== start && resolveGraphStationNode(alias, 'start')) {
            startCands.push({input: start, real: alias});
        }
    }

    const endCands = [];
    const endIsValid = !!resolveGraphStationNode(end, 'end');
    if (endIsValid) endCands.push({input: end, real: end});
    if ((!isMutualNearby || !endIsValid) && NEARBY_STATION_MAP[end]) {
        const alias = NEARBY_STATION_MAP[end];
        if (alias !== end && resolveGraphStationNode(alias, 'end')) {
            endCands.push({input: end, real: alias});
        }
    }

    if (startCands.length === 0) {
        let msg = `起点「${escapeHtml(start)}」不存在，请检查站名后重试`;
        if (isStationInOfficialData(start)) msg = `起点「${escapeHtml(start)}」属于官方已有数据，但本地路网图暂未收录（本地图未更新）。`;
        return {error: msg};
    }
    if (endCands.length === 0) {
        let msg = `终点「${escapeHtml(end)}」不存在，请检查站名后重试`;
        if (isStationInOfficialData(end)) msg = `终点「${escapeHtml(end)}」属于官方已有数据，但本地路网图暂未收录（本地图未更新）。`;
        return {error: msg};
    }

    const validCombos = [];
    for (const s of startCands) {
        for (const e of endCands) {
            if (s.real !== e.real) validCombos.push({s, e});
        }
    }

    if (validCombos.length === 0) {
        return {error: '起点和终点不能相同'};
    }

    return {startCands, endCands, validCombos};
}

/**
 * 到达模式：二分查找最晚出发时刻
 */
async function _performArrivePlanning(validCombos, targetArriveMin, cfg, ctrlStationsForPlanner) {
    let allValidResults = [];

    for (const combo of validCombos) {
        const subR = await planRoutes(combo.s.real, combo.e.real, 12 * 60, cfg.sortMode, cfg.maxTransferMin, cfg.avoidOutOfStation, true, ctrlStationsForPlanner);
        if (subR.error || !subR.results || subR.results.length === 0) continue;

        for (const item of subR.results) {
            // 【修改点】：将步长改为 1 分钟，确保能精确逼近目标到达时间
            const STEP = 1;
            const EARLIEST = Math.max(5 * 60, targetArriveMin - 4 * 60);
            let bestDepart = null;
            let bestCheck = null;

            for (let t = targetArriveMin; t >= EARLIEST; t -= STEP) {
                const check = checkReachability(item.path, t);
                if (check.feasible && Math.floor(check.arriveMin) <= targetArriveMin) {
                    bestDepart = t;
                    bestCheck = check;
                    break; // 从晚到早，第一个满足条件的即为最晚出发
                }
            }

            if (bestDepart !== null && bestCheck) {
                item._earlyMin = targetArriveMin - bestCheck.arriveMin;

                item.actualDepartMin = bestDepart;
                item.arriveMin = bestCheck.arriveMin;
                item.boardingMargins = bestCheck.boardingMargins;
                item.interchanges = parseInterchangeKeys(item.path, bestDepart);
                item.startMargin = (bestCheck.boardingMargins && bestCheck.boardingMargins.length > 0) ? bestCheck.boardingMargins[0] : null;

                if (bestCheck.boardings && bestCheck.boardings.length > 0) {
                    item.startWaitMin = bestCheck.boardings[0].waitTime;
                    item.actualStartBoardTime = bestCheck.boardings[0].boardTimeMin + bestCheck.boardings[0].waitTime;
                } else {
                    item.startWaitMin = 0;
                    item.actualStartBoardTime = bestDepart;
                }
                const validMargins = item.boardingMargins.filter(m => m != null && m !== 'unknown' && !isNaN(m));
                item.urgentCount = validMargins.filter(m => m < 15).length;

                item._realStart = combo.s.real;
                item._realEnd = combo.e.real;
                item._mappedStart = combo.s.real !== combo.s.input ? `(${combo.s.real})` : '';
                item._mappedEnd = combo.e.real !== combo.e.input ? `(${combo.e.real})` : '';

                allValidResults.push(item);
            }
        }
    }

    let pool = allValidResults.filter(item => item._earlyMin <= 20);
    if (pool.length === 0) {
        pool = allValidResults;
    }

    _applyWaitRatioToResults(pool);

    pool.sort((a, b) => {
        if (Math.abs(b.actualDepartMin - a.actualDepartMin) > 0.01) return b.actualDepartMin - a.actualDepartMin;
        return a.totalCost - b.totalCost;
    });

    const seenPaths = new Set();
    const finalResults = [];
    for (const item of pool) {
        const pathKey = item.path.nodes.join('|');
        if (seenPaths.has(pathKey)) continue;
        seenPaths.add(pathKey);
        finalResults.push(item);
        if (finalResults.length >= 3) break;
    }

    finalResults.forEach((item, idx) => {
        item.rank = idx + 1;
    });

    return {results: finalResults, rejected: [], totalPaths: 0, feasibleCount: finalResults.length};
}

/**
 * 出发模式：计算各条路径并去重
 */
async function _performDepartPlanning(validCombos, actualDepartMin, cfg, ctrlStationsForPlanner) {
    let allResults = [];
    let allRejected = [];

    for (const combo of validCombos) {
        const subR = await planRoutes(combo.s.real, combo.e.real, actualDepartMin, cfg.sortMode, cfg.maxTransferMin, cfg.avoidOutOfStation, false, ctrlStationsForPlanner);
        if (subR.error) continue;

        if (subR.results && subR.results.length > 0) {
            subR.results.forEach(item => {
                item._realStart = combo.s.real;
                item._realEnd = combo.e.real;
                item._mappedStart = combo.s.real !== combo.s.input ? `(${combo.s.real})` : '';
                item._mappedEnd = combo.e.real !== combo.e.input ? `(${combo.e.real})` : '';
            });
            allResults = allResults.concat(subR.results);
        }
        if (subR.rejected) allRejected = allRejected.concat(subR.rejected);
    }

    _applyWaitRatioToResults(allResults);

    const globalFastestCost = allResults.length > 0 ? Math.min(...allResults.map(x => x.totalCost)) : null;

    // 排序逻辑抽离
    allResults = _sortCombinedRoutes(allResults, cfg.sortMode, globalFastestCost);

    const seenPaths = new Set();
    const finalResults = [];
    for (const item of allResults) {
        const pathKey = item.path.nodes.join('|');
        if (seenPaths.has(pathKey)) continue;
        seenPaths.add(pathKey);
        finalResults.push(item);
        if (finalResults.length >= 5) break;
    }

    if (globalFastestCost != null) {
        finalResults.forEach(item => {
            item.deltaFromFastest = item.totalCost - globalFastestCost;
        });
    }

    let currentRank = 0, lastArrive = null;
    finalResults.forEach((item, idx) => {
        const arriveFloor = Math.floor(item.arriveMin);
        if (lastArrive === null || arriveFloor !== lastArrive) {
            currentRank = idx + 1;
            lastArrive = arriveFloor;
        }
        item.rank = currentRank;
    });

    return {results: finalResults, rejected: allRejected, totalPaths: 0, feasibleCount: finalResults.length};
}

/**
 * 合并结果的排序与过滤逻辑
 */
function _sortCombinedRoutes(allResults, sortMode, globalFastestCost) {
    if (sortMode === 'fewer-transfers') {
        allResults = allResults.filter(r => globalFastestCost != null && (r.totalCost - globalFastestCost) <= FEWER_TRANSFERS_MAX_DELTA_SEC);
        allResults.sort((a, b) => a.interchanges.length - b.interchanges.length || a.totalCost - b.totalCost);
    } else if (sortMode === 'conservative') {
        const getMinMargin = (item) => {
            const allMargins = [...(item.boardingMargins || [])];
            if (item.tyxMargin != null && item.tyxMargin !== 'unknown' && !isNaN(item.tyxMargin)) {
                allMargins.push(item.tyxMargin);
            }
            const valid = allMargins.filter(m => m != null && m !== 'unknown' && !isNaN(m));
            return valid.length > 0 ? Math.min(...valid) : 9999;
        };

        allResults.sort((a, b) => {
            const aMin = getMinMargin(a), bMin = getMinMargin(b);
            const getLevel = (m) => m <= 10 ? 1 : (m <= 20 ? 2 : 3); // 1危险，2警戒，3安全
            const aLv = getLevel(aMin), bLv = getLevel(bMin);

            // >>> 新增：如果双方都是完全安全（没有图标），直接按耗时排
            if (aLv === 3 && bLv === 3) {
                return a.totalCost - b.totalCost;
            }

            if (aLv !== bLv) return bLv - aLv;
            if (Math.abs(aMin - bMin) > 0.1) return bMin - aMin;
            return a.totalCost - b.totalCost;
        });
    } else {
        allResults.sort((a, b) => a.totalCost - b.totalCost);
    }
    return allResults;
}

/**
 * 渲染结果（包含空态处理、图例、HTML生成、事件绑定）
 */
function _renderRouteResults(r, start, end, cfg, resultsEl) {
    window._currentRouteResults = r.results;
    const sortMode = cfg.sortMode;
    // 处理“换乘少”无结果的特例
    if (r.results.length === 0 && sortMode === 'fewer-transfers' && r.feasibleCount > 0) {
        hideAllRouteLegends();
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
                    void runRoutePlanning();
                }
            });
        });
        return;
    }

    // 处理通用空结果
    if (r.results.length === 0) {
        let html = `<div class="route-empty"><div class="route-empty-title">当前时刻没有可用的路径</div>`;

        let suggestions = [];
        if (_routeArriveMode) {
            const targetArriveMin = getRouteDepartMin();
            const LIMIT = 26 * 60;
            if (targetArriveMin + 30 <= LIMIT) suggestions.push({
                action: 'later-arrive',
                label: `目标到达延后 30 分钟（${fmtHM(targetArriveMin + 30)}）`,
                value: 30
            });
            if (targetArriveMin + 60 <= LIMIT) suggestions.push({
                action: 'later-arrive',
                label: `目标到达延后 1 小时（${fmtHM(targetArriveMin + 60)}）`,
                value: 60
            });
        } else {
            // 传入完整的 cfg
            suggestions = buildRouteSuggestions(r, cfg);
        }

        // 将按钮和外部导航统一包裹在 route-suggest-actions 中
        if (suggestions.length > 0 || (typeof IS_TOY_ENV === 'undefined' || !IS_TOY_ENV)) {
            html += `<div class="route-empty-suggest">💡 试试这些调整</div><div class="route-suggest-actions">`;
            html += suggestions.map(s => `<button type="button" class="route-suggest-btn" data-action="${s.action}" data-value="${escapeHtml(String(s.value ?? ''))}">${escapeHtml(s.label)}</button>`).join('');

            // 合并外部导航按钮
            if (typeof IS_TOY_ENV === 'undefined' || !IS_TOY_ENV) {
                html += `<button type="button" class="route-suggest-btn" id="route-btn-external">🗺️ 使用外部地图导航</button>`;
            }
            html += `</div>`;
        }

        html += `</div>`;
        hideAllRouteLegends();
        resultsEl.innerHTML = html;

        const extBtn = resultsEl.querySelector('#route-btn-external');
        if (extBtn) extBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openExternalMap(start, end);
        });

        resultsEl.querySelectorAll('.route-suggest-btn:not(#route-btn-external)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                applyRouteSuggestion(btn.dataset.action, btn.dataset.value);
            });
        });
        return;
    }

    // ---- 正常渲染有结果的情况 ----
    let hasUrgent10 = false, hasUrgent20 = false;
    r.results.forEach(item => {
        const allMargins = [...(item.boardingMargins || [])];
        if (item.tyxMargin != null && item.tyxMargin !== 'unknown' && !isNaN(item.tyxMargin)) {
            allMargins.push(item.tyxMargin);
        }
        allMargins.forEach(m => {
            if (m != null && m !== 'unknown') {
                if (m >= 0 && m <= 10) hasUrgent10 = true;
                else if (m > 10 && m <= 20) hasUrgent20 = true;
            }
        });
    });

    const legendEl = _routeOverlay.querySelector('#route-legend');
    if (legendEl) legendEl.style.display = (hasUrgent10 || hasUrgent20) ? 'flex' : 'none';
    const row20El = _routeOverlay.querySelector('#route-legend-row-20');
    if (row20El) row20El.style.display = hasUrgent20 ? 'flex' : 'none';
    const row10El = _routeOverlay.querySelector('#route-legend-row-10');
    if (row10El) row10El.style.display = hasUrgent10 ? 'flex' : 'none';

    let headlineHtml = '';
    const outdated = getOutdatedStations();
    if (outdated.length > 0) {
        const grouped = {};
        outdated.forEach(item => {
            if (!grouped[item.line]) grouped[item.line] = [];
            grouped[item.line].push(item.station);
        });
        let detailsHtml = '';
        Object.keys(grouped).slice(0, 3).forEach(line => {
            detailsHtml += `<div><b>${line}</b>：${grouped[line].join('、')}</div>`;
        });
        headlineHtml += `<div class="route-outdated-notice">
            <div style="font-size: 14px; margin-bottom: 4px;">检测到官方存在新站点，本地线路图未更新，规划结果可能不是最优：</div>
            <div style="font-weight: 500; font-size: 12px; line-height: 1.6; opacity: 0.9;">${detailsHtml}</div></div>`;
    }

    let hasCtrlLightning = false;
    let hasFutureCtrlLightning = false;
    const now = new Date();
    let nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < 120) nowMin += 1440;

    r.results.forEach(item => {
        if (item.stationWarnings && item.stationWarnings.length > 0) {
            const transferStations = item.interchanges.map(o => o.key.split('|')[0]);
            item.stationWarnings.forEach(w => {
                if (transferStations.includes(w.station)) {
                    hasCtrlLightning = true;
                    const inter = item.interchanges.find(o => o.key.split('|')[0] === w.station);
                    if (inter && inter.timeMin != null && (inter.timeMin - nowMin) >= 60) {
                        hasFutureCtrlLightning = true;
                    }
                }
            });
        }
    });

    if (hasCtrlLightning) {
        const svgHtml = `<svg viewBox="0 0 24 24" class="ctrl-lightning-icon"><path d="M13 2 L5 13 h6 l-1 9 l9 -12 h-6 l1 -8 z" fill="#f59e0b" stroke="#1f2b3c" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
        const futureSvgHtml = hasFutureCtrlLightning ? `<svg viewBox="0 0 24 24" class="ctrl-lightning-icon" style="margin-left:6px;"><path d="M13 2 L5 13 h6 l-1 9 l9 -12 h-6 l1 -8 z" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="2,2"/></svg>` : '';

        let text = '换乘站客控中，请留意车站指引';
        if (hasFutureCtrlLightning) {
            text = '客控中（虚线表示距到达超过1小时，仅供参考）';
        }

        headlineHtml += `<div class="route-ctrl-lightning-hint">
            ${svgHtml}${futureSvgHtml}
            <span>${text}</span>
        </div>`;
    }

    resultsEl.innerHTML = headlineHtml + r.results.map((item, idx) => renderRouteCard(item, idx, item._realStart, item._realEnd, sortMode)).join('');

    if (!localStorage.getItem('gz_route_guide_shown')) {
        const tapEl = resultsEl.querySelector('#route-guide-tap');
        if (tapEl) {
            setTimeout(() => {
                // 10 秒后若依然存在，则自动隐藏
                if (tapEl && tapEl.parentNode) {
                    tapEl.remove();
                    const card = resultsEl.querySelector('.route-card.guide-pulse');
                    if (card) card.classList.remove('guide-pulse');
                    localStorage.setItem('gz_route_guide_shown', '1');
                }
            }, 10000);
        }
    }

    // 绑定结果卡片事件
    _bindRouteCardEvents(resultsEl);
}

/**
 * 抽离结果卡片上的展开/收起等 UI 交互事件
 */
function _bindRouteCardEvents(resultsEl) {
    // 1. 全局捕获地图按钮点击（使用捕获阶段拦截，最稳妥）
    if (!resultsEl.dataset.mapBtnBound) {
        resultsEl.dataset.mapBtnBound = '1';
        resultsEl.addEventListener('click', (e) => {
            const mapBtn = e.target.closest('.route-map-btn');
            if (mapBtn) {
                e.preventDefault();
                e.stopPropagation(); // 阻止卡片展开

                const idx = parseInt(mapBtn.dataset.index, 10);
                const item = (window._currentRouteResults || [])[idx];

                console.log('[地图] 点击查看地图，获取到 item:', item);

                if (item && typeof window.showRouteMap === 'function') {
                    window.showRouteMap(item);
                } else {
                    console.warn('未找到对应的路径数据，或者 showRouteMap 未定义');
                }
            }
        });
    }

    // 2. 原有的卡片展开逻辑，需拦截 map-btn
    resultsEl.querySelectorAll('.route-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // 核心修改：这里加上 .route-map-btn 的拦截，防止点击按钮时触发展开
            if (e.target.closest('.route-guide') ||
                e.target.closest('.route-stations-toggle') ||
                e.target.closest('.route-station-more-btn') ||
                e.target.closest('.route-map-btn')) return;

            if (card.classList.contains('guide-pulse')) {
                card.classList.remove('guide-pulse');
                const tapEl = card.querySelector('.route-guide-tap');
                if (tapEl) tapEl.remove();
                localStorage.setItem('gz_route_guide_shown', '1');
            }

            const isExpanding = !card.classList.contains('expanded');
            card.classList.toggle('expanded');
            if (isExpanding) {
                const routeBody = card.closest('.route-body');
                if (!routeBody) return;
                const preventScroll = (ev) => {
                    ev.preventDefault();
                };
                routeBody.addEventListener('wheel', preventScroll, {passive: false});
                routeBody.addEventListener('touchmove', preventScroll, {passive: false});
                routeBody.style.pointerEvents = 'none';
                const unlock = () => {
                    routeBody.removeEventListener('wheel', preventScroll);
                    routeBody.removeEventListener('touchmove', preventScroll);
                    routeBody.style.pointerEvents = '';
                };
                setTimeout(() => {
                    const bodyRect = routeBody.getBoundingClientRect();
                    const cardRect = card.getBoundingClientRect();
                    const padding = 20;
                    let scrollDistance = 0;
                    if (cardRect.height > bodyRect.height - padding) scrollDistance = (cardRect.top - bodyRect.top) - 10;
                    else if (cardRect.bottom > bodyRect.bottom) scrollDistance = cardRect.bottom - bodyRect.bottom + padding;

                    if (scrollDistance > 5) {
                        routeBody.scrollTo({top: routeBody.scrollTop + scrollDistance, behavior: 'smooth'});
                        setTimeout(unlock, 500);
                    } else {
                        unlock();
                    }
                }, 120);
            }
            setTimeout(saveRouteSession, 100);
        });
    });

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

let _tagTooltipTimer = null;
let _tagTooltipTarget = null;

function showTagTooltip(el, text) {
    let tip = document.getElementById('tag-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'tag-tooltip';
        tip.className = 'tag-tooltip';
        document.body.appendChild(tip);

        // 全局监听滚动，实时更新位置（解决跟着滑的问题）
        // 使用 capture: true 能够监听到 .route-body 内部的滚动
        const updatePos = () => updateTagTooltipPos();
        window.addEventListener('scroll', updatePos, { passive: true, capture: true });
    }

    tip.textContent = text;
    _tagTooltipTarget = el; // 记录当前触发 Tooltip 的元素

    // 强制重绘以触发过渡动画
    tip.classList.remove('show');
    void tip.offsetWidth;
    tip.classList.add('show');

    updateTagTooltipPos(); // 初始化位置

    if (_tagTooltipTimer) clearTimeout(_tagTooltipTimer);
    _tagTooltipTimer = setTimeout(() => {
        tip.classList.remove('show');
        _tagTooltipTarget = null;
    }, 1500);
}

// 独立的位置更新函数
function updateTagTooltipPos() {
    const tip = document.getElementById('tag-tooltip');
    if (!tip || !_tagTooltipTarget || !tip.classList.contains('show')) return;

    // 如果目标元素已经不可见（比如被折叠了），直接隐藏
    const rect = _tagTooltipTarget.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        tip.classList.remove('show');
        return;
    }

    // 根据目标元素的最新位置更新 Tooltip（fixed 定位）
    tip.style.left = (rect.left + rect.width / 2) + 'px';
    tip.style.top = (rect.bottom + 8) + 'px';
}