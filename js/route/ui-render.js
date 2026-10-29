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

function renderRouteSegmentsHtml(path, boardingMargins, has3LineWarning, ctrlStations = null, virtual3to3Margin = null) {
    const segs = (typeof parseRouteSegments === 'function') ? parseRouteSegments(path) : [];
    if (segs.length === 0) return '';
    const margins = boardingMargins || [];

    let marginCursor = 0; // ★ 余量数组游标

    return `<span class="route-segments">` + segs.map((s, i) => {
        let m = null;

        // ★ 核心修复：只在起点和真实跨线换乘时，才消耗一个余量
        if (i === 0) {
            m = margins[marginCursor++];
        } else {
            const prevSeg = segs[i - 1];
            if (prevSeg.fullLine !== s.fullLine) {
                m = margins[marginCursor++];
            } else if (s.fullLine === '3号线' && prevSeg.toStation === '体育西路') {
                // ★ 新增：如果是 3->3 虚拟换乘，使用传入的虚拟换乘余量
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

                // ★ 新增：如果剩余时间 > 5分钟，感叹号用深色；<= 5分钟用白色
                lineColor = (m <= 5) ? '#ffffff' : '#1f2b3c';
            }

            urgentSvg = `<svg class="route-segment-warn" viewBox="0 0 24 24" aria-hidden="true">
                   <circle cx="12" cy="12" r="10" fill="${bgColor}"/>
                   <line x1="12" y1="7" x2="12" y2="13" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round"/>
                   <circle cx="12" cy="17" r="1.5" fill="${lineColor}"/>
               </svg>`;
        } else if (isUrgent) {
            // 10-20分钟：倒三角，无感叹号
            urgentSvg = `<svg class="route-segment-warn route-segment-warn-triangle" viewBox="0 0 24 24" aria-hidden="true">
                   <path d="M2 2 L22 2 L12 22 Z" fill="#f59e0b" stroke="#1f2b3c" stroke-width="1.8" stroke-linejoin="round"/>
               </svg>`;
        }

        const warn3Svg = is3LineWarn
            ? `<svg class="route-segment-warn-3line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#dc2626"/><line x1="12" y1="7" x2="12" y2="13" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.5" fill="#ffffff"/></svg>`
            : '';

        const badge = `<span class="route-segment-badge${(isUrgent || isExtremeUrgent) ? ' urgent' : ''}${is3LineWarn ? ' warn-3line' : ''}" style="background:${s.color}; color:${s.textColor};">${escapeHtml(s.shortName)}${urgentSvg}${warn3Svg}</span>`;

        if (i === 0) return badge;

        // ★ 新增：判断箭头前方的换乘站是否客控
        const prevSeg = segs[i - 1];
        const transferStation = prevSeg.toStation;
        const isCtrl = ctrlStations && ctrlStations.includes(transferStation);

        let arrowHtml = `<span class="route-seg-arrow">→</span>`;
        if (isCtrl) {
            const ctrlSvg = `<span class="route-seg-ctrl-icon" title="换乘站客控中">
                <svg viewBox="0 0 24 24" width="13" height="13" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2 L5 13 h6 l-1 9 l9 -12 h-6 l1 -8 z" 
                          fill="#f59e0b" 
                          stroke="#1f2b3c" 
                          stroke-width="1.8" 
                          stroke-linejoin="round"/>
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

    // ★ 新增：起点是体育西路时的绝对精准特判，必须放在所有分支最前面
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

    // ---------- 分支 B：南段南向 ----------
    if (isL3 && inSouth) {
        // ★ 删掉对 rawDirection 的严格限制，只要起点在南段或体育西路，就按 forcedEnd 或 segEnd 算
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

        // ★ 新增：如果目的地是支线，直接返回天河客运站方向
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

    // ★ 使用该路线自己计算出的极限出发时间
    if (_routeArriveMode && item.actualDepartMin != null) {
        const boardingTime = fmtHM(item.actualDepartMin);
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

    let stationCtrlHtml = '';
    const ctrlStationNames = []; // ★ 新增：提取客控站名字
    if (item.stationWarnings && item.stationWarnings.length > 0) {
        const grouped = new Map();
        for (const w of item.stationWarnings) {
            ctrlStationNames.push(w.station); // ★ 存入数组
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

            const nextSeg = segs[i + 1];
            const isFromBranch = LINE3_BRANCH_STATIONS_LOCAL.has(segs[i].fromStation);
            const isToBranch = LINE3_BRANCH_STATIONS_LOCAL.has(nextSeg.toStation);

            // ★ 修改：只要不是“支线去南段”，统统加上换乘提示
            if (!isToBranch || (!isFromBranch && isToBranch)) {
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
        if (startMargin !== null && startMargin >= 0 && startMargin <= 20) {
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
                const nextSeg = segs[si + 1];
                const nextTo = nextSeg ? nextSeg.toStation : null;

                // 计算方向
                let virtualDir = null;
                if (nextTo) {
                    virtualDir = getSegmentDirection(item.path, '体育西路', '3号线', nextTo);
                }
                // ★ 修复：如果底层算不出方向，直接根据目的地强行兜底
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
                    // ★ 修复：如果底层依然没给时间，UI 层再兜底算一次
                    let t = (_routeActiveDepartMin != null) ? _routeActiveDepartMin : 0;
                    for (let i = 0; i < item.path.nodes.length - 1; i++) {
                        const u = item.path.nodes[i], v = item.path.nodes[i+1];
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
                // 如果是 内环/外环 或者 已经以“往”开头，直接使用
                if (dirName.startsWith('内环') || dirName.startsWith('外环') || dirName.startsWith('往')) {
                    dirHtml = `<span class="route-guide-direction">${escapeHtml(dirName)}</span>`;
                } else {
                    dirHtml = `<span class="route-guide-direction">往${escapeHtml(dirName)}</span>`;
                }
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
                if (m >= 0 && m <= 20) {
                    const text = m === 0 ? '即将结束运营' : `剩${m}分`;
                    marginStr = `<span class="route-guide-margin urgent">${text}</span>`;
                }
            }

            let timeHtml = '';
            if (arriveStr || marginStr) {
                let row1 = '';
                let row2 = '';

                if (arriveStr) {
                    // ★ 将“到”直接写进 route-guide-time 里面
                    const row1Parts = [`<span class="route-guide-time">到${arriveStr}</span>`];
                    if (walkStr) row1Parts.push(`<span class="route-guide-walk">${walkStr}</span>`);
                    row1 = `<span class="route-guide-time-row">${row1Parts.join('')}</span>`;
                }

                if (boardingStr || marginStr) {
                    const row2Parts = [];
                    // ★ 将“候”直接写进 route-guide-time 里面
                    if (boardingStr) row2Parts.push(`<span class="route-guide-time">候${boardingStr}</span>`);
                    if (marginStr) row2Parts.push(marginStr);
                    row2 = row2Parts.length > 0
                        ? `<span class="route-guide-time-row">${row2Parts.join('')}</span>`
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
                    <div class="route-line-path">${renderRouteSegmentsHtml(item.path, item.boardingMargins, item.warnings && item.warnings.length > 0, ctrlStationNames, item.tyxMargin)}</div>
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