// ========== 路径规划 UI · 结果卡片渲染 ==========

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

function formatDelta(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0) return `${r}秒`;
    if (r === 0) return `${m}分`;
    return `${m}分${r}秒`;
}

function renderRouteSegmentsHtml(path, boardingMargins, has3LineWarning) {
    const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(path) : [];
    if (segs.length === 0) return '';
    const margins = boardingMargins || [];

    return `<span class="route-segments">` + segs.map((s, i) => {
        const m = margins[i];
        const isExtremeUrgent = (m != null && m !== 'unknown' && m >= 0 && m <= 5);
        const isUrgent = (m != null && m !== 'unknown' && m > 5 && m <= 15);
        const is3LineWarn = has3LineWarning && s.fullLine === '3号线';

        let urgentSvg = '';
        if (isExtremeUrgent) {
            // 小于 5 分钟：红色实心警告
            urgentSvg = `<svg class="route-segment-warn" viewBox="0 0 24 24" aria-hidden="true">
                   <circle cx="12" cy="12" r="10" fill="#dc2626"/>
                   <line x1="12" y1="7" x2="12" y2="13" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.5" fill="#ffffff"/>
               </svg>`;
        } else if (isUrgent) {
            // 小于 15 分钟：黄色三角形警告
            urgentSvg = `<svg class="route-segment-warn" viewBox="0 0 24 24" aria-hidden="true">
                   <path d="M12 2 L22 20 L2 20 Z" fill="#f59e0b" stroke="#1f2b3c" stroke-width="1.8" stroke-linejoin="round"/>
                   <line x1="12" y1="9" x2="12" y2="14" stroke="#1f2b3c" stroke-width="2.2" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.2" fill="#1f2b3c"/>
               </svg>`;
        }

        const warn3Svg = is3LineWarn
            ? `<svg class="route-segment-warn-3line" viewBox="0 0 24 24" aria-hidden="true">
                   <circle cx="12" cy="12" r="10" fill="#dc2626"/>
                   <line x1="12" y1="7" x2="12" y2="13"
                         stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.5" fill="#ffffff"/>
               </svg>`
            : '';

        const badge = `<span class="route-segment-badge${(isUrgent || isExtremeUrgent) ? ' urgent' : ''}${is3LineWarn ? ' warn-3line' : ''}"
                            style="background:${s.color}; color:${s.textColor};">
                            ${escapeHtml(s.shortName)}${urgentSvg}${warn3Svg}
                       </span>`;
        return i === 0 ? badge : `<span class="route-seg-arrow">→</span>${badge}`;
    }).join('') + `</span>`;
}

/* ==========================================
   站点列表：默认折叠，超过阈值才显示切换按钮
   ========================================== */
const STATION_LIST_COLLAPSE_THRESHOLD = 12;
const STATION_LIST_HEAD = 4;
const STATION_LIST_TAIL = 4;

function buildStationListHtml(startName, endName, stationRoute) {
    const totalStations = stationRoute.length + 2;

    const fullHtml = `
        <span class="route-station">${escapeHtml(startName)}</span>
        ${stationRoute.map(s =>
        `<span class="route-arrow">→</span><span class="route-station">${escapeHtml(s)}</span>`
    ).join('')}
        <span class="route-arrow">→</span><span class="route-station">${escapeHtml(endName)}</span>
    `;

    if (totalStations <= STATION_LIST_COLLAPSE_THRESHOLD) {
        return `<div class="route-stations">${fullHtml}</div>`;
    }

    const head = stationRoute.slice(0, STATION_LIST_HEAD);
    const tail = stationRoute.slice(-STATION_LIST_TAIL);
    const hiddenCount = stationRoute.length - STATION_LIST_HEAD - STATION_LIST_TAIL;

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
   3 号线主线南段站序（从北到南，索引递增 = 南向）
   ========================================== */
const LINE3_SOUTH_ORDER = [
    '体育西路', '珠江新城', '广州塔', '客村', '大塘', '沥滘', '厦滘',
    '大石', '汉溪长隆', '市桥', '番禺广场', '傍江', '石碁南', '海涌路', '海傍'
];

/* ==========================================
   3 号线北段站序（从南到北，索引递增 = 北向）
   ========================================== */
const LINE3_NORTH_ORDER = [
    '体育西路', '林和西', '广州东站', '燕塘', '梅花园', '京溪南方医院',
    '同和', '永泰', '白云大道北', '嘉禾望岗', '龙归', '人和', '高增',
    '机场南', '机场北（T2）'
];

/* ==========================================
   判断某站是否属于 3 号线北段（含体育西路特判）
   ========================================== */
function _isLine3NorthStation(station) {
    if (station === '体育西路') return true;
    if (typeof LINE3_NORTH_STATIONS === 'undefined') return false;
    if (LINE3_NORTH_STATIONS.has(station)) return true;
    if (station === '机场北' && LINE3_NORTH_STATIONS.has('机场北（T2）')) return true;
    return false;
}

/**
 * 计算路径在 station 站的 boarding 时刻（分钟）。
 * 从路径起点 (_routeActiveDepartMin) 开始，沿 path.nodes 累加各边权重，
 * 直到遇到 station 在该线路上的第一个"站台"节点。
 *
 * 若 station 就是起点 → 返回值等于 _routeActiveDepartMin。
 * 用于判断末班车时，应使用"在本站的 boarding 时刻"，而不是整个路径的出发时刻。
 */
function getBoardingTimeAtStation(path, station, lineName) {
    const normLine = (n) => {
        if (n === '3号线北') return '3号线';
        if (n === '佛山3号线北') return '佛山3号线';
        return n;
    };
    const targetLine = normLine(lineName);

    let t = (_routeActiveDepartMin != null) ? _routeActiveDepartMin : 0;

    for (let i = 0; i < path.nodes.length - 1; i++) {
        const v = path.nodes[i + 1];
        const vParts = v.split('|');

        // 到达目标线路、目标站的"站台"节点 → 该时刻即 boarding 时刻
        if (vParts.length >= 4
            && normLine(vParts[0]) === targetLine
            && isSameStation(vParts[1], station)
            && vParts[3] === '站台') {
            const w = routeGetEdgeWeight(path.nodes[i], v);
            if (w != null) t += w / 60;
            return t;
        }

        const w = routeGetEdgeWeight(path.nodes[i], v);
        if (w != null) t += w / 60;
    }
    return t;
}

/* ==========================================
   从路径中提取指定线路、指定站的上车方向
   ========================================== */
function getSegmentDirection(path, station, lineName, forcedEnd = null) {
    if (!lineName || !path || !path.nodes) return null;

    if (lineName === '11号线') {
        return get11LineDirectionFromPath(path, station);
    }

    // 1. 读原始方向字段（兼容 3号线 / 3号线北）
    const normLine = (n) => {
        if (n === '3号线北') return '3号线';
        if (n === '佛山3号线北') return '佛山3号线';
        return n;
    };
    const targetLine = normLine(lineName);

    // 1a. 先找到该站在路径中的第一个"站台"节点
    let stationPlatformIdx = -1;
    for (let i = 0; i < path.nodes.length; i++) {
        const parts = path.nodes[i].split('|');
        if (parts.length >= 4
            && normLine(parts[0]) === targetLine
            && isSameStation(parts[1], station)
            && parts[3] === '站台') {
            stationPlatformIdx = i;
            break;
        }
    }
    if (stationPlatformIdx < 0) return null;

    // 1b. 从站台节点往后，找"下一个不同站的到站"节点，取它的方向字段。
    //     原因：换乘大站（如体育西路）有多个方向的站台节点，
    //     单纯取第一个匹配的"站台"可能取到错误方向。
    //     而"下一站到站"的方向字段准确反映了列车本段实际运行方向。
    let rawDirection = null;
    for (let i = stationPlatformIdx + 1; i < path.nodes.length; i++) {
        const parts = path.nodes[i].split('|');
        if (parts.length >= 4
            && normLine(parts[0]) === targetLine
            && !isSameStation(parts[1], station)
            && parts[3] === '到站') {
            rawDirection = parts[2];
            break;
        }
    }
    // 1c. 兜底：若无下一站到站节点（如该站就是本线终点），用站台自身的方向
    if (!rawDirection) {
        const parts = path.nodes[stationPlatformIdx].split('|');
        rawDirection = parts[2];
    }
    if (!rawDirection) return null;

    // ★ 用"在该站的 boarding 时刻"判断末班车是否仍运营，而不是整个路径的出发时刻
    // 例：用户在 23:05 出发，23:16 才到石壁，用 23:05 判断会误以为还能赶上 23:08 的末班车
    const currentMin = getBoardingTimeAtStation(path, station, lineName);

    /* ============================================================
       3 号线 · 四个方向的专用分支
       ============================================================ */

    const isL3 = (lineName === '3号线' || lineName === '3号线北');
    const inSouth = (typeof LINE3_MAIN_SOUTH !== 'undefined')
        && LINE3_MAIN_SOUTH.has(station);
    const inNorth = _isLine3NorthStation(station);

    // ---------- 分支 A：南段北向（珠江新城~海傍 → 往北） ----------
    if (isL3 && inSouth && !inNorth
        && (rawDirection.includes('机场北') || rawDirection.includes('体育西路'))) {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);

        // ★ 新增：如果终点在支线，只能坐“天河客运站方向”的车
        const LINE3_BRANCH_STATIONS_LOCAL = new Set([
            '石牌桥', '岗顶', '华师', '五山', '天河客运站'
        ]);
        if (segEnd && LINE3_BRANCH_STATIONS_LOCAL.has(segEnd)) {
            return '天河客运站方向';
        }

        const arr3 = (typeof LINE_STATIONS !== 'undefined' && LINE_STATIONS['3号线']) || [];
        const idxSegEnd = findStationIndex(arr3, segEnd);
        const idxTyxl   = findStationIndex(arr3, '体育西路');
        const notCrossTyx = idxSegEnd >= 0 && idxTyxl >= 0 && idxSegEnd <= idxTyxl;

        // 👇 新增：判断当前时刻是否还有开往机场北方向的贯通车 👇
        const hasThrough = typeof isThroughTrainAvailable === 'function'
            && isThroughTrainAvailable(station, currentMin);

        if (notCrossTyx) {
            // 如果目的地未越过体育西路（比如就是去体育西路），
            // 如果有贯通车，两个方向都能上；如果没有贯通车，只能上往天河客运站的车。
            if (hasThrough) {
                return '机场北 / 天河客运站方向';
            } else {
                return '天河客运站方向';
            }
        }

        // 如果目的地越过了体育西路（去往北段），只有贯通车能到
        if (hasThrough) {
            return '机场北方向';
        }

        // 兜底：没有贯通车了，返回原始映射
        const resolved = resolveJavaDirectionToWeb(lineName, station, rawDirection);
        return resolved.dir;
    }

    // ---------- 分支 B：南段南向（体育西路~汉溪长隆 → 往南） ----------
    if (isL3 && (inSouth || station === '体育西路')
        && (rawDirection.includes('海傍') || rawDirection.includes('体育西路'))) {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);
        const SOUTH_TERMINALS = ['大石', '番禺广场', '海傍'];
        const idxSegEnd = LINE3_SOUTH_ORDER.indexOf(segEnd);

        if (idxSegEnd >= 0) {
            const targets = SOUTH_TERMINALS.filter(t => {
                const idx = LINE3_SOUTH_ORDER.indexOf(t);
                return idx >= idxSegEnd;
            });
            if (targets.length > 0) return targets.join(' / ') + '方向';
        }
        // 如果没有匹配到具体的南段终点，或者未越过体育西路，返回完整的南向终点列表
        return SOUTH_TERMINALS.join(' / ') + '方向';
    }

    // ---------- 分支 C：北段北向（体育西路~机场北 → 往北） ----------
    // 白天有全程车（终点机场北），晚间可能有短线车（终点同和 / 嘉禾望岗）。
    if (isL3 && inNorth && !inSouth
        && rawDirection.includes('机场北')) {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);
        const idxSegEnd = findStationIndex(LINE3_NORTH_ORDER, segEnd);
        if (idxSegEnd >= 0) {
            const NORTH_TERMINALS = ['机场北（T2）', '嘉禾望岗', '同和'];
            const targets = NORTH_TERMINALS.filter(t => {
                const idx = findStationIndex(LINE3_NORTH_ORDER, t);
                return idx >= idxSegEnd;
            });
            if (targets.length > 0) return targets.join(' / ') + '方向';
        }
        return '机场北（T2） / 嘉禾望岗 / 同和方向';
    }

    // ---------- 分支 D：北段南向（机场北~广州东站 → 往南） ----------
    // Web 数据里 3号线北 的南向终点只写"体育西路"，
    // 但实际有列车继续开到 大石 / 番禺广场 / 海傍。
    if (isL3 && inNorth && !inSouth
        && (rawDirection.includes('体育西路') || rawDirection.includes('海傍'))) {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);

        // ★ 新增：如果本段目的地就是体育西路，说明不再继续往南，直接返回
        if (segEnd === '体育西路') {
            return '体育西路方向';
        }

        // 目的地仍在北段内 → 全部南向终点都可到达
        const arrNorth = (typeof LINE_STATIONS !== 'undefined' && LINE_STATIONS['3号线北']) || [];
        const idxSegEndNorth = findStationIndex(arrNorth, segEnd);
        if (idxSegEndNorth >= 0) {
            return '体育西路 / 大石 / 番禺广场 / 海傍方向';
        }
        // 目的地在南段 → 按 SOUTH_ORDER 过滤
        const SOUTH_TERMINALS = ['体育西路', '大石', '番禺广场', '海傍'];
        const idxSegEnd = LINE3_SOUTH_ORDER.indexOf(segEnd);
        if (idxSegEnd >= 0) {
            const targets = SOUTH_TERMINALS.filter(t => {
                const idx = LINE3_SOUTH_ORDER.indexOf(t);
                return idx >= idxSegEnd;
            });
            if (targets.length > 0) return targets.join(' / ') + '方向';
        }
        return SOUTH_TERMINALS.join(' / ') + '方向';
    }

    /* ============================================================
       通用逻辑：Java→Web 映射 + dirArray 匹配
       ============================================================ */

    let mappedDir = rawDirection;
    let dataLine = lineName;
    if (lineName === '3号线' || lineName === '3号线北') {
        const resolved = resolveJavaDirectionToWeb(lineName, station, rawDirection);
        mappedDir = resolved.dir;
        dataLine = resolved.line;
    }

    let lineData = (typeof lineDirectionTime !== 'undefined')
        ? lineDirectionTime[dataLine] : null;
    let stationData = lineData && lineData[station];
    let lineStations = (typeof LINE_STATIONS !== 'undefined' && LINE_STATIONS[dataLine]) || [];

    if ((!stationData || lineStations.length === 0)
        && typeof getLineAliases === 'function') {
        for (const ln of getLineAliases(lineName)) {
            const d = (typeof lineDirectionTime !== 'undefined') && lineDirectionTime[ln]?.[station];
            const arr = (typeof LINE_STATIONS !== 'undefined') && LINE_STATIONS[ln];
            if (d && arr && arr.length > 0) {
                stationData = d;
                lineStations = arr;
                break;
            }
        }
    }

    if (!stationData || lineStations.length === 0) return mappedDir;

    const segmentEnd = getSegmentEndStation(path, station, lineName);
    if (!segmentEnd) return mappedDir;

    const dirName = mappedDir.replace(/方向$/, '');
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
    if (!dirArray || dirArray.length === 0) return mappedDir;

    const idxStation = findStationIndex(lineStations, station);
    const idxEnd     = findStationIndex(lineStations, segmentEnd);
    if (idxStation < 0 || idxEnd < 0) return mappedDir;

    if (currentMin == null) return mappedDir;

    const isForward = idxEnd > idxStation;
    const coveringTerminals = [];
    const seen = new Set();

    if (isForward) {
        for (let i = lineStations.length - 1; i >= idxEnd; i--) {
            const cand = lineStations[i];
            if (seen.has(cand)) continue;
            const candStrip = cand.replace(/[（(][^）)]*[）)]/g, '');
            const hasService = dirArray.some(t =>
                (t.to || '').replace(/[（(][^）)]*[）)]/g, '') === candStrip
                && currentMin <= t.last
            );
            if (hasService) {
                coveringTerminals.push(cand);
                seen.add(cand);
            }
        }
    } else {
        for (let i = 0; i <= idxEnd; i++) {
            const cand = lineStations[i];
            if (seen.has(cand)) continue;
            const candStrip = cand.replace(/[（(][^）)]*[）)]/g, '');
            const hasService = dirArray.some(t =>
                (t.to || '').replace(/[（(][^）)]*[）)]/g, '') === candStrip
                && currentMin <= t.last
            );
            if (hasService) {
                coveringTerminals.push(cand);
                seen.add(cand);
            }
        }
    }

    // ★ 新增：追加短路车终点（只要方向一致且能覆盖当前路径）
    if (typeof getShortServicesOfLine === 'function') {
        const shortServices = getShortServicesOfLine(lineName);
        for (const svc of shortServices) {
            const idxSvcStart = findStationIndex(lineStations, svc.start);
            const idxSvcEnd = findStationIndex(lineStations, svc.end);
            if (idxSvcStart >= 0 && idxSvcEnd >= 0) {
                const svcIsForward = idxSvcEnd > idxSvcStart;
                // 只有当运行方向与用户方向一致时才有效
                if (svcIsForward === isForward) {
                    // 短线车必须能覆盖用户的乘车区间（即短线终点在用户终点之后/同站）
                    if ((isForward && idxSvcEnd >= idxEnd) || (!isForward && idxSvcEnd <= idxEnd)) {
                        const cand = svc.end;
                        if (!seen.has(cand)) {
                            coveringTerminals.push(cand);
                            seen.add(cand);
                        }
                    }
                }
            }
        }
    }

    if (coveringTerminals.length === 0) return mappedDir;

    return coveringTerminals.join(' / ') + '方向';
}

/** 从 path 里，从 startStation 开始、到离开「原始线路」为止的最后一个站名 */
function getSegmentEndStation(path, startStation, lineName) {
    let foundStart = false;
    let lastStation = null;

    // 归并：3号线北 视同 3号线（仅用于判断"是否同属 3 号线系统"）
    const normLine = (n) => {
        if (n === '3号线北') return '3号线';
        if (n === '佛山3号线北') return '佛山3号线';
        return n;
    };
    const targetLine = normLine(lineName);

    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;

        if (normLine(parts[0]) !== targetLine) {
            if (foundStart) break;
            continue;
        }

        const st = parts[1];
        if (st === '开始' || st === '结束') continue;

        if (!foundStart) {
            if (isSameStation(st, startStation)) {
                foundStart = true;
                lastStation = st;
            }
        } else {
            if (!isSameStation(st, lastStation)) lastStation = st;
        }
    }

    return lastStation;
}

/**
 * 11 号线是环线，原始方向字段只有「外环」「内环」。
 * 根据当前时刻判断：
 *   - 全程车还在运营 → 保持「往外环」/「往内环」
 *   - 全程已收、区间车还在 → 显示区间终点「往龙潭」/「往赤沙」
 *   - 都停了 → 保持原始方向
 */
function get11LineDirectionFromPath(path, startStation) {
    let rawDir = null;
    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length >= 4
            && parts[0] === '11号线'
            && isSameStation(parts[1], startStation)
            && parts[3] === '站台') {
            rawDir = parts[2];
            break;
        }
    }
    if (!rawDir) return null;

    const data = (typeof lineDirectionTime !== 'undefined')
        ? lineDirectionTime['11号线']?.[startStation] : null;
    if (!data) return rawDir;

    const currentMin = getBoardingTimeAtStation(path, startStation, '11号线');

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
        return rawDir;
    }
    if (terminalActive) {
        return terminalEnd + '方向';
    }
    return rawDir;
}

/** 把 "芳村方向" 格式化成 "往芳村" */
function formatDirectionText(direction) {
    if (!direction) return '';
    const name = direction.replace(/方向$/, '');
    return `<span class="route-guide-direction">往${escapeHtml(name)}</span>`;
}

/**
 * 直达路径的乘车方向文案，如"往龙潭"、"往外环"、"往机场北"。
 * 取路径第一段的线路 + 起点站，交给 getSegmentDirection 处理。
 * 若无法判定，返回空串（上层会回退为"直达"）。
 */
function getDirectDirectionText(path, startName) {
    if (!path || !path.nodes) return '';
    const segs = (typeof parseRouteSegments === 'function')
        ? parseRouteSegments(path) : [];
    if (segs.length === 0) return '';

    const firstSeg = segs[0];
    const dir = getSegmentDirection(path, startName, firstSeg.fullLine);
    if (!dir) return '';

    const name = dir.replace(/方向$/, '');
    return name ? `往${name}` : '';
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

/**
 * 生成卡片右侧的时间块。
 *  - 出发模式：单行"xx:xx 到达"
 *  - 到达模式：两行"xx:xx 候车 / xx:xx 到达"（候车时刻取自全局建议出发时刻）
 */
function buildArriveBlockHtml(item) {
    const arriveTime = fmtHM(item.arriveMin);

    if (_routeArriveMode && _routeLastArrivedAt != null) {
        const boardingTime = fmtHM(_routeLastArrivedAt);
        return `
            <div class="route-arrive">
                <div class="route-arrive-line">
                    <span class="route-arrive-time">${boardingTime}</span>
                    <span class="route-arrive-label">候车</span>
                </div>
                <div class="route-arrive-line">
                    <span class="route-arrive-time">${arriveTime}</span>
                    <span class="route-arrive-label">到达</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="route-arrive">
            <div class="route-arrive-time">${arriveTime}</div>
            <div class="route-arrive-label">到达</div>
        </div>
    `;
}

function renderRouteCard(item, idx, startName, endName, sortMode = 'fastest') {
    const rank = item.rank || (idx + 1);
    const transferStations = item.interchanges.map(o => o.key.split('|')[0]).filter(Boolean);

    let deltaHtml = '';
    if (sortMode === 'fewer-transfers'
        && item.deltaFromFastest != null
        && item.deltaFromFastest > 0) {
        deltaHtml = `<span class="route-delta">比最快优先慢 ${formatDelta(item.deltaFromFastest)}</span>`;
    }

    // 换乘路径：显示换乘站；直达路径：显示乘车方向（如"往龙潭"）
    let transferText;
    if (transferStations.length > 0) {
        transferText = transferStations.join(' · ');
    } else {
        const directDir = getDirectDirectionText(item.path, startName);
        transferText = directDir || '直达';
    }

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

    // 车站管制警告：按类型分组，每类一行
    let stationCtrlHtml = '';
    if (item.stationWarnings && item.stationWarnings.length > 0) {
        const grouped = new Map();
        for (const w of item.stationWarnings) {
            if (!grouped.has(w.typeText)) grouped.set(w.typeText, []);
            grouped.get(w.typeText).push(w.station);
        }

        stationCtrlHtml = `<div class="route-station-ctrl">` +
            [...grouped.entries()].map(([typeText, stations]) => {
                const list = stations.map(s => escapeHtml(s)).join(' · ');
                return `<div class="route-station-ctrl-item">
                    <span class="route-station-ctrl-icon">⛔</span>
                    <span class="route-station-ctrl-text">
                        <b>${escapeHtml(typeText)}</b>
                        <span class="route-station-ctrl-count">${stations.length} 站</span>
                        ${list}
                    </span>
                </div>`;
            }).join('') +
            `</div>`;
    }

    // ---- 换乘指引 ----
    const segs = (typeof parseRouteSegments === 'function')
        ? parseRouteSegments(item.path) : [];

    // 检测 3→3 虚拟换乘
    const virtualSplitAfter = new Set();
    const LINE3_BRANCH_STATIONS_LOCAL = new Set([
        '石牌桥', '岗顶', '华师', '五山', '天河客运站'
    ]);

    for (let i = 0; i < segs.length - 1; i++) {
        if (segs[i].fullLine === '3号线'
            && segs[i + 1].fullLine === '3号线'
            && segs[i].toStation === '体育西路') {

            // 如果下一段去往的是支线，说明是同一趟车继续开，不需要虚拟换乘
            const nextSeg = segs[i + 1];
            const isToBranch = LINE3_BRANCH_STATIONS_LOCAL.has(nextSeg.toStation);

            if (!isToBranch) {
                virtualSplitAfter.add(i);
            }
        }
    }

    let guideHtml;
    if (item.interchanges.length === 0 && virtualSplitAfter.size === 0) {
        const startMargin = (item.boardingMargins && item.boardingMargins.length > 0
            && item.boardingMargins[0] != null
            && item.boardingMargins[0] !== 'unknown')
            ? Math.round(item.boardingMargins[0]) : null;

        let marginHtml = '';
        if (startMargin !== null && startMargin >= 0 && startMargin <= 15) {
            const m = Math.round(startMargin);
            const text = m === 0 ? '即将结束运营' : `剩${m}分`;
            marginHtml = `<span class="route-guide-margin urgent">${text}</span>`;
        }

        guideHtml = `<div class="route-guide">
            <div class="route-guide-empty">
                <span>✓ 直达，无需换乘</span>
                ${marginHtml}
            </div>
        </div>`;
    } else {
        const boardingPoints = [];
        const firstSeg = segs[0] || null;
        const firstDir = firstSeg
            ? getSegmentDirection(item.path, startName, firstSeg.fullLine, firstSeg.toStation)
            : null;

        boardingPoints.push({
            station: startName,
            fromShort: null,
            toShort: firstSeg ? firstSeg.shortName : null,
            fullLine: firstSeg ? firstSeg.fullLine : null,
            direction: firstDir,
            note: null,
            door: null,
            timeMin: null,
            walkMin: null,
            boardingTime: null,
            marginMin: item.startMargin,
            interchangeIdx: null,
            isVirtual3to3: false,
        });

        let interchangeCursor = 0;
        for (let si = 0; si < segs.length - 1; si++) {
            if (virtualSplitAfter.has(si)) {
                // ★ 虚拟 3→3 换乘：根据下一段的目的地判断方向
                //   北段（林和西/广州东站/机场北等）→ 北向终点
                //   支线（石牌桥/岗顶/华师/五山/天河客运站）→ 天河客运站
                //   南段（珠江新城/番禺广场/海傍等）→ 海傍
                const nextSeg = segs[si + 1];
                const nextTo = nextSeg ? nextSeg.toStation : null;

                // 3号线支线站集合
                const LINE3_BRANCH_STATIONS_LOCAL = new Set([
                    '石牌桥', '岗顶', '华师', '五山', '天河客运站'
                ]);

                // 判断目的地所属段
                let virtualDir = '大石 / 番禺广场 / 海傍方向';
                if (nextTo) {
                    const inNorth = (typeof LINE3_NORTH_STATIONS !== 'undefined')
                        && (LINE3_NORTH_STATIONS.has(nextTo)
                            || (nextTo === '机场北' && LINE3_NORTH_STATIONS.has('机场北（T2）')));
                    const inBranch = LINE3_BRANCH_STATIONS_LOCAL.has(nextTo);

                    if (inNorth) {
                        virtualDir = '机场北（T2） / 嘉禾望岗 / 同和方向';
                    } else if (inBranch) {
                        virtualDir = '天河客运站方向';
                    } else {
                        virtualDir = '大石 / 番禺广场 / 海傍方向';
                    }
                }

                boardingPoints.push({
                    station: '体育西路',
                    fromShort: '3',
                    toShort: '3',
                    fullLine: '3号线',
                    lineShort: null,
                    direction: virtualDir,
                    note: null,
                    door: null,
                    timeMin: null,
                    walkMin: null,
                    boardingTime: null,
                    marginMin: null,
                    interchangeIdx: null,
                    isVirtual3to3: true,
                });
                continue;
            }

            const o = item.interchanges[interchangeCursor];
            if (o) {
                const g = ROUTE_GRAPH.guides.get(o.key);
                const parts = o.key.split('|');
                const toLine   = g ? g.toLine   : parts[3];
                const toStation = g ? g.station : parts[0];

                boardingPoints.push({
                    station: toStation,
                    fromShort: routeShortLineName(g ? g.fromLine : parts[1]),
                    toShort:   routeShortLineName(toLine),
                    fullLine:  toLine,
                    lineShort: null,
                    direction: getSegmentDirection(item.path, toStation, toLine, segs[si+1] ? segs[si+1].toStation : null),
                    note: g && g.detail ? g.detail : null,
                    door: null,
                    timeMin: o.timeMin,
                    walkMin: o.walkMin,
                    boardingTime: o.boardingTime,
                    marginMin: o.marginMin,
                    interchangeIdx: interchangeCursor,
                    isVirtual3to3: false,
                });
            }
            interchangeCursor++;
        }

        // ---- 门号填充 ----
        for (let i = 0; i < boardingPoints.length - 1; i++) {
            const bp = boardingPoints[i];
            const nextBp = boardingPoints[i + 1];

            if (nextBp.isVirtual3to3) {
                bp.door = '2\\3\\6\\10\\11\\16\\19';
                continue;
            }

            if (typeof nextBp.interchangeIdx === 'number' && nextBp.interchangeIdx !== null) {
                const o = item.interchanges[nextBp.interchangeIdx];
                if (o) {
                    const g = ROUTE_GRAPH.guides.get(o.key);
                    if (g && g.screenDoors && g.screenDoors.length > 0) {
                        bp.door = formatScreenDoorsRange(g.screenDoors);
                    }
                }
            }
        }

        // ---- 渲染 ----
        guideHtml = `<div class="route-guide">` + boardingPoints.map((bp, bpIdx) => {
            const stationHtml = `<span class="route-guide-station">${escapeHtml(bp.station)}</span>`;

            // 提取线路文本
            const baseLineText = bp.fromShort ? `${bp.fromShort}→${bp.toShort}` : bp.toShort;
            // 提取方向文本（去掉“方向”二字）
            const dirName = bp.direction ? bp.direction.replace(/方向$/, '') : '';

            let changeHtml = '';
            let dirHtml = '';
            const noteHtml = bp.note ? `<span class="route-guide-note">${escapeHtml(bp.note)}</span>` : '';
            const doorHtml = bp.door ? `<span class="route-guide-doors">门 ${escapeHtml(bp.door)}</span>` : '';

            // 核心逻辑：无论是否有备注，线路和方向始终分开显示，不再合并
            changeHtml = `<span class="route-guide-change">${escapeHtml(baseLineText)}</span>`;
            if (dirName) {
                dirHtml = `<span class="route-guide-direction">往${escapeHtml(dirName)}</span>`;
            }

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
                    const text = m === 0 ? '即将结束运营' : `剩${m}分`;
                    marginStr = `<span class="route-guide-margin urgent">${text}</span>`;
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
                    ${dirHtml}
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
                            <span>${item.stationRoute.length + 2} 站</span>
                            <span>🚏 ${escapeHtml(transferText)}</span>
                            ${item.fare != null ? `<span class="route-fare">¥${item.fare}</span>` : ''}
                            ${deltaHtml}
                        </div>
                </div>
                ${buildArriveBlockHtml(item)}
            </div>
            <div class="route-detail">
                ${warningHtml}
                ${stationCtrlHtml}
                ${guideHtml}
                ${buildStationListHtml(startName, endName, item.stationRoute)}
            </div>
        </div>
    `;
}