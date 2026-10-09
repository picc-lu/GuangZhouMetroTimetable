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
};

function loadRouteGraph() {
    if (ROUTE_GRAPH.loaded) return Promise.resolve();
    if (ROUTE_GRAPH.loading) return ROUTE_GRAPH.loading;

    ROUTE_GRAPH.loading = fetch('./data/metro-graph.json')
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
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
            ROUTE_GRAPH.loaded = true;
            console.log(
                `[路径] 图加载完成：${nodes.size} 节点，${data.edges.length} 边，${guides.size} 条换乘指引，版本 ${ROUTE_GRAPH.version}`
            );
        })
        .catch(err => {
            ROUTE_GRAPH.loading = null;
            throw err;
        });

    return ROUTE_GRAPH.loading;
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