// ========== 路径规划：图加载 ==========

const ROUTE_GRAPH = {
    loaded: false,
    loading: null,
    nodes: null,    // Set<string>
    edges: null,    // Map<from, Map<to, weight>>
    succ: null,     // Map<from, Array<to>>
    guides: null,   // Map<key, guide>
    walkSpeed: 1.5,
    version: '',
    throughTrains: null,
};

function loadRouteGraph() {
    if (ROUTE_GRAPH.loaded) return Promise.resolve();
    if (ROUTE_GRAPH.loading) return ROUTE_GRAPH.loading;

    const fetchJson = (url) => fetch(url).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} - ${url}`);
        return r.json();
    });

    ROUTE_GRAPH.loading = Promise.all([
        fetchJson('./data/metro-graph.json'),
        // 3 号线贯通车数据：可选，加载失败不阻断路径规划
        fetchJson('./data/line3-through-train.json').catch(err => {
            console.warn('[路径] 贯通车数据加载失败，相关判定将回落到常规逻辑：', err);
            return null;
        }),
    ])
        .then(([data, throughData]) => {
            const nodes = new Set(data.nodes);
            const edges = new Map();
            const succ = new Map();
            const walkEdges = new Set();   // ★ 换乘步行边集合

            for (const e of data.edges) {
                let m = edges.get(e.f);
                if (!m) { m = new Map(); edges.set(e.f, m); }
                m.set(e.t, e.w);

                let arr = succ.get(e.f);
                if (!arr) { arr = []; succ.set(e.f, arr); }
                arr.push(e.t);

                // ★ 判断换乘步行边：到站 → 站台
                const fp = e.f.split('|');
                const tp = e.t.split('|');
                if (fp.length >= 4 && tp.length >= 4
                    && fp[3] === '到站' && tp[3] === '站台') {
                    walkEdges.add(e.f + '\u0001' + e.t);
                }
            }

            const guides = new Map();
            if (data.guides) {
                for (const k of Object.keys(data.guides)) {
                    guides.set(k, data.guides[k]);
                }
            }

            ROUTE_GRAPH.nodes = nodes;
            ROUTE_GRAPH.edges = edges;
            ROUTE_GRAPH.succ = succ;
            ROUTE_GRAPH.walkEdges = walkEdges;              // ★
            ROUTE_GRAPH.guides = guides;
            ROUTE_GRAPH.walkSpeed = data.walkSpeed || 1.5;
            ROUTE_GRAPH.userWalkSpeed = 1.5;                 // ★ 默认"正常"
            ROUTE_GRAPH.version = data.version || '';
            ROUTE_GRAPH.throughTrains = buildThroughTrains(throughData);  // ★ 新增
            ROUTE_GRAPH.loaded = true;
            console.log(
                `[路径] 图加载完成：${nodes.size} 节点，${data.edges.length} 边，${guides.size} 条换乘指引，版本 ${ROUTE_GRAPH.version}`
            );
            const ttKeys = Object.keys(ROUTE_GRAPH.throughTrains || {});
            if (ttKeys.length > 0) {
                console.log(`[路径] 贯通车数据已加载：${ttKeys.join(', ')}`);
            }
        })
        .catch(err => {
            ROUTE_GRAPH.loading = null;
            throw err;
        });

    return ROUTE_GRAPH.loading;
}

/**
 * 预处理贯通车 JSON：把 stations 数组转成 Map<站名, timeMin>，便于 O(1) 查询。
 * @param {Object|null} raw  line3-through-train.json 的原始内容
 * @returns {Object} { '3号线': { haibangToAirportNorth: { calibration, stationMap, stations } } }
 */
function buildThroughTrains(raw) {
    const result = {};
    if (!raw || !raw.directions) return result;

    // "3号线贯通车" → "3号线"
    const line = raw.line ? String(raw.line).replace(/贯通车$/, '') : null;
    if (!line) return result;

    const dirs = {};
    for (const [dirKey, dirData] of Object.entries(raw.directions)) {
        if (!dirData || !Array.isArray(dirData.stations) || dirData.stations.length === 0) {
            continue;   // 该方向暂无数据 → 跳过
        }
        const stationMap = new Map();
        for (const s of dirData.stations) {
            if (s && s.station && typeof s.timeMin === 'number') {
                stationMap.set(s.station, s.timeMin);
            }
        }
        dirs[dirKey] = {
            calibration: dirData.calibration || null,
            stationMap,
            stations: dirData.stations,
        };
    }

    if (Object.keys(dirs).length > 0) {
        result[line] = dirs;
    }
    return result;
}

function routeGetEdgeWeight(from, to) {
    const m = ROUTE_GRAPH.edges.get(from);
    if (!m) return null;
    const w = m.get(to);
    if (w === undefined) return null;

    // ★ 换乘步行边按用户速度缩放
    if (ROUTE_GRAPH.walkEdges && ROUTE_GRAPH.walkEdges.has(from + '\u0001' + to)) {
        const speed = ROUTE_GRAPH.userWalkSpeed || 1.5;
        if (speed !== 1.5) {
            return Math.round(w * 1.5 / speed);
        }
    }
    return w;
}

function routeGetSuccessors(node) {
    return ROUTE_GRAPH.succ.get(node) || [];
}

function routeEdgeKey(from, to) {
    return from + '\u0001' + to;
}

/* ==========================================
   站名兼容工具：别名 / 括号差异（如 机场北 ↔ 机场北（T2））
   ========================================== */

/** 在站名数组中查找站，兼容别名与括号差异。返回索引，找不到返回 -1。 */
function findStationIndex(lineStations, station) {
    if (!Array.isArray(lineStations) || !station) return -1;

    // 1. 精确匹配
    let idx = lineStations.indexOf(station);
    if (idx >= 0) return idx;

    // 2. 别名映射（STATION_NAME_ALIASES 是双向表）
    if (typeof STATION_NAME_ALIASES !== 'undefined') {
        const aliased = STATION_NAME_ALIASES[station];
        if (aliased) {
            idx = lineStations.indexOf(aliased);
            if (idx >= 0) return idx;
        }
    }

    // 3. 去括号后匹配（如 机场北（T2） ↔ 机场北）
    const strip = (s) => String(s).replace(/[（(][^）)]*[）)]/g, '');
    const stripped = strip(station);
    if (!stripped) return -1;
    for (let i = 0; i < lineStations.length; i++) {
        if (strip(lineStations[i]) === stripped) return i;
    }
    return -1;
}

/** 判断两个站名是否指同一个站（兼容别名与括号差异）。 */
function isSameStation(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;

    if (typeof STATION_NAME_ALIASES !== 'undefined') {
        if (STATION_NAME_ALIASES[a] === b) return true;
        if (STATION_NAME_ALIASES[b] === a) return true;
    }

    const strip = (s) => String(s).replace(/[（(][^）)]*[）)]/g, '');
    const sa = strip(a), sb = strip(b);
    return sa !== '' && sa === sb;
}

/* ==========================================
   短线车数据（独立于 ROUTE_GRAPH 加载，UI 弹窗也能随时读取）
   ========================================== */
const SHORT_SERVICES = {
    loaded: false,
    loading: null,
    data: null,      // { '4号线': [ { endpoints: [...], note } ], ... }
};

function loadShortServices() {
    if (SHORT_SERVICES.loaded) return Promise.resolve(SHORT_SERVICES.data);
    if (SHORT_SERVICES.loading) return SHORT_SERVICES.loading;

    SHORT_SERVICES.loading = fetch('./data/short-services.json')
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(raw => {
            SHORT_SERVICES.data = buildShortServices(raw);
            SHORT_SERVICES.loaded = true;
            const lines = Object.keys(SHORT_SERVICES.data);
            if (lines.length > 0) {
                console.log(`[路径] 短线车数据已加载：${lines.join(', ')}`);
            }
            return SHORT_SERVICES.data;
        })
        .catch(err => {
            console.warn('[路径] 短线车数据加载失败：', err);
            SHORT_SERVICES.data = {};
            SHORT_SERVICES.loaded = true;
            return {};
        });

    return SHORT_SERVICES.loading;
}

function buildShortServices(raw) {
    const result = {};
    if (!raw || !Array.isArray(raw.services)) return result;
    for (const svc of raw.services) {
        if (!svc || !svc.line || !svc.start || !svc.end) continue;
        if (!result[svc.line]) result[svc.line] = [];
        result[svc.line].push({
            start: svc.start,
            end: svc.end,
            note: svc.note || `${svc.line}存在短线车`,
        });
    }
    return result;
}

/** 取某条线路的所有短线车定义（未加载时返回空数组） */
function getShortServicesOfLine(line) {
    if (!line || !SHORT_SERVICES.data) return [];
    return SHORT_SERVICES.data[line] || [];
}

/**
 * 该站是否是某条短线车的"折返终点站"。
 * 只有 end 端算折返站；start 端是正常发车站，不算。
 */
function isShortServiceEndpoint(line, station) {
    if (!line || !station) return false;
    return getShortServicesOfLine(line).some(svc => isSameStation(svc.end, station));
}

/**
 * 判断"从 fromStation 到 toStation 的这段线路"是否涉及短线车。
 * 只有折返站（end）才是需要提醒的；start 端是正常发车站，不算短线车。
 * @returns {Object|null}
 */
function getShortServiceWarning(line, fromStation, toStation) {
    const services = getShortServicesOfLine(line);
    if (services.length === 0) return null;
    for (const svc of services) {
        if (isSameStation(svc.end, fromStation) || isSameStation(svc.end, toStation)) {
            return svc;
        }
    }
    return null;
}

/**
 * 若某条短线车的 end 站落在"boarding 沿运行方向、不超过 segmentEnd"的区间内，
 * 返回该 end 站名，否则返回 null。
 *
 * 关键：短线车有方向（start → end），只有用户运行方向与短线车方向一致、
 * 且 svc.end 落在用户路径区间内时才命中。
 *
 * @param {string} line          线路名
 * @param {string} boardStation  上车站名
 * @param {string} segmentEnd    本段最远下游站名
 * @returns {string|null}
 */
function getShortServiceCoveringEnd(line, boardStation, segmentEnd) {
    const services = getShortServicesOfLine(line);
    if (services.length === 0) return null;

    const aliases = (typeof getLineAliases === 'function') ? getLineAliases(line) : [line];

    let lineStations = null;
    let idxStation = -1;
    let idxSegEnd = -1;
    for (const ln of aliases) {
        const arr = (typeof LINE_STATIONS !== 'undefined' && LINE_STATIONS[ln]) || [];
        if (arr.length === 0) continue;
        const i1 = findStationIndex(arr, boardStation);
        const i2 = findStationIndex(arr, segmentEnd);
        if (i1 >= 0 && i2 >= 0) {
            lineStations = arr;
            idxStation = i1;
            idxSegEnd = i2;
            break;
        }
    }
    if (!lineStations) return null;

    const isUserForward = idxSegEnd > idxStation;

    for (const svc of services) {
        const idxEnd = findStationIndex(lineStations, svc.end);
        if (idxEnd < 0) continue;

        if (isUserForward) {
            if (idxEnd > idxStation && idxEnd <= idxSegEnd) return svc.end;
        } else {
            if (idxEnd < idxStation && idxEnd >= idxSegEnd) return svc.end;
        }
    }
    return null;
}

/**
 * 收集 node 之后的、与 node 同线路、按顺序出现的站名（相邻去重）。
 * @param {string} node     起点的完整节点名
 * @param {string[]} allNodes 整条 path.nodes
 * @returns {string[]}
 */
function collectDownstreamStations(startIdx, allNodes) {
    const startParts = allNodes[startIdx].split('|');
    if (startParts.length < 4) return [];
    const line = startParts[0];

    const downstream = [];
    for (let j = startIdx + 1; j < allNodes.length; j++) {
        const p = allNodes[j].split('|');
        if (p.length < 2) continue;
        if (p[0] !== line) break;
        const st = p[1];
        if (st === '开始' || st === '结束') continue;
        if (downstream[downstream.length - 1] !== st) downstream.push(st);
    }
    return downstream;
}