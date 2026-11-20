// ========== 空结果替代方案：附近站点选点与独立结果展示 ==========
// 场景：系统时间（"现在"）查询且无可用路径时，收集终点周边 5km 站点，
// 以同一起点、保守优先逐站规划，用户可在地图上复选可到达站点，
// 结果展示在独立弹层中（不含设置区）。

let _altState = null;              // { start, end, departMin, entries: [{station, dist, item}] }
let _altQueryStart = null;         // 本轮替代规划的起点，供周边站收集排除自身
let _altPickerOverlay = null;
let _altResultOverlay = null;
let _altPickerMap = null;
let _altPickerSelected = new Set();

/**
 * 解析起点真实站名（含临近站别名回退）。
 * 不复用 _getValidStationCombos：该函数会把第二参数当终点做起终同名校验，
 * 这里只需要起点自身的解析结果。
 */
function _resolveAltStart(startName) {
    if (typeof resolveGraphStationNode === 'function' && resolveGraphStationNode(startName, 'start')) {
        return startName;
    }
    const alias = (typeof NEARBY_STATION_MAP !== 'undefined') ? NEARBY_STATION_MAP[startName] : null;
    if (alias && alias !== startName && resolveGraphStationNode(alias, 'start')) return alias;
    return null;
}

/** 收集终点 5km 内的可规划站点（不含终点与起点自身），按距离升序 */
function _collectAltStations(endName, excludeNames) {
    if (typeof STATION_COORDS === 'undefined') return [];
    const target = STATION_COORDS[endName];
    if (!target) return [];
    const [tLng, tLat] = target;
    const out = [];
    for (const [name, coord] of Object.entries(STATION_COORDS)) {
        if (name === endName || excludeNames.has(name)) continue;
        if (typeof isRouteEligibleStation === 'function') {
            const lines = (typeof STATION_INDEX !== 'undefined' && STATION_INDEX[name]) || [];
            if (!isRouteEligibleStation(name, lines)) continue;
        }
        const [lng, lat] = coord;
        const dist = haversineDistance(tLat, tLng, lat, lng);
        if (dist <= 5000) out.push({ station: name, dist });
    }
    out.sort((a, b) => a.dist - b.dist);
    console.log(out)
    return out;
}

/** 以同一起点、保守优先对周边站逐站规划，保留每站第一条结果 */
async function _computeAltPlans(startName, endName, departMin, onProgress) {
    await loadRouteGraph();
    const cfg = _getRoutePlanningOptions();

    const startReal = _resolveAltStart(startName);
    if (!startReal) return [];

    const stations = _collectAltStations(endName, new Set([startName, startReal]));
    if (stations.length === 0) return [];

    let completed = 0;
    const total = stations.length;

    // 并发计算所有周边站点
    const promises = stations.map(async (st) => {
        // 让出主线程，确保进度条能平滑渲染
        await new Promise(r => setTimeout(r, 0));

        try {
            const combo = _getValidStationCombos(startName, st.station);
            if (combo.error || !combo.endCands || combo.endCands.length === 0) {
                completed++;
                if (typeof onProgress === 'function') onProgress(completed, total);
                return null;
            }
            const endReal = combo.endCands[0].real;

            const subR = await planRoutes(startReal, endReal, departMin,
                cfg.sortMode, cfg.maxTransferMin, cfg.avoidOutOfStation, false, null);
            let results = (subR && subR.results) ? subR.results : [];

            if (results.length > 0) _applyWaitRatioToResults(results);
            results = results.filter(x => !x._waitRatioInfeasible);

            completed++;
            if (typeof onProgress === 'function') onProgress(completed, total);

            if (results.length === 0) return null;

            results.forEach(item => {
                item._realStart = startReal;
                item._realEnd = endReal;
                item._mappedStart = startReal !== startName ? `(${startReal})` : '';
                item._mappedEnd = endReal !== st.station ? `(${endReal})` : '';
            });

            return { station: st.station, dist: st.dist, item: results[0] };
        } catch (e) {
            console.warn('[替代方案] 单站规划失败：', st.station, e);
            completed++;
            if (typeof onProgress === 'function') onProgress(completed, total);
            return null;
        }
    });

    const computed = await Promise.all(promises);
    return computed.filter(Boolean);
}

/** 空结果页入口：计算周边站方案并打开选点地图 */
async function startAlternatePlan(startName, endName) {
    if (_isRoutePlanning) return;
    const resultsEl = _routeOverlay ? _routeOverlay.querySelector('#route-results') : null;
    if (!resultsEl) return;
    const btn = resultsEl.querySelector('#route-btn-alternate');
    const defaultLabel = '📍 在附近站点下车（地图选点）';

    if (btn) {
        btn.disabled = true;
        btn.textContent = '正在计算周边站点方案…';
    }

    try {
        const departMin = getRouteDepartMin();

        const entries = await _computeAltPlans(startName, endName, departMin, (current, total) => {
            if (!btn) return;
            // 更新进度文字
            btn.textContent = `正在计算周边站点方案 ${current}/${total}`;

            // 绘制进度条背景：使用半透明绿色填充
            const percent = (current / total) * 100;
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const progressColor = isDark ? 'rgba(34, 197, 94, 0.4)' : 'rgba(22, 101, 52, 0.15)';
            btn.style.backgroundImage = `linear-gradient(to right, ${progressColor} ${percent}%, transparent ${percent}%)`;
        });

        // 恢复按钮初始状态
        if (btn) {
            btn.textContent = defaultLabel;
            btn.style.backgroundImage = '';
        }

        _altState = { start: startName, end: endName, departMin, entries };

        if (entries.length === 0) {
            if (btn && typeof showTagTooltip === 'function') {
                showTagTooltip(btn, '周边暂无可到达终点', 3000);
            }
            return;
        }

        openAltPicker().catch(e => {
            console.error('[替代方案] 打开选点地图失败：', e);
        });

    } catch (e) {
        console.error('[替代方案] 计算失败：', e);
        if (btn) {
            btn.textContent = defaultLabel;
            btn.style.backgroundImage = '';
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ---------- 选点地图弹层 ---------- */
function ensureAltPickerOverlay() {
    if (_altPickerOverlay) return _altPickerOverlay;
    const ov = document.createElement('div');
    ov.className = 'alt-picker-overlay';
    ov.innerHTML = `
        <div class="alt-picker-container">
            <div class="alt-picker-header">
                <button class="alt-picker-exit" type="button">退出</button>
                <span class="alt-picker-title">「<span class="alt-picker-end-name"></span>」周边可用终点站</span>
                <button class="alt-picker-confirm" type="button" disabled>确定</button>
            </div>
            <div class="alt-picker-canvas" id="alt-picker-canvas"></div>
        </div>`;
    document.body.appendChild(ov);
    _altPickerOverlay = ov;
    ov.querySelector('.alt-picker-exit').addEventListener('click', closeAltPicker);
    ov.querySelector('.alt-picker-confirm').addEventListener('click', () => {
        if (!_altState) return;
        const chosen = _altState.entries.filter(en => _altPickerSelected.has(en.station));
        if (chosen.length === 0) return;
        openAltResults(chosen);
    });
    ov.addEventListener('click', (e) => {
        if (e.target === ov) closeAltPicker();
    });
    return ov;
}

async function openAltPicker() {
    const ov = ensureAltPickerOverlay();
    _altPickerSelected = new Set();
    ov.querySelector('.alt-picker-confirm').disabled = true;
    ov.classList.add('show');

    const titleEndEl = ov.querySelector('.alt-picker-end-name');
    if (titleEndEl && _altState) {
        titleEndEl.textContent = _altState.end;
    }

    ov.classList.add('show');

    await loadLeaflet();
    const canvas = ov.querySelector('#alt-picker-canvas');
    canvas.innerHTML = '';

    const endCoord = getStationCoordWithFallback(_altState.end);
    if (!endCoord) return;
    const [cLng, cLat] = gcj02ToWgs84(endCoord[0], endCoord[1]);

    // 禁用手势：不可拖动、不可放缩
    const map = L.map(canvas, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
    });
    _altPickerMap = map;

    const useTileCache = !(typeof IS_TOY_ENV !== 'undefined' && IS_TOY_ENV);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const baseTileUrl = isDark
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    if (useTileCache) {
        initCachedTileLayer();
        await TileCache.init();
        new CachedTileLayer(baseTileUrl, { maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    } else {
        new L.TileLayer(baseTileUrl, { maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    }

    // 视野：先按全部可到达周边站自适应缩放，再把视点锁回原终点（正中央）
    const pts = [[cLat, cLng]];
    _altState.entries.forEach(en => {
        const c = getStationCoordWithFallback(en.station);
        if (c) {
            const [wgsLng, wgsLat] = gcj02ToWgs84(c[0], c[1]);
            pts.push([wgsLat, wgsLng]);
        }
    });
    map.fitBounds(L.latLngBounds(pts).pad(0.18), { animate: false });

    // 原终点：中心参考标记（不可选）
    L.circleMarker([cLat, cLng], {
        radius: 6, color: '#94a3b8', weight: 2, fillColor: '#e2e8f0', fillOpacity: 1, interactive: false,
    }).addTo(map).bindTooltip(
        L.tooltip({ permanent: true, direction: 'top', className: 'alt-station-tip alt-center-tip', offset: [0, -6] })
            .setContent(_altState.end)
    );

    // 可到达周边站：可复选标记，仅显示站点与站名文本
    _altState.entries.forEach(en => {
        const c = getStationCoordWithFallback(en.station);
        if (!c) return;

        const [wgsLng, wgsLat] = gcj02ToWgs84(c[0], c[1]);

        const marker = L.circleMarker([wgsLat, wgsLng], {
            radius: 8, color: '#2b7de9', weight: 2, fillColor: '#ffffff', fillOpacity: 1,
        });

        // 提取选中逻辑，供地图圆圈和文本标签共同使用
        const toggleSelect = (e) => {
            if (e) L.DomEvent.stopPropagation(e);
            if (_altPickerSelected.has(en.station)) _altPickerSelected.delete(en.station);
            else _altPickerSelected.add(en.station);

            const selected = _altPickerSelected.has(en.station);
            marker.setStyle({ fillColor: selected ? '#2b7de9' : '#ffffff' });

            const tipEl = marker.getTooltip() ? marker.getTooltip().getElement() : null;
            if (tipEl) tipEl.classList.toggle('alt-selected', selected);

            ov.querySelector('.alt-picker-confirm').disabled = _altPickerSelected.size === 0;
        };

        marker.bindTooltip(
            L.tooltip({ permanent: true, direction: 'top', className: 'alt-station-tip', offset: [0, -8] })
                .setContent(en.station)
        );

        // 绑定圆圈点击
        marker.on('click', toggleSelect);

        // 绑定文本点击
        marker.on('add', () => {
            const tipEl = marker.getTooltip()?.getElement();
            if (tipEl) {
                L.DomEvent.disableClickPropagation(tipEl);
                tipEl.style.pointerEvents = 'auto'; // 允许鼠标事件
                tipEl.style.cursor = 'pointer';     // 鼠标变小手
                tipEl.addEventListener('click', toggleSelect); // 绑定点击
            }
        });

        marker.addTo(map);
    });

    setTimeout(() => map.invalidateSize(), 60);
}

function closeAltPicker() {
    if (_altPickerOverlay) _altPickerOverlay.classList.remove('show');
    if (_altPickerMap) {
        _altPickerMap.remove();
        _altPickerMap = null;
    }
}

/* ---------- 独立结果弹层（仅结果，无设置区） ---------- */
function ensureAltResultOverlay() {
    if (_altResultOverlay) return _altResultOverlay;
    const ov = document.createElement('div');
    ov.className = 'alt-result-overlay';
    ov.innerHTML = `
        <div class="alt-result-container">
            <div class="alt-result-header">
                <h3>附近下车方案<span class="alt-result-note">原终点：<b class="alt-result-end"></b> · 保守优先</span></h3>
                <button class="alt-result-close" type="button" aria-label="关闭">✕</button>
            </div>
            <div class="alt-result-body" id="alt-result-body"></div>
        </div>`;
    document.body.appendChild(ov);
    _altResultOverlay = ov;
    ov.querySelector('.alt-result-close').addEventListener('click', closeAltResults);
    return ov;
}

function openAltResults(chosen) {
    closeAltPicker();
    const ov = ensureAltResultOverlay();
    ov.querySelector('.alt-result-end').textContent = _altState.end;

    const body = ov.querySelector('#alt-result-body');
    window._currentRouteResults = chosen.map(c => c.item);

    body.innerHTML = chosen.map((c, idx) => {
        c.item.rank = idx + 1;
        const distStr = c.dist < 1000
            ? `${Math.round(c.dist)} m`
            : `${(c.dist / 1000).toFixed(1)} km`;
        return `<div class="alt-result-item">
            <div class="alt-result-item-head">
                <span class="alt-result-station">📍 ${escapeHtml(c.station)}</span>
                <span class="alt-result-dist">距原终点直线约 ${distStr}</span>
            </div>
            ${renderRouteCard(c.item, idx, c.item._realStart, c.item._realEnd, 'conservative')}
        </div>`;
    }).join('') + `
        <div class="route-footer-notice">
            <div>「候车」指已在站台等待列车</div>
            <div>时长包括平均等车、列车行驶、停站、换乘时长</div>
            <div>规划到达时间仅供参考</div>
        </div>`;

    _bindRouteCardEvents(body);
    ov.classList.add('show');
}

function closeAltResults() {
    if (_altResultOverlay) _altResultOverlay.classList.remove('show');
}
