// ========== 路径规划主逻辑（含末班车可达性检查 + 排序模式） ==========

const PLAN_MAX_K = 50;
const PLAN_TARGET = 10;
const PLAN_MAX_CHECK = 30;

const LINE_NAME_ALIASES = {
    '3号线': ['3号线', '3号线北'],
    '3号线北': ['3号线', '3号线北'],
    '佛山3号线': ['佛山3号线', '佛山3号线北'],
    '佛山3号线北': ['佛山3号线', '佛山3号线北'],
    '12号线西': ['12号线西', '12号线东'],
    '12号线东': ['12号线西', '12号线东'],
    '12号线': ['12号线西', '12号线东'],
    '14号线': ['14号线', '14号线支线','14号线(知识城)'],
    '14号线支线': ['14号线', '14号线支线','14号线(知识城)'],
    '14号线(知识城)': ['14号线', '14号线支线','14号线(知识城)']
};

function getLineAliases(line) {
    return LINE_NAME_ALIASES[line] || [line];
}

function getLineStationData(line, station) {
    for (const l of getLineAliases(line)) {
        const d = lineDirectionTime[l]?.[station];
        if (d) return d;
    }
    return null;
}

const LINE3_NORTH_STATIONS = new Set([
    '机场北（T2）', '机场南', '高增', '人和', '龙归', '嘉禾望岗',
    '白云大道北', '永泰', '同和', '京溪南方医院', '梅花园', '燕塘',
    '广州东站', '林和西'
]);

const LINE3_MAIN_SOUTH = new Set([
    '番禺广场', '市桥', '汉溪长隆', '大石', '厦滘',
    '沥滘', '大塘', '客村', '广州塔', '珠江新城', '海傍'
]);

const LINE3_BRANCH = new Set([
    '石牌桥', '岗顶', '华师', '五山', '天河客运站'
]);

function resolveJavaDirectionToWeb(javaLine, station, javaDir) {
    if (javaLine !== '3号线') return {line: javaLine, dir: javaDir};

    if (LINE3_NORTH_STATIONS.has(station)) {
        if (javaDir === '海傍方向') return {line: '3号线北', dir: '体育西路方向'};
        if (javaDir === '体育西路方向') return {line: '3号线北', dir: '体育西路方向'};
        if (javaDir === '机场北方向') return {line: '3号线北', dir: '机场北（T2）方向'};
    }

    if (station === '体育西路') {
        if (javaDir === '海傍方向') return {line: '3号线', dir: '海傍方向'};
        if (javaDir === '机场北方向') return {line: '3号线北', dir: '机场北（T2）方向'};
        if (javaDir === '天河客运站方向') return {line: '3号线', dir: '天河客运站方向'};
        if (javaDir === '体育西路方向') return {line: '3号线', dir: '海傍方向'};
    }

    if (LINE3_MAIN_SOUTH.has(station)) {
        if (javaDir === '体育西路方向') return {line: '3号线', dir: '天河客运站方向'};
        if (javaDir === '海傍方向') return {line: '3号线', dir: '海傍方向'};
    }

    if (LINE3_BRANCH.has(station)) {
        if (javaDir === '天河客运站方向') return {line: '3号线', dir: '天河客运站方向'};
        if (javaDir === '体育西路方向') return {line: '3号线', dir: '海傍方向'};
    }

    return {line: javaLine, dir: javaDir};
}

/* ==========================================
   站名归一化：Web API 站名 → Java 图站名
   ========================================== */

// 手工维护的硬别名（自动匹配实在处理不了的才放这里）
const STATION_NAME_ALIASES = {
    '机场北（T2）': '机场北',
    '机场北': '机场北（T2）',
    // 礌岗：Web API 用「虫雷 岗」（带空格），Java 图用「礌岗」
    '虫雷 岗': '礌岗',
    '虫雷岗': '礌岗',
};

/**
 * 尝试把输入站名解析成 ROUTE_GRAPH 里的节点名。
 * @param {string} rawName  用户输入的站名
 * @param {'start'|'end'} kind
 * @returns {string|null}   返回完整节点名（如 "机场北|开始"），失败返回 null
 */
function resolveGraphStationNode(rawName, kind) {
    if (!rawName) return null;
    const suffix = kind === 'start' ? '|开始' : '|结束';
    const name = String(rawName).trim();

    // 1. 精确匹配
    if (ROUTE_GRAPH.nodes.has(name + suffix)) return name + suffix;

    // 2. 硬别名表
    const aliased = STATION_NAME_ALIASES[name];
    if (aliased && ROUTE_GRAPH.nodes.has(aliased + suffix)) return aliased + suffix;

    // 3. 剥离括号尾缀后再试（全角/半角括号）
    const stripped = name.replace(/[（(][^）)]*[）)]/g, '').trim();
    if (stripped && stripped !== name && ROUTE_GRAPH.nodes.has(stripped + suffix)) {
        return stripped + suffix;
    }

    // 4. 包含关系匹配：图里某个站点名与本名互为包含（取最短的）
    const candidates = [];
    for (const n of ROUTE_GRAPH.nodes) {
        if (!n.endsWith(suffix)) continue;
        const stationName = n.slice(0, -suffix.length);
        if (stationName === name) return n;
        if (stationName.includes(name) || name.includes(stationName)) {
            candidates.push(stationName);
        }
    }
    if (candidates.length > 0) {
        candidates.sort((a, b) => a.length - b.length);
        return candidates[0] + suffix;
    }

    return null;
}

/* ==========================================
   主流程：支持排序模式
   ========================================== */
/**
 * @param {string} startStation
 * @param {string} endStation
 * @param {number} departMin
 * @param {'fastest'|'conservative'} sortMode
 */
async function planRoutes(startStation, endStation, departMin, sortMode = 'fastest') {
    await loadRouteGraph();

    const startNode = resolveGraphStationNode(startStation, 'start');
    const endNode = resolveGraphStationNode(endStation, 'end');

    if (!startNode) return { error: `起点「${startStation}」不在线路图中` };
    if (!endNode)   return { error: `终点「${endStation}」不在线路图中` };

    const paths = yenKShortestPaths(startNode, endNode, PLAN_MAX_K);

    const results = [];
    const rejected = [];
    let checkedCount = 0;

    for (const p of paths) {
        const stationRoute = parseStationRoute(p);

        // 检测完整站名序列（起点+途经+终点）中是否有任何重复
        const fullStations = [startStation, ...stationRoute, endStation];
        const seen = new Set();
        let duplicatedStation = null;
        for (const s of fullStations) {
            if (seen.has(s)) {
                duplicatedStation = s;
                break;
            }
            seen.add(s);
        }
        if (duplicatedStation) {
            rejected.push({
                reason: `路径重复经过「${duplicatedStation}」，已排除`,
                totalCost: p.totalCost,
            });
            continue;
        }

        const check = checkReachability(p, departMin);
        if (!check.feasible) {
            rejected.push({reason: check.reason, totalCost: p.totalCost});
            continue;
        }

        // urgentCount 只统计换乘站 boarding（起点不计入，起点余量交给用户自主判断）
        // boardings[0] 是起点，boardings[1..] 是换乘站
        const urgentCount = (check.boardingMargins || [])
            .filter(m => m != null && m !== 'unknown' && m < 15)
            .length;

        // 起点自身的余量单独存，UI 里显示提示
        const startMargin = (check.boardingMargins && check.boardingMargins.length > 0)
            ? check.boardingMargins[0] : null;

        results.push({
            path: p,
            totalCost: p.totalCost,
            arriveMin: check.arriveMin,
            stationRoute,
            route: parseInterchangeRoute(p, true),
            interchangeCost: parseInterchangeTimeCost(p),
            interchanges: parseInterchangeKeys(p, departMin),
            warnings: checkThreeLineCrossSegment(p, departMin),
            urgentCount,
            boardingMargins: check.boardingMargins,
            startMargin,                                       // ← 新增
        });

        checkedCount++;
        if (checkedCount >= PLAN_MAX_CHECK) break;
    }

    if (sortMode === 'conservative') {
        results.sort((a, b) => a.urgentCount - b.urgentCount || a.totalCost - b.totalCost);
    } else {
        results.sort((a, b) => a.totalCost - b.totalCost);
    }

    const finalResults = results.slice(0, PLAN_TARGET);

    // 到达时间（显示到分钟）相同 → 并列同一名次
    let lastArrive = null;
    let currentRank = 0;
    finalResults.forEach((item, idx) => {
        const arriveFloor = Math.floor(item.arriveMin);
        if (lastArrive === null || arriveFloor !== lastArrive) {
            currentRank = idx + 1;
            lastArrive = arriveFloor;
        }
        item.rank = currentRank;
    });

    return {results: finalResults, rejected, totalPaths: paths.length};
}

function checkReachability(path, departMin) {
    let t = departMin;
    const boardings = [];

    for (let i = 0; i < path.nodes.length - 1; i++) {
        const u = path.nodes[i], v = path.nodes[i + 1];
        const w = routeGetEdgeWeight(u, v);
        if (w === null) return { feasible: false, reason: '路径边缺失' };

        const uParts = u.split('|');
        const vParts = v.split('|');

        if (vParts.length >= 4 && vParts[3] === PLATFORM) {
            const isBoarding =
                (uParts[1] === '开始') ||
                (uParts.length >= 4 && uParts[3] === ARRIVED && uParts[0] !== vParts[0]);
            if (isBoarding) {
                // 收集 boarding 之后、同一线路上按顺序出现的所有站（连续同名去重）
                const downstream = [];
                for (let j = i + 1; j < path.nodes.length; j++) {
                    const p = path.nodes[j].split('|');
                    if (p.length < 2) continue;
                    if (p[0] !== vParts[0]) break;
                    const st = p[1];
                    if (st === '开始' || st === '结束') continue;
                    if (downstream[downstream.length - 1] !== st) downstream.push(st);
                }
                boardings.push({
                    line: vParts[0],
                    station: vParts[1],
                    direction: vParts[2],
                    boardTimeMin: t + w / 60,
                    downstreamStations: downstream,
                });
            }
        }
        t += w / 60;
    }

    const boardingMargins = [];
    for (const b of boardings) {
        const margin = getBoardingMargin(b.line, b.station, b.direction,
            b.boardTimeMin, b.downstreamStations);
        if (margin === 'unknown') {
            console.warn(`[末班车-数据缺失] ${b.station} 站 ${b.line} 往${b.direction} 无末班车数据，已放行`);
            boardingMargins.push(null);
            continue;
        }
        if (margin === null) {
            return {
                feasible: false,
                reason: `${b.station} 站 ${b.line} 往${b.direction}，到达站台时 ${fmtHM(b.boardTimeMin)} 已无运营`,
            };
        }
        boardingMargins.push(margin);
    }
    return { feasible: true, arriveMin: t, boardingMargins };
}

/**
 * 返回 boarding 时刻距离对应方向末班车的余量（分钟）。
 *  - null      → 明确停运
 *  - 'unknown' → 数据缺失，无法判定（应放行）
 *  - number    → 剩余分钟
 * @param {string[]} [downstreamStations] 该 boarding 之后、同一线路上按顺序出现的站名（可选）
 */
function getBoardingMargin(line, station, dirStr, timeMin, downstreamStations) {
    const resolved = resolveJavaDirectionToWeb(line, station, dirStr);
    const webLine = resolved.line;
    const webDir = resolved.dir;

    // 11 号线：特殊结构 + 区间车覆盖检查
    if (webLine === '11号线') {
        return getLine11BoardingMargin(station, webDir, timeMin, downstreamStations);
    }

    // 其它线路
    const aliases = getLineAliases(webLine);
    const allRecords = [];
    for (const l of aliases) {
        const d = lineDirectionTime[l]?.[station];
        if (!d) continue;
        for (const t of (d.up   || [])) allRecords.push(t);
        for (const t of (d.down || [])) allRecords.push(t);
    }
    if (allRecords.length === 0) return 'unknown';

    const targetName = webDir.replace(/方向$/, '');
    const exactMatches = allRecords.filter(t => {
        const toName = t.to.split(/[（(]/)[0];
        return toName === targetName
            || t.to.includes(targetName)
            || targetName.includes(toName);
    });
    if (exactMatches.length > 0) {
        const matched = exactMatches.find(t => timeMin >= t.first && timeMin <= t.last);
        if (!matched) return null;
        return matched.last - timeMin;
    }

    // 兜底
    const latestLast = Math.max(...allRecords.map(t => t.last));
    if (timeMin > latestLast) return null;
    return latestLast - timeMin;
}

/**
 * 11 号线专用：判断 boarding 是否可以搭乘。
 *  - 全程车优先：命中 upFull/downFull → 直接放行
 *  - 区间车：命中 upTerminal/downTerminal 时，还要检查下游站是否都在区间车覆盖范围内
 */
function getLine11BoardingMargin(station, dirStr, timeMin, downstreamStations) {
    const d = getLineStationData('11号线', station);
    if (!d) return 'unknown';
    const hasAnyData = d.upFull || d.upTerminal || d.downFull || d.downTerminal;
    if (!hasAnyData) return 'unknown';

    const isOuter = dirStr.includes('外环');
    const isInner = dirStr.includes('内环');
    if (!isOuter && !isInner) return 'unknown';

    const full     = isOuter ? d.upFull     : d.downFull;
    const terminal = isOuter ? d.upTerminal : d.downTerminal;

    // 硬编码区间车终点（广州地铁 11 号线的固定设计）
    const terminalEnd = isOuter ? '龙潭' : '赤沙';

    // 1. 全程车优先
    if (full && timeMin >= full.first && timeMin <= full.last) {
        return full.last - timeMin;
    }

    // 2. 区间车：需检查路径下游站是否都在覆盖范围内
    if (terminal && timeMin >= terminal.first && timeMin <= terminal.last) {
        if (!downstreamStations || downstreamStations.length === 0) {
            // 无上下文（如换乘详情展示），保守放行
            return terminal.last - timeMin;
        }
        const within = isPathWithinTerminalRange(
            station, dirStr, terminalEnd, downstreamStations
        );
        if (within) {
            return terminal.last - timeMin;
        }
        return null;   // 区间车覆盖不到路径所有下游站 → 视为停运
    }

    return null;
}

/**
 * 沿 11 号线某方向从 startStation 走到 terminalEnd，
 * 检查 downstreamStations 是否都在这个区间内。
 */
function isPathWithinTerminalRange(startStation, dirStr, terminalEnd, downstreamStations) {
    if (!terminalEnd) return true;   // 兜底：没有终点名 → 放行

    const isOuter = dirStr.includes('外环');
    const dirName = isOuter ? '外环方向' : '内环方向';

    const covered = new Set([startStation]);
    let cur = startStation;
    let safety = 0;

    while (cur !== terminalEnd) {
        if (++safety > 100) return false;   // 防死循环

        const launchNode = `11号线|${cur}|${dirName}|发动`;
        let next = null;
        for (const s of routeGetSuccessors(launchNode)) {
            const p = s.split('|');
            if (p[0] === '11号线' && p[3] === '到站') {
                next = p[1];
                break;
            }
        }
        if (!next) return false;              // 图结构断了 → 保守判停运
        if (covered.has(next)) return false;  // 绕回起点还没到 terminalEnd → 判停运
        covered.add(next);
        cur = next;
    }

    for (const s of downstreamStations) {
        if (!covered.has(s)) return false;
    }
    return true;
}

/* ==========================================
   3号线南北段跨段警告
   ========================================== */
function checkThreeLineCrossSegment(path, departMin) {
    const warnings = [];

    const timeline = [];
    let t = departMin;
    for (let i = 0; i < path.nodes.length; i++) {
        timeline.push({node: path.nodes[i], timeMin: t});
        if (i < path.nodes.length - 1) {
            const w = routeGetEdgeWeight(path.nodes[i], path.nodes[i + 1]);
            if (w !== null) t += w / 60;
        }
    }

    const line3Stations = [];
    for (const entry of timeline) {
        const parts = entry.node.split('|');
        if (parts.length < 2) continue;
        if (parts[0] !== '3号线') continue;
        const station = parts[1];
        if (station === '开始' || station === '结束') continue;
        line3Stations.push({station, timeMin: entry.timeMin});
    }

    let northFirstIdx = -1;
    let southFirstIdx = -1;
    line3Stations.forEach((s, i) => {
        if (northFirstIdx < 0 && LINE3_NORTH_STATIONS.has(s.station)) northFirstIdx = i;
        if (southFirstIdx < 0 &&
            (LINE3_MAIN_SOUTH.has(s.station) || LINE3_BRANCH.has(s.station))) {
            southFirstIdx = i;
        }
    });

    if (northFirstIdx < 0 || southFirstIdx < 0) return warnings;

    let tiyuxiluTime = null;
    for (const s of line3Stations) {
        if (s.station === '体育西路') {
            tiyuxiluTime = s.timeMin;
            break;
        }
    }
    if (tiyuxiluTime === null) return warnings;

    const isSouthToNorth = southFirstIdx < northFirstIdx;
    const isNorthToSouth = northFirstIdx < southFirstIdx;

    // 北→南
    if (isNorthToSouth) {
        const southData = lineDirectionTime['3号线']?.['体育西路'];
        if (southData) {
            const southDown = (southData.down || [])
                .find(x => x.to === '海傍' || x.to.includes('海傍'));
            if (southDown && tiyuxiluTime > southDown.last) {
                warnings.push({
                    type: 'miss_south_train',
                    message: `约 ${fmtHM(tiyuxiluTime)} 到达体育西路时，天河客运站→海傍的末班车已于 ${fmtHM(southDown.last)} 发出。若乘坐体育西路方向的列车，可能赶不上南段末班车。`,
                    messageHtml: `约 <b>${fmtHM(tiyuxiluTime)}</b> 到达体育西路时，天河客运站→海傍的末班车已于 <b>${fmtHM(southDown.last)}</b> 发出。<br>若乘坐<strong class="route-warning-emphasis">体育西路方向</strong>的列车，可能赶不上南段末班车。`,
                    enterTyxTime: tiyuxiluTime,
                    southLastTrain: southDown.last,
                });
            }
        }
    }

    // 南→北
    if (isSouthToNorth && tiyuxiluTime >= 22 * 60) {
        const northData = lineDirectionTime['3号线北']?.['体育西路'];
        const northUp = northData ? (northData.up || []).find(x => x.to.includes('机场北')) : null;
        const northLast = northUp ? northUp.last : null;

        const metaLine = northLast !== null
            ? `<span class="route-warning-meta">体育西路往机场北方向末班车 ${fmtHM(northLast)}</span>`
            : '';

        warnings.push({
            type: 'south_to_north_no_through',
            message: `现时，3 号线可能已无机场北方向。如需前往机场北方向，可乘坐天河客运站方向的列车，在体育西路换乘。`
                + (northLast !== null ? `体育西路往机场北方向末班车为 ${fmtHM(northLast)}。` : ''),
            messageHtml: `现时，3 号线可能已无机场北方向。<br>如需前往机场北方向，可乘坐<b>天河客运站方向</b>的列车，在<strong class="route-warning-emphasis">体育西路</strong>换乘。${metaLine}`,
            enterTyxMin: tiyuxiluTime,
            northLastTrain: northLast,
        });
    }

    return warnings;
}

function fmtHM(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
}