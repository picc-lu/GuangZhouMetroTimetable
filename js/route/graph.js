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