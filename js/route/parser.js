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
            lineName = lineName.replace(/[号线]/g, '').replace(/佛山/g, '佛');
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

        // 3号线支线站点集合
        const isBranch = (st) => ['石牌桥', '岗顶', '华师', '五山', '天河客运站'].includes(st);

        let isThrough = false;
        if (next && seg.fullLine === '3号线' && next.fullLine === '3号线' && seg.toStation === '体育西路') {
            if (isNorthboundRawDir(next.rawDirection)) {
                // 向北：去支线无条件合并，去北段需看贯通车
                isThrough = isBranch(next.toStation) || isThroughTrainAvailable(seg.fromStation, dt);
            } else if (isBranch(seg.fromStation) && next.rawDirection.includes('海傍')) {
                // ★ 新增：支线 -> 南段，常态化直达交路（如 华师 -> 体育西路 -> 傍江）
                isThrough = true;
            }
        }

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

    // 👇 ★ 新增 2.5：检测 3 号线跨南北段且无直达车的情况，强制拆分为两段 👇
    const splitMerged = [];
    for (let i = 0; i < merged.length; i++) {
        const seg = merged[i];
        if (seg.fullLine === '3号线') {
            const isNorth = (st) => {
                if (typeof _isLine3NorthStation === 'function') return _isLine3NorthStation(st);
                if (typeof LINE3_NORTH_STATIONS !== 'undefined' && LINE3_NORTH_STATIONS.has(st)) return true;
                if (st === '机场北' && typeof LINE3_NORTH_STATIONS !== 'undefined' && LINE3_NORTH_STATIONS.has('机场北（T2）')) return true;
                return false;
            };
            const isSouth = (st) => (typeof LINE3_MAIN_SOUTH !== 'undefined' && LINE3_MAIN_SOUTH.has(st));
            const isBranch = (st) => (typeof LINE3_BRANCH !== 'undefined' && LINE3_BRANCH.has(st));

            const fromIsNorthOrBranch = isNorth(seg.fromStation) || isBranch(seg.fromStation);
            const toIsSouth = isSouth(seg.toStation);
            const fromIsSouth = isSouth(seg.fromStation);
            const toIsNorthOrBranch = isNorth(seg.toStation) || isBranch(seg.toStation);

            // 只要横跨了南北段（比如北段/支线 -> 南段，或者南段 -> 北段/支线）
            const isCross = (fromIsNorthOrBranch && toIsSouth) || (fromIsSouth && toIsNorthOrBranch);

            if (isCross) {
                let needsSplit = false;
                let currentMin = dt;
                if (currentMin == null && typeof getRouteDepartMin === 'function') {
                    currentMin = getRouteDepartMin();
                }
                currentMin = currentMin || 0;

                // ★ 核心：只要支线参与了跨段，就是常态化交路，无需拆分
                if (isBranch(seg.fromStation) || isBranch(seg.toStation)) {
                    needsSplit = false;
                } else if (fromIsNorthOrBranch && toIsSouth) {
                    // 北段 -> 南段：查北向南贯通车
                    if (typeof isThroughTrainAvailable === 'function') {
                        needsSplit = !isThroughTrainAvailable(seg.fromStation, currentMin, 'northToSouth');
                    } else {
                        needsSplit = currentMin >= 1371; // 兜底
                    }
                } else if (fromIsSouth && toIsNorthOrBranch) {
                    // 南段 -> 北段：查南向北贯通车
                    if (typeof isThroughTrainAvailable === 'function') {
                        needsSplit = !isThroughTrainAvailable(seg.fromStation, currentMin, 'southToNorth');
                    } else {
                        needsSplit = true;
                    }
                }

                if (needsSplit) {
                    splitMerged.push({
                        fullLine: '3号线',
                        fromStation: seg.fromStation,
                        toStation: '体育西路',
                        rawDirection: seg.rawDirection
                    });
                    splitMerged.push({
                        fullLine: '3号线',
                        fromStation: '体育西路',
                        toStation: seg.toStation,
                        rawDirection: seg.rawDirection
                    });
                    continue;
                }
            }
        }
        splitMerged.push(seg);
    }

    // 3. 合并零长度段（fromStation === toStation 的过渡段）
    const compacted = [];
    for (let i = 0; i < splitMerged.length; i++) {  // ★ 修复：将 merged 改为 splitMerged
        const cur = splitMerged[i];
        if (cur.fromStation === cur.toStation) {
            // 零长度段直接丢弃，把起点顺延给下一段（如果存在的话）
            if (i + 1 < splitMerged.length) {  // ★ 修复：将 merged 改为 splitMerged
                splitMerged[i + 1].fromStation = cur.fromStation;
            }
            continue;
        }
        compacted.push(cur);
    }

    // 4. 计算 shortName / 颜色
    compacted.forEach(s => {
        let sn;
        // 14 号线支线 / 知识城支线 → 统一简写为「14支」
        if (/^14号线(支线|\(知识城\))$/.test(s.fullLine)) {
            sn = '14支';
        } else {
            sn = s.fullLine
                .replace(/号线北$/, '')
                .replace(/号线$/, '')
                .replace(/线$/, '');
            if (sn.includes('佛山')) sn = sn.replace(/佛山/g, '佛');
        }
        s.shortName = sn;

        s.color = (typeof LINE_COLORS !== 'undefined' && LINE_COLORS[s.fullLine]) || '#888';
        s.textColor = (typeof getContrastColor === 'function')
            ? getContrastColor(s.color)
            : '#ffffff';
    });

    return compacted;
}

/** 该方向是否属于 3 号线"向北"（体育西路方向 / 机场北方向 / 天河客运站方向） */
function isNorthboundRawDir(rawDir) {
    if (!rawDir) return false;
    return rawDir.includes('体育西路')
        || rawDir.includes('机场北')
        || rawDir.includes('天河客运站');
}

/**
 * 3 号线贯通车在指定站是否仍可搭。
 * @param {string} station   站名
 * @param {number|null} timeMin  出发/boarding 时刻
 * @param {string} direction  'southToNorth' (南向北) 或 'northToSouth' (北向南)
 * @returns {boolean}
 */
function isThroughTrainAvailable(station, timeMin, direction = 'southToNorth') {
    if (timeMin == null) return false;
    if (typeof ROUTE_GRAPH === 'undefined' || !ROUTE_GRAPH) return false;

    // 根据方向选择对应的数据包
    const dirKey = direction === 'southToNorth' ? 'haibangToAirportNorth' : 'airportNorthToHaibang';
    const tt = ROUTE_GRAPH.throughTrains?.['3号线']?.[dirKey];

    if (!tt || !tt.stationMap || !tt.stationMap.has(station)) return false;
    return timeMin < tt.stationMap.get(station);   // 严格小于
}