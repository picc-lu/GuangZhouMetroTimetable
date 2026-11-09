// ========== 路径规划 UI · 结果卡片渲染 ==========

const formatDisplayStation = formatStationForDisplay;

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

function renderRouteSegmentsHtml(path, boardingMargins, has3LineWarning, ctrlStations = null, virtual3to3Margin = null, interchanges = null) {
    const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(path) : [];
    if (segs.length === 0) return '';
    const margins = boardingMargins || [];

    const now = new Date();
    let nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < 120) nowMin += 1440;

    let marginCursor = 0;

    return `<span class="route-segments" style="display: inline-flex; align-items: center; flex-wrap: wrap; gap: 2px;">` + segs.map((s, i) => {
        let m = null;

        // 只在起点和真实跨线换乘时，才消耗一个余量
        if (i === 0) {
            m = margins[marginCursor++];
        } else {
            const prevSeg = segs[i - 1];
            if (prevSeg.fullLine !== s.fullLine) {
                m = margins[marginCursor++];
            } else if (s.fullLine === '3号线' && prevSeg.toStation === '体育西路') {
                // 如果是 3->3 虚拟换乘，使用传入的虚拟换乘余量
                m = virtual3to3Margin;
            }
        }

        const isExtremeUrgent = (m != null && m !== 'unknown' && m >= 0 && m <= 10);
        const isUrgent = (m != null && m !== 'unknown' && m > 10 && m <= 20);
        const is3LineWarn = has3LineWarning && s.fullLine === '3号线';

        let urgentSvg = '';
        if (isExtremeUrgent) {
            // 0-10分钟：圆形，动态黄到红渐变
            let bgColor = '#dc2626';
            let lineColor = '#ffffff'; // 默认白色

            if (m != null && m !== 'unknown') {
                const ratio = Math.max(0, Math.min(m, 10)) / 10;
                const g = Math.round(221 * ratio); // #DD 是 221
                bgColor = `rgb(255, ${g}, 0)`;

                // 如果剩余时间 > 5分钟，感叹号用深色；<= 5分钟用白色
                lineColor = (m <= 5) ? '#ffffff' : '#1f2b3c';
            }

            urgentSvg = `<svg class="route-segment-warn" viewBox="0 0 24 24" aria-hidden="true">
                   <circle cx="12" cy="12" r="10" fill="${bgColor}"/>
                   <line x1="12" y1="7" x2="12" y2="13" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.5" fill="${lineColor}"/>
               </svg>`;
        } else if (isUrgent) {
            // 10-20分钟：正三角，无感叹号
            urgentSvg = `<svg class="route-segment-warn route-segment-warn-triangle" viewBox="0 0 24 24" aria-hidden="true">
                   <path d="M12 3 L22 21 L2 21 Z" fill="#f59e0b" stroke="#1f2b3c" stroke-width="1.8" stroke-linejoin="round"/>
               </svg>`;
        }

        const warn3Svg = is3LineWarn
            ? `<svg class="route-segment-warn-3line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#dc2626"/><line x1="12" y1="7" x2="12" y2="13" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.5" fill="#ffffff"/></svg>`
            : '';

        const badge = `<span class="route-segment-badge${(isUrgent || isExtremeUrgent) ? ' urgent' : ''}${is3LineWarn ? ' warn-3line' : ''}" style="background:${s.color}; color:${s.textColor};">${escapeHtml(s.shortName)}${urgentSvg}${warn3Svg}</span>`;

        if (i === 0) return badge;

        const prevSeg = segs[i - 1];
        const transferStation = prevSeg.toStation;
        const isCtrl = ctrlStations && ctrlStations.includes(transferStation);

        let isFutureCtrl = false;
        if (isCtrl && interchanges) {
            const inter = interchanges.find(o => o.key.split('|')[0] === transferStation);
            if (inter && inter.timeMin != null && (inter.timeMin - nowMin) >= 60) {
                isFutureCtrl = true;
            }
        }

        let arrowHtml = `<span class="route-seg-arrow">→</span>`;
        if (isCtrl) {
            const ctrlSvg = `<span class="route-seg-ctrl-icon${isFutureCtrl ? ' is-future' : ''}" title="换乘站客控中${isFutureCtrl ? '（距当前时间超过1小时，客控可能变化）' : ''}">
                <svg viewBox="0 0 24 24" width="13" height="13" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2 L5 13 h6 l-1 9 l9 -12 h-6 l1 -8 z" 
                          fill="${isFutureCtrl ? 'none' : '#f59e0b'}" 
                          stroke="${isFutureCtrl ? '#94a3b8' : '#1f2b3c'}" 
                          stroke-width="1.8" 
                          stroke-linejoin="round"
                          ${isFutureCtrl ? 'stroke-dasharray="2,2"' : ''}/>
                </svg>
            </span>`;
            arrowHtml = `<span class="route-seg-arrow-wrapper">${arrowHtml}${ctrlSvg}</span>`;
        }

        return arrowHtml + badge;
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
        <span class="route-station">${escapeHtml(formatDisplayStation(startName))}</span>
        ${stationRoute.map(s =>
        `<span class="route-arrow">→</span><span class="route-station">${escapeHtml(formatDisplayStation(s))}</span>`
    ).join('')}
        <span class="route-arrow">→</span><span class="route-station">${escapeHtml(formatDisplayStation(endName))}</span>
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

    // 用"在该站的 boarding 时刻"判断末班车是否仍运营，而不是整个路径的出发时刻
    // 例：用户在 23:05 出发，23:16 才到石壁，用 23:05 判断会误以为还能赶上 23:08 的末班车
    const currentMin = getBoardingTimeAtStation(path, station, lineName);

    /* ============================================================
       3 号线 · 四个方向的专用分支
       ============================================================ */

    const isL3 = (lineName === '3号线' || lineName === '3号线北');
    const inSouth = (typeof LINE3_MAIN_SOUTH !== 'undefined')
        && LINE3_MAIN_SOUTH.has(station);
    const inNorth = _isLine3NorthStation(station);

    // 起点是体育西路时的绝对精准特判，必须放在所有分支最前面
    if (isL3 && station === '体育西路') {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);
        const SOUTH_ORDER = LINE3_SOUTH_ORDER;
        const NORTH_ORDER = (typeof LINE3_NORTH_ORDER !== 'undefined') ? LINE3_NORTH_ORDER : ['体育西路', '林和西', '广州东站', '燕塘', '梅花园', '京溪南方医院', '同和', '永泰', '白云大道北', '嘉禾望岗', '龙归', '人和', '高增', '机场南', '机场北（T2）'];

        // 1. 目的地是北段（如广州东站、同和、嘉禾望岗、机场北等）
        if (segEnd && NORTH_ORDER.includes(segEnd)) {
            const idxSegEnd = findStationIndex(NORTH_ORDER, segEnd);
            const NORTH_TERMINALS = ['机场北（T2）', '嘉禾望岗', '同和'];
            let targets = NORTH_TERMINALS.filter(t => findStationIndex(NORTH_ORDER, t) >= idxSegEnd);

            // 追加短线车终点（如 体育西路-同和 的短线车）
            if (typeof getShortServicesOfLine === 'function') {
                const shortServices = getShortServicesOfLine(lineName);
                for (const svc of shortServices) {
                    if (svc.start === '体育西路' && NORTH_ORDER.includes(svc.end)) {
                        const idxSvcEnd = findStationIndex(NORTH_ORDER, svc.end);
                        if (idxSvcEnd >= idxSegEnd && !targets.includes(svc.end)) {
                            targets.push(svc.end);
                        }
                    }
                }
            }
            if (targets.length > 0) {
                // 按照从南到北的顺序排序（同和 -> 嘉禾望岗 -> 机场北）
                targets.sort((a, b) => NORTH_ORDER.indexOf(a) - NORTH_ORDER.indexOf(b));
                // 为了 UI 简洁，把“机场北（T2）”还原为“机场北”
                targets = targets.map(t => t === '机场北（T2）' ? '机场北' : t);
                return targets.join(' / ') + '方向';
            }
            return '机场北方向';
        }

        // 2. 目的地是南段（如大石、番禺广场、海傍）
        if (segEnd && SOUTH_ORDER.includes(segEnd)) {
            const idxSegEnd = findStationIndex(SOUTH_ORDER, segEnd);
            const SOUTH_TERMINALS = ['大石', '番禺广场', '海傍'];
            const targets = SOUTH_TERMINALS.filter(t => findStationIndex(SOUTH_ORDER, t) >= idxSegEnd);
            if (targets.length > 0) return targets.join(' / ') + '方向';
            return '大石 / 番禺广场 / 海傍方向';
        }

        // 3. 目的地是支线（如石牌桥、天河客运站）
        const BRANCH_TERMINALS = ['石牌桥', '岗顶', '华师', '五山', '天河客运站'];
        if (segEnd && BRANCH_TERMINALS.includes(segEnd)) {
            return '天河客运站方向';
        }
    }

    // ---------- 分支 A：南段北向（珠江新城~海傍 → 往北） ----------
    if (isL3 && inSouth && !inNorth
        && (rawDirection.includes('机场北') || rawDirection.includes('体育西路'))) {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);

        // 如果终点在支线，只能坐“天河客运站方向”的车
        const LINE3_BRANCH_STATIONS_LOCAL = new Set([
            '石牌桥', '岗顶', '华师', '五山', '天河客运站'
        ]);
        if (segEnd && LINE3_BRANCH_STATIONS_LOCAL.has(segEnd)) {
            return '天河客运站方向';
        }

        const arr3 = (typeof LINE_STATIONS !== 'undefined' && LINE_STATIONS['3号线']) || [];
        const idxSegEnd = findStationIndex(arr3, segEnd);
        const idxTyxl = findStationIndex(arr3, '体育西路');
        const notCrossTyx = idxSegEnd >= 0 && idxTyxl >= 0 && idxSegEnd <= idxTyxl;

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

    // ---------- 分支 B：南段南向 ----------
    if (isL3 && inSouth) {
        // 删掉对 rawDirection 的严格限制，只要起点在南段或体育西路，就按 forcedEnd 或 segEnd 算
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
    if (isL3 && inNorth && !inSouth
        && (rawDirection.includes('体育西路') || rawDirection.includes('海傍'))) {
        const segEnd = forcedEnd || getSegmentEndStation(path, station, lineName);

        // 如果目的地是支线，直接返回天河客运站方向
        const LINE3_BRANCH_STATIONS_LOCAL = new Set([
            '石牌桥', '岗顶', '华师', '五山', '天河客运站'
        ]);
        if (segEnd && LINE3_BRANCH_STATIONS_LOCAL.has(segEnd)) {
            return '天河客运站方向';
        }

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

    // ---------- 分支 E：支线南向（石牌桥~天河客运站 → 往体育西路/南段） ----------
    if (isL3 && LINE3_BRANCH.has(station) && (rawDirection.includes('体育西路') || rawDirection.includes('海傍'))) {
        // 只要不是去北段，统统按南段的终点列表展示
        return '大石 / 番禺广场 / 海傍方向';
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
    const idxEnd = findStationIndex(lineStations, segmentEnd);
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

    // 追加短路车终点（只要方向一致且能覆盖当前路径）
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

    const isOuter = rawDir.includes('外环');
    const isInner = rawDir.includes('内环');
    if (!isOuter && !isInner) return rawDir;

    // 获取当前 boarding 时刻和该站的数据
    const currentMin = getBoardingTimeAtStation(path, startStation, '11号线');
    const d = (typeof getLineStationData === 'function') ? getLineStationData('11号线', startStation) : null;
    if (!d) return isOuter ? '外环 / 往龙潭' : '内环 / 往赤沙'; // 兜底

    const full = isOuter ? d.upFull : d.downFull;
    const terminal = isOuter ? d.upTerminal : d.downTerminal;
    const terminalEnd = isOuter ? '龙潭' : '赤沙';
    const outerInnerStr = isOuter ? '外环' : '内环';

    // 判断当前时间是否有全程车/区间车
    const fullActive = full && currentMin >= full.first && currentMin <= full.last;
    const terminalActive = terminal && currentMin >= terminal.first && currentMin <= terminal.last;

    if (fullActive) {
        // 全程车还在 → 显示“外环 / 往龙潭”
        return `${outerInnerStr} / 往${terminalEnd}`;
    } else if (terminalActive) {
        // 仅剩区间车 → 直接显示“往龙潭”
        return `往${terminalEnd}`;
    }

    return outerInnerStr;
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
    const arriveMin = item.arriveMin;
    const arriveTime = fmtHM(arriveMin);

    if (_routeArriveMode) {
        const targetArriveMin = getRouteDepartMin();
        const isEarly = arriveMin < targetArriveMin;
        const arriveTimeStyle = isEarly ? ' style="color: #f59e0b;"' : '';

        if (item.actualDepartMin != null) {
            const boardingTime = fmtHM(item.actualDepartMin);
            return `
                <div class="route-arrive">
                    <div class="route-arrive-line">
                        <span class="route-arrive-time">${boardingTime}</span>
                        <span class="route-arrive-label">候车</span>
                    </div>
                    <div class="route-arrive-line">
                        <span class="route-arrive-time"${arriveTimeStyle}>${arriveTime}</span>
                        <span class="route-arrive-label">到达</span>
                    </div>
                </div>
            `;
        }
    }

    const isNextDay = arriveMin >= 1440;
    const nextDayHtml = isNextDay ? '<div style="color:#94a3b8;font-size:11px;line-height:1;margin-bottom:2px;">次日</div>' : '';

    if (isNextDay) {
        return `
            <div class="route-arrive">
                ${nextDayHtml}
                <div class="route-arrive-time">${arriveTime}</div>
                <div class="route-arrive-label">到达</div>
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

function renderRouteCard(item, idx, startName, endName, sortMode = 'fastest', displayStart = startName) {
    const rank = item.rank || (idx + 1);
    const transferStations = item.interchanges.map(o => formatDisplayStation(o.key.split('|')[0])).filter(Boolean);

    let deltaHtml = '';
    if (sortMode === 'fewer-transfers'
        && item.deltaFromFastest != null
        && item.deltaFromFastest > 0) {
        deltaHtml = `<span class="route-delta">比最快优先首位慢 ${formatDelta(item.deltaFromFastest)}</span>`;
    }

    // 换乘路径：显示换乘站；直达路径：显示乘车方向（如"往龙潭"）
    let transferText = '';
    if (transferStations.length > 0) {
        transferText = `<span>🚏 ${escapeHtml(transferStations.join(' · '))}</span>`;
    }

    let warningHtml = '';

    let stationCtrlHtml = '';
    const ctrlStationNames = [];
    if (item.stationWarnings && item.stationWarnings.length > 0) {
        const grouped = new Map();
        for (const w of item.stationWarnings) {
            ctrlStationNames.push(w.station);
            if (!grouped.has(w.typeText)) grouped.set(w.typeText, []);
            grouped.get(w.typeText).push(w.station);
        }

        const now = new Date();
        let nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin < 120) nowMin += 1440;
        const interchangeTimes = {};
        if (item.interchanges) {
            item.interchanges.forEach(o => {
                interchangeTimes[o.key.split('|')[0]] = o.timeMin;
            });
        }

        stationCtrlHtml = `<div class="route-station-ctrl">` +
            [...grouped.entries()].map(([typeText, stations]) => {
                const list = stations.map(s => escapeHtml(s)).join(' · ');

                let hasTime = false;
                let allFuture = true;

                stations.forEach(s => {
                    const t = interchangeTimes[s];
                    if (t != null) {
                        hasTime = true;
                        if (t - nowMin <= 60) {
                            allFuture = false;
                        }
                    }
                });

                const isFuture = hasTime && allFuture;
                const futureClass = isFuture ? ' is-future' : '';
                const noteHtml = isFuture ? `<span class="route-station-ctrl-note">（距当前时间超过1小时，客控可能变化）</span>` : '';

                return `<div class="route-station-ctrl-item${futureClass}">
                    <span class="route-station-ctrl-icon">${isFuture ? '⏳' : '⛔'}</span>
                    <span class="route-station-ctrl-text">
                        <b>${escapeHtml(typeText)}</b>
                        <span class="route-station-ctrl-count">${stations.length} 站</span>
                        ${list} ${noteHtml}
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

            const nextSeg = segs[i + 1];
            const isFromBranch = LINE3_BRANCH_STATIONS_LOCAL.has(segs[i].fromStation);
            const isToBranch = LINE3_BRANCH_STATIONS_LOCAL.has(nextSeg.toStation);
            // 判断起点是否在南段或体育西路
            const isFromSouth = (typeof LINE3_MAIN_SOUTH !== 'undefined' && LINE3_MAIN_SOUTH.has(segs[i].fromStation)) || segs[i].fromStation === '体育西路';

            // 【核心修复】南段 -> 支线，完全直达，排除出虚拟换乘
            if (isFromSouth && isToBranch) {
                // 跳过，不加入 virtualSplitAfter
            } else if (!isToBranch || (!isFromBranch && isToBranch)) {
                virtualSplitAfter.add(i);
            }
        }
    }

    let guideHtml;
    const boardingPoints = [];
    const firstSeg = segs[0] || null;
    const firstDir = firstSeg
        ? getSegmentDirection(item.path, startName, firstSeg.fullLine, firstSeg.toStation)
        : null;

    let firstBoardTime = null;
    if (_routeArriveMode && item.actualDepartMin != null) firstBoardTime = item.actualDepartMin;
    else if (_routeActiveDepartMin != null) firstBoardTime = _routeActiveDepartMin;
    else {
        const d = new Date();
        firstBoardTime = d.getHours() * 60 + d.getMinutes();
        if (firstBoardTime < 120) firstBoardTime += 1440;
    }

    boardingPoints.push({
        station: displayStart,
        fromShort: null,
        toShort: firstSeg ? firstSeg.shortName : null,
        fullLine: firstSeg ? firstSeg.fullLine : null,
        direction: firstDir,
        note: null,
        door: null,
        timeMin: null,
        walkMin: null,
        waitMin: item.startWaitMin || 0,
        boardingTime: item.actualStartBoardTime || firstBoardTime,
        marginMin: item.startMargin,
        interchangeIdx: null,
        isVirtual3to3: false,
    });


    let interchangeCursor = 0;
    for (let si = 0; si < segs.length - 1; si++) {
        if (virtualSplitAfter.has(si)) {
            const nextSeg = segs[si + 1];
            const nextTo = nextSeg ? nextSeg.toStation : null;

            let virtualDir = null;
            if (nextTo) {
                virtualDir = getSegmentDirection(item.path, '体育西路', '3号线', nextTo);
            }
            if (!virtualDir) {
                if (nextTo && LINE3_SOUTH_ORDER.includes(nextTo)) {
                    virtualDir = '大石 / 番禺广场 / 海傍方向';
                } else if (nextTo && ['石牌桥', '岗顶', '华师', '五山', '天河客运站'].includes(nextTo)) {
                    virtualDir = '天河客运站方向';
                } else {
                    virtualDir = '机场北 / 嘉禾望岗 / 同和方向';
                }
            }

            let vTimeMin = item.tyxArriveTime || null;
            let vWalkMin = 0;
            let vBoardingTime = vTimeMin;
            let vMarginMin = item.tyxMargin !== undefined ? item.tyxMargin : null;
            let vInterchangeIdx = null;

            const o = item.interchanges[interchangeCursor];
            if (o && o.key.split('|')[0] === '体育西路') {
                vTimeMin = o.timeMin;
                vBoardingTime = o.timeMin;
                vMarginMin = o.marginMin;
                vInterchangeIdx = interchangeCursor;
                interchangeCursor++;
            } else if (vTimeMin === null) {
                let t = (_routeActiveDepartMin != null) ? _routeActiveDepartMin : 0;
                for (let i = 0; i < item.path.nodes.length - 1; i++) {
                    const u = item.path.nodes[i], v = item.path.nodes[i + 1];
                    const w = routeGetEdgeWeight(u, v);
                    if (w !== null) t += w / 60;
                    const vParts = v.split('|');
                    if (vParts.length >= 4 && vParts[0].includes('3号线') && vParts[1] === '体育西路' && vParts[3] === '到站') {
                        vTimeMin = t;
                        vBoardingTime = t;
                        break;
                    }
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
                timeMin: vTimeMin,
                walkMin: vWalkMin,
                boardingTime: vBoardingTime,
                marginMin: vMarginMin,
                interchangeIdx: vInterchangeIdx,
                isVirtual3to3: true,
            });
            continue;
        }

        const o = item.interchanges[interchangeCursor];
        if (o) {
            const g = ROUTE_GRAPH.guides.get(o.key);
            const parts = o.key.split('|');
            const toLine = g ? g.toLine : parts[3];
            const toStation = g ? g.station : parts[0];

            boardingPoints.push({
                station: toStation,
                fromShort: routeShortLineName(g ? g.fromLine : parts[1]),
                toShort: routeShortLineName(toLine),
                fullLine: toLine,
                lineShort: null,
                direction: getSegmentDirection(item.path, toStation, toLine, segs[si + 1] ? segs[si + 1].toStation : null),
                note: g && g.detail ? g.detail : null,
                door: null,
                timeMin: o.timeMin,
                walkMin: o.walkMin,
                waitMin: o.waitMin || 0,
                boardingTime: o.boardingTime,
                marginMin: o.marginMin,
                interchangeIdx: interchangeCursor,
                isVirtual3to3: false,
            });
        }
        interchangeCursor++;
    }

    boardingPoints.push({
        station: endName, // 使用传入的终点名
        fromShort: null,
        toShort: null,
        fullLine: null,
        direction: null,
        note: null,
        door: null,
        timeMin: item.arriveMin, // 使用总到达时间
        walkMin: null,
        waitMin: 0,
        boardingTime: null,
        marginMin: null,
        interchangeIdx: null,
        isVirtual3to3: false,
        isEnd: true // 添加一个终点标记
    });

    for (let i = 0; i < boardingPoints.length - 1; i++) {
        const bp = boardingPoints[i];
        const nextBp = boardingPoints[i + 1];

        if (nextBp.isVirtual3to3) {
            bp.door = '2\\3\\6\\10\\11\\16\\19';
            continue;
        }

        if (typeof nextBp.interchangeIdx === 'number') {
            const o = item.interchanges[nextBp.interchangeIdx];
            if (o) {
                const g = ROUTE_GRAPH.guides.get(o.key);
                if (g && g.screenDoors && g.screenDoors.length > 0) {
                    bp.door = formatScreenDoorsRange(g.screenDoors);
                }
            }
        }
    }

    // 生成时间轴 HTML
    guideHtml = `<div class="route-guide">` + boardingPoints.map((bp, bpIdx) => {
        const isFirst = bpIdx === 0;
        const isLast = bpIdx === boardingPoints.length - 1;

        // 1. 站名与时间
        const stationName = escapeHtml(formatDisplayStation(bp.station));
        const boardingStr = (bp.boardingTime != null && !isNaN(bp.boardingTime)) ? fmtHM(bp.boardingTime) : '';

        // 判断是否为终点站：如果是最后一段且站名等于终点
        const isEndStation = (bp.station === endName) || (bp.station === item._realEnd);

        // 2. 线路与方向
        const baseLineText = bp.toShort;
        let dirName = bp.direction ? bp.direction.replace(/方向$/, '') : '';
        if (bp.isEnd) {
            dirName = '';
        } else if (dirName.startsWith('内环') || dirName.startsWith('外环') || dirName.startsWith('往')) {
            // 保持原样
        } else if (dirName) {
            dirName = '往' + dirName;
        }

        const lineColor = bp.fullLine && LINE_COLORS[bp.fullLine] ? LINE_COLORS[bp.fullLine] : '#888';
        const textColor = getContrastColor(lineColor);

        const prevBp = boardingPoints[bpIdx - 1];
        const prevLineColor = (prevBp && prevBp.fullLine && LINE_COLORS[prevBp.fullLine]) ? LINE_COLORS[prevBp.fullLine] : lineColor;
        const prevTextColor = getContrastColor(prevLineColor);

        // 3. 标签（车门、步行、候车、等待、备注）
        let tagsHtml = '';
        let noteHtml = '';
        let badgeHtml = '';
        let waitLabelHtml = '';

        if (bp.isEnd) {
            badgeHtml = `<span class="guide-exit-badge" title="已到达终点，请出站">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
                    <path d="M10 12h10" />
                    <path d="M16 8l4 4-4 4" />
                </svg>
            </span>`;
        } else if (baseLineText) {
            // 统一强制使用浅灰背景、深色字
            badgeHtml = `<span class="guide-line-badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">${escapeHtml(baseLineText)}</span>`;
        }

        if (!bp.isEnd) {
            if (bp.note) {
                let formattedNote = escapeHtml(bp.note);

                const matchStyle = `background: ${prevLineColor}; color: ${prevTextColor}; padding: 1px 5px; border-radius: 4px; font-weight: bold; font-size: 12px; margin: 0 2px; display: inline-flex; align-items: center; white-space: nowrap; line-height: 1.2;`;
                formattedNote = formattedNote.replace(/(门\s*[\d至\\]+)/g, `<span style="${matchStyle}">$1</span>`);

                noteHtml = `<div class="guide-note-row">
                <span class="route-tag tag-note">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="margin-right: 6px; opacity: 0.85; flex-shrink: 0; margin-top: 2px;">
                        <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
                    </svg>
                    <span class="note-text-wrap">${formattedNote}</span>
                </span>
            </div>`;
            }

            if (bp.walkMin != null && bp.walkMin > 0) {
                let walkNum = 0, walkUnit = '';
                if (bp.walkMin < 1) {
                    walkNum = Math.max(1, Math.round(bp.walkMin * 60));
                    walkUnit = '秒';
                } else {
                    walkNum = Math.round(bp.walkMin);
                    walkUnit = '';
                }
                tagsHtml += `<span class="tag-icon-val" data-tooltip="换乘时间" style="cursor:pointer;" title="步行 ${walkNum}${walkUnit || '分'}">
                <svg viewBox="0 0 24 24" class="icon-walk" width="18" height="18" fill="currentColor">
                    <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
                </svg>
                <span class="val-num">${walkNum}${walkUnit ? `<span class="val-unit">${walkUnit}</span>` : ''}</span>
            </span>`;
            }

            if (bp.door) {
                const doorText = bp.door.replace(/^门\s*/, '');
                const isLong = doorText.length > 12;
                const doorClass = isLong ? 'tag-door is-long collapsed' : 'tag-door';
                const tooltipText = isLong ? '点击展开最优车门' : '最优车门';

                const arrowSvg = isLong
                    ? `<svg class="door-arrow-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`
                    : '';

                // 此处仍然使用当前的 lineColor 和 textColor
                tagsHtml += `<span class="${doorClass}" data-tooltip="${tooltipText}" style="cursor:pointer; background: ${lineColor}; color: ${textColor}; border: none;">
                <span class="door-label">门</span><span class="door-text">${escapeHtml(doorText)}</span>${arrowSvg}
            </span>`;
            }

            // 候（改成 SVG 时钟/沙漏图标 + 时间）
            if (boardingStr) {
                tagsHtml += `<span class="tag-icon-val tag-wait-time" data-tooltip="候车时刻" style="cursor:pointer;" title="候车时刻">
                <svg viewBox="0 0 24 24" class="icon-hourglass" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
                </svg>
                <span class="val-num">${boardingStr}</span>
            </span>`;
            }

            // 等（时钟）
            if (bp.waitMin > 0.1) {
                waitLabelHtml = `<span class="tag-wait-warning">距首班车 ${Math.round(bp.waitMin)} 分</span>`;
            } else if (bp.fullLine && bp.boardingTime != null && typeof getHeadwayAt === 'function') {
                const headway = getHeadwayAt(bp.fullLine, bp.boardingTime);
                if (typeof headway === 'number' && headway > 0) {
                    const ratio = (typeof _routeWaitRatio === 'number') ? _routeWaitRatio : 0.5;
                    const wTime = headway * ratio;
                    const waitStr = Number.isInteger(wTime) ? `${wTime}` : `${wTime.toFixed(1)}`;

                    let prefix = '等';
                    if (ratio >= 0.99) prefix = '最长';
                    else if (ratio >= 0.74 && ratio <= 0.76) prefix = '预计';
                    else if (ratio !== 0.5) prefix = '约';

                    tagsHtml += `<span class="tag-icon-val" data-tooltip="平均等车时间" style="cursor:pointer;" title="${prefix}${waitStr}分">
                    <svg viewBox="0 0 24 24" class="icon-clock" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span class="val-num">${waitStr}</span>
                </span>`;
                }
            }

            // 剩余时间警示
            if (bp.marginMin != null && !isNaN(bp.marginMin)) {
                const m = Math.round(bp.marginMin);
                if (m >= 0 && m <= 20) {
                    tagsHtml += `<span class="route-tag tag-margin-urgent">剩${m}分</span>`;
                }
            }
        }

        // 5. 组装轴线（圆点/连线 渐变处理）
        const dotClass = isFirst ? 'is-start' : (isLast ? 'is-end' : 'is-transfer');

        const nextBp = boardingPoints[bpIdx + 1];
        let nextColor = lineColor;
        if (nextBp && nextBp.fullLine && LINE_COLORS[nextBp.fullLine]) {
            nextColor = LINE_COLORS[nextBp.fullLine];
        }
        if (nextBp && nextBp.isEnd) {
            nextColor = lineColor;
        }

        // 点：使用高光叠加底色实现上下渐变
        const dotStyle = `background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%), ${lineColor};`;
        // 线：从当前线路色渐变到下一线路色
        const lineStyle = `background: linear-gradient(to bottom, ${lineColor} 0%, ${lineColor} 75%, ${nextColor} 100%);`;

        return `<div class="route-guide-item">
            <div class="guide-axis">
                <div class="axis-dot ${dotClass}" style="${dotStyle}"></div>
                ${!isLast ? `<div class="axis-line" style="${lineStyle}"></div>` : ''}
            </div>
            
            <div class="guide-content">
                <div class="guide-header">
                    <div class="guide-title-wrap">
                        <span class="guide-station">${stationName}</span>
                        ${badgeHtml}
                        ${dirName ? `<span class="guide-dir">${escapeHtml(dirName)}</span>` : ''}
                        ${waitLabelHtml}
                    </div>
                </div>
                ${noteHtml}
                <div class="guide-tags-wrap">
                    ${tagsHtml}
                </div>
            </div>
        </div>`;
    }).join('') + `</div>`;

    const pathKey = item.path.nodes.join('|');

    const needGuide = (idx === 0) && !localStorage.getItem('gz_route_guide_shown');
    let tapGuideHtml = '';
    if (needGuide) {
        tapGuideHtml = `
        <div class="route-guide-tap" id="route-guide-tap">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 外围波纹 -->
                <circle cx="12" cy="12" r="10" fill="rgba(43, 125, 233, 0.25)" class="tap-circle"/>
                <!-- 手指实体路径 -->
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z" fill="#2b7de9"/>
            </svg>
        </div>`;
    }

    return `
        <div class="route-card ${needGuide ? 'guide-pulse' : ''}" data-rank="${rank}" data-path-key="${escapeHtml(pathKey)}">
            ${tapGuideHtml}
            <div class="route-rank">${rank}</div>
            <div class="route-card-head">
                <div class="route-summary">
                    <div class="route-line-path" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        ${item._mappedStart ? `<span style="display: inline-block; background: rgba(148, 163, 184, 0.25); color: #64748b; font-size: 12px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${escapeHtml(item._mappedStart.replace(/[()（）]/g, ''))}</span>` : ''}
                        ${renderRouteSegmentsHtml(item.path, item.boardingMargins, item.warnings && item.warnings.length > 0, ctrlStationNames, item.tyxMargin, item.interchanges)}
                        ${item._mappedEnd ? `<span style="display: inline-block; background: rgba(148, 163, 184, 0.25); color: #64748b; font-size: 12px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${escapeHtml(item._mappedEnd.replace(/[()（）]/g, ''))}</span>` : ''}
                    </div>
                    <div class="route-sub">
                        <span>${formatDuration(item.totalCost)}</span>
                        <span>${item.stationRoute.length + 2}站</span>
                        ${item.fare != null ? `<span class="route-fare">¥${item.fare}</span>` : ''}
                        ${deltaHtml}
                        <button type="button" class="route-map-btn" data-index="${idx}">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:2px;">
                                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
                                <line x1="9" y1="3" x2="9" y2="18"></line>
                                <line x1="15" y1="6" x2="15" y2="21"></line>
                            </svg>线路图
                        </button>
                    </div>
                </div>
                ${buildArriveBlockHtml(item)}
            </div>
            <div class="route-detail">
                ${warningHtml}
                ${guideHtml}
                ${buildStationListHtml(startName, endName, item.stationRoute)} 
            </div>
        </div>
    `;
}