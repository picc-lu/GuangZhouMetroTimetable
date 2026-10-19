// ========== 路径规划 UI · 规划流程与空结果建议 ==========

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

    const sortRadio = _routeOverlay.querySelector('input[name="route-sort"]:checked');
    const sortMode = sortRadio ? sortRadio.value : 'fastest';
    const departMin = getRouteDepartMin();

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

    // ★ 读取"尽量不走客控中的换乘站"
    let avoidCtrlTransfer = false;
    const acc = _routeOverlay.querySelector('#route-avoid-ctrl-check');
    if (acc && !isTimeFarFromNow()) {
        avoidCtrlTransfer = acc.checked;
    }

    // 读取步行速度
    let walkSpeed = 1.5;
    const wssEl = _routeOverlay.querySelector('#route-walk-speed');
    if (wssEl) {
        const v = parseFloat(wssEl.value);
        if (!isNaN(v) && v > 0) walkSpeed = v;
    }

    if (typeof ROUTE_GRAPH !== 'undefined' && ROUTE_GRAPH.loaded) {
        ROUTE_GRAPH.userWalkSpeed = walkSpeed;
    }

    // 保存偏好
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

    // 把起终点推进历史
    pushRouteHistory('start', start);
    pushRouteHistory('end', end);

    goBtn.disabled = true;
    goBtn.classList.add('loading');
    resultsEl.classList.add('is-loading');
    setRouteMeta('正在计算路径…');

    await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

    try {
        // 先把用户输入的站名规范化（模糊匹配 / 别名 / 去括号）
        await loadRouteGraph();
        const resolvedStartNode = resolveGraphStationNode(start, 'start');
        const resolvedEndNode = resolveGraphStationNode(end, 'end');

        if (!resolvedStartNode) {
            resultsEl.innerHTML = `<div class="route-error">起点「${escapeHtml(start)}」不存在，请检查站名后重试</div>`;
            return;
        }
        if (!resolvedEndNode) {
            resultsEl.innerHTML = `<div class="route-error">终点「${escapeHtml(end)}」不存在，请检查站名后重试</div>`;
            return;
        }

        const displayStart = resolvedStartNode.replace(/\|(开始|结束)$/, '');
        const displayEnd = resolvedEndNode.replace(/\|(开始|结束)$/, '');

        if (displayStart === displayEnd) {
            resultsEl.innerHTML = `<div class="route-error">起点和终点不能相同</div>`;
            return;
        }

        // 反向规划：先算出最晚出发时刻
        let actualDepartMin = departMin;
        let ctrlStationsForPlanner = null; // 传给底层 planner 的站名数组

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
            const found = await findLatestDepartureForArrival(
                displayStart, displayEnd, targetArriveMin, sortMode,
                maxTransferMin, avoidOutOfStation, ctrlStationsForPlanner
            );

            if (found == null) {
                const earliest = Math.max(5 * 60, targetArriveMin - 4 * 60);
                let html = `<div class="route-empty">`;
                html += `<div class="route-empty-title">当前时刻没有可用的路径</div>`;
                html += `<div class="route-empty-detail">`;
                html += `无法在 ${fmtHM(earliest)} ~ ${fmtHM(targetArriveMin)} 之间找到`;
                html += `能于 ${fmtHM(targetArriveMin)} 前到达的路径`;
                html += `</div>`;

                const suggestions = [];
                const later30 = targetArriveMin + 30;
                const later60 = targetArriveMin + 60;
                const LIMIT = 26 * 60;

                if (later30 <= LIMIT) {
                    suggestions.push({ action: 'later-arrive', label: `目标到达延后 30 分钟（${fmtHM(later30)}）`, value: 30 });
                }
                if (later60 <= LIMIT) {
                    suggestions.push({ action: 'later-arrive', label: `目标到达延后 1 小时（${fmtHM(later60)}）`, value: 60 });
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

        // 调用底层规划
        const r = await planRoutes(displayStart, displayEnd, actualDepartMin, sortMode,
            maxTransferMin, avoidOutOfStation, _routeArriveMode, ctrlStationsForPlanner);

        // 票价查询：同一对起终点票价固定，与具体路径无关
        let fare = null;

        // 此时 stationCtrl 已经拉取过了（或者因时间过远为 null）
        if (!r.error && stationCtrl && r.results && r.results.length > 0) {
            r.results.forEach(item => {
                item.stationWarnings = extractStationWarnings(item.path, stationCtrl);
            });
        }

        // 起终点异常提醒（即使没有结果也要提示）
        updateStartEndWarning(stationCtrl, displayStart, displayEnd);

        if (!r.error && r.results && r.results.length > 0) {
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

        // 到达模式：过滤掉到达时间超过目标的路径
        if (_routeArriveMode && r.results && r.results.length > 0) {
            const targetArriveMin = departMin;
            r.results = r.results.filter(item =>
                Math.floor(item.arriveMin) <= targetArriveMin
            );
            if (r.results.length === 0) {
                r.results = [];
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
            const allNoService = rejectedList.length > 0
                && rejectedList.every(x => (x.reason || '').includes('已无运营'));

            if (allNoService) {
                resultsEl.innerHTML = `
                    <div class="route-empty">
                        <div class="route-empty-title">当前时刻已结束运营</div>
                        <div class="route-empty-detail">
                            所选时刻已超出该线路运营时间，请调整出发时间后重试。
                        </div>
                    </div>
                `;
                return;
            }

            resultsEl.innerHTML = `
                <div class="route-empty">
                    <div class="route-empty-title">换乘少的方案时间代价较大</div>
                    <div class="route-empty-detail">
                        已过滤比最优慢 30 分钟以上的换乘少方案，当前没有可用的换乘少路径。
                    </div>
                    <div class="route-suggest-actions">
                        <button type="button" class="route-suggest-btn" data-action="switch-to-fastest">
                            切回最快方案
                        </button>
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

            resultsEl.querySelectorAll('.route-suggest-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyRouteSuggestion(btn.dataset.action, btn.dataset.value);
                });
            });
            return;
        }

        // 渲染图例
        let hasUrgent5 = false;
        let hasUrgent15 = false;

        r.results.forEach(item => {
            (item.boardingMargins || []).forEach(m => {
                if (m != null && m !== 'unknown') {
                    if (m >= 0 && m <= 5) hasUrgent5 = true;
                    else if (m > 5 && m <= 15) hasUrgent15 = true;
                }
            });
        });

        const legendEl = _routeOverlay.querySelector('#route-legend');
        if (legendEl) {
            // 只要有任意一个警告，就显示外框
            legendEl.style.display = (hasUrgent5 || hasUrgent15) ? 'flex' : 'none';
        }

        // 分别控制内部两行的显隐
        const row15El = _routeOverlay.querySelector('#route-legend-row-15');
        if (row15El) row15El.style.display = hasUrgent15 ? 'flex' : 'none';

        const row5El = _routeOverlay.querySelector('#route-legend-row-5');
        if (row5El) row5El.style.display = hasUrgent5 ? 'flex' : 'none';

        const has3LineWarning = r.results.some(item =>
            item.warnings && item.warnings.some(w => w.risky3LineFrom && w.risky3LineTo)
        );
        const legend3LineEl = _routeOverlay.querySelector('#route-legend-3line');
        if (legend3LineEl) legend3LineEl.style.display = has3LineWarning ? 'flex' : 'none';

        let headlineHtml = '';

        // 渲染卡片
        resultsEl.innerHTML = headlineHtml + r.results.map((item, idx) =>
            renderRouteCard(item, idx, displayStart, displayEnd, sortMode)
        ).join('');

        // 卡片展开/收起
        resultsEl.querySelectorAll('.route-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.route-guide')) return;
                if (e.target.closest('.route-stations-toggle')) return;
                if (e.target.closest('.route-station-more-btn')) return;
                card.classList.toggle('expanded');
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