// ========== 从 Path 提取站点 / 换乘信息 ==========

const ARRIVED = '到站';
const PLATFORM = '站台';
const LAUNCH = '发动';
const STATUS_IRRELEVANT = 'IRRELEVANT';

function parseStationRoute(path) {
    const all = [];
    let last = null;
    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;
        const station = parts[1];
        // 跳过首尾占位节点（parts[1] 分别是 "开始" / "结束"）
        if (station === '开始' || station === '结束') continue;
        if (last === null || last !== station) {
            last = station;
            all.push(station);
        }
    }
    // all 现在是 [起点, 途经..., 终点]；去掉首尾，返回纯途经站
    if (all.length <= 2) return [];
    return all.slice(1, all.length - 1);
}

function parseInterchangeRoute(path, simplified = true) {
    let result = null;
    let lastLine = null;
    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;
        if (parts[1] === '开始' || parts[1] === '结束') continue;
        let lineName = parts[0];

        // 归并：3号线北 → 3号线
        if (lineName === '3号线北') lineName = '3号线';
        if (lineName === '佛山3号线北') lineName = '佛山3号线';

        if (simplified) {
            lineName = lineName.replace(/号|线/g, '').replace(/佛山/g, '佛');
        }
        if (result === null) {
            result = lineName;
            lastLine = lineName;
        } else if (lineName !== lastLine) {
            result += '→' + lineName;
            lastLine = lineName;
        }
    }
    return result || '';
}

function parseInterchangeTimeCost(path) {
    let total = 0;
    for (let i = 0; i < path.nodes.length - 1; i++) {
        const u = path.nodes[i], v = path.nodes[i + 1];
        const uParts = u.split('|');
        const vParts = v.split('|');
        if (uParts.length < 4 || vParts.length < 4) continue;
        if (uParts[3] === ARRIVED && vParts[3] === PLATFORM) {
            const w = routeGetEdgeWeight(u, v);
            if (w !== null) total += w;
        }
    }
    return total;
}

/**
 * 解析路径中的换乘事件。
 * @returns {Array<{
 *   key: string,
 *   timeMin: number,          // 列车到达换乘站的时刻
 *   walkMin: number,          // 走到新站台的步行时长（分钟）
 *   boardingTime: number,     // 走到新站台的时刻
 *   marginMin: number|null,   // 距目标方向末班车的剩余分钟
 * }>}
 */
function parseInterchangeKeys(path, departMin) {
    const result = [];
    let currentLine = null;
    let firstGetOnStation = STATUS_IRRELEVANT;
    let t = (departMin != null && !isNaN(departMin)) ? departMin : 0;

    for (let i = 0; i < path.nodes.length - 1; i++) {
        const u = path.nodes[i], v = path.nodes[i + 1];
        const w = routeGetEdgeWeight(u, v);
        const uParts = u.split('|');
        const vParts = v.split('|');

        if (uParts.length >= 4 && vParts.length >= 4) {
            if (uParts[0] !== currentLine) {
                currentLine = uParts[0];
                firstGetOnStation = (currentLine === '6号线' || currentLine === '广佛线')
                    ? uParts[1] : STATUS_IRRELEVANT;
            }
            if (uParts[3] === ARRIVED && vParts[3] === PLATFORM) {
                const key = [
                    uParts[1], uParts[0], uParts[2],
                    vParts[0], vParts[2], firstGetOnStation
                ].join('|');

                const walkMin = (w != null) ? w / 60 : 0;
                const boardingTime = t + walkMin;

                // ★ 收集 boarding 之后、同一线路上按顺序出现的所有站
                // 与 checkReachability 保持一致，供多终点覆盖判断使用
                const downstream = collectDownstreamStations(i + 1, path.nodes);

                let marginMin = null;
                if (typeof getBoardingMargin === 'function') {
                    marginMin = getBoardingMargin(vParts[0], uParts[1], vParts[2],
                        boardingTime, downstream);
                }

                result.push({ key, timeMin: t, walkMin, boardingTime, marginMin });
            }
        }
        if (w !== null) t += w / 60;
    }
    return result;
}

function parseRouteSegments(path, departMin) {
    // 解析出发时刻：优先用入参，其次 _routeActiveDepartMin，最后回退 getRouteDepartMin
    let dt = departMin;
    if (dt == null && typeof _routeActiveDepartMin !== 'undefined') {
        dt = _routeActiveDepartMin;
    }
    if (dt == null && typeof getRouteDepartMin === 'function') {
        dt = getRouteDepartMin();
    }

    // 1. 先按 (lineName, rawDir) 切出原始段
    const rawSegments = [];
    let lastSegKey = null;
    let currentSeg = null;

    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;
        if (parts[1] === '开始' || parts[1] === '结束') continue;

        let lineName = parts[0];
        if (lineName === '3号线北') lineName = '3号线';
        if (lineName === '佛山3号线北') lineName = '佛山3号线';

        const station = parts[1];
        const rawDir = parts.length >= 4 ? parts[2] : '';
        const segKey = lineName + '|' + rawDir;

        if (segKey !== lastSegKey) {
            currentSeg = {
                fullLine: lineName,
                fromStation: station,
                toStation: station,
                rawDirection: rawDir,
            };
            rawSegments.push(currentSeg);
            lastSegKey = segKey;
        } else if (currentSeg) {
            currentSeg.toStation = station;
        }
    }

    // 2. 合并：3 号线南段→北段若贯通车仍可搭，则视为一段
    const merged = [];
    let i = 0;
    while (i < rawSegments.length) {
        const seg  = rawSegments[i];
        const next = rawSegments[i + 1];

        const isThrough = next
            && seg.fullLine === '3号线' && next.fullLine === '3号线'
            && seg.toStation === '体育西路'
            && isNorthboundRawDir(next.rawDirection)
            && isThroughTrainAvailable(seg.fromStation, dt);

        if (isThrough) {
            merged.push({
                fullLine: '3号线',
                fromStation: seg.fromStation,
                toStation: next.toStation,
                rawDirection: seg.rawDirection,     // 保留原始方向，方向由 getSegmentDirection 决定
                isThrough: true,
            });
            i += 2;
        } else {
            merged.push(seg);
            i += 1;
        }
    }

    // 3. 计算 shortName / 颜色
    merged.forEach(s => {
        let sn = s.fullLine
            .replace(/号线北$/, '')
            .replace(/号线$/, '')
            .replace(/线$/, '');
        if (sn.includes('佛山')) sn = sn.replace(/佛山/g, '佛');
        s.shortName = sn;

        s.color = (typeof LINE_COLORS !== 'undefined' && LINE_COLORS[s.fullLine]) || '#888';
        s.textColor = (typeof getContrastColor === 'function')
            ? getContrastColor(s.color)
            : '#ffffff';
    });

    return merged;
}

/** 该方向是否属于 3 号线"向北"（体育西路方向 / 机场北方向 / 天河客运站方向） */
function isNorthboundRawDir(rawDir) {
    if (!rawDir) return false;
    return rawDir.includes('体育西路')
        || rawDir.includes('机场北')
        || rawDir.includes('天河客运站');
}

/**
 * 3 号线贯通车（海傍 → 机场北方向）在指定站是否仍可搭。
 * @param {string} station   站名（干净站名，无后缀）
 * @param {number|null} timeMin  出发/boarding 时刻（分钟）
 * @returns {boolean}
 */
function isThroughTrainAvailable(station, timeMin) {
    if (timeMin == null) return false;
    if (typeof ROUTE_GRAPH === 'undefined' || !ROUTE_GRAPH) return false;
    const tt = ROUTE_GRAPH.throughTrains?.['3号线']?.haibangToAirportNorth;
    if (!tt || !tt.stationMap || !tt.stationMap.has(station)) return false;
    return timeMin < tt.stationMap.get(station);   // 严格小于
}

/**
 * 3 号线南北段分类。
 *  - 站点在 LINE3_NORTH_STATIONS → 'north'
 *  - 体育西路：看下一站，若下一站是北段站 → 'north'，否则 'south'
 *  - 其余（含南段、支线） → 'south'
 */
function classifyLine3Station(station, nextStation) {
    if (station === '体育西路') {
        if (nextStation && isLine3NorthStation(nextStation)) return 'north';
        return 'south';
    }
    if (isLine3NorthStation(station)) return 'north';
    return 'south';
}

function isLine3NorthStation(station) {
    if (!station) return false;
    if (LINE3_NORTH_STATIONS.has(station)) return true;
    // 别名：机场北 vs 机场北（T2）
    if (station === '机场北' && LINE3_NORTH_STATIONS.has('机场北（T2）')) return true;
    if (station === '机场北（T2）' && LINE3_NORTH_STATIONS.has('机场北')) return true;
    return false;
}