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

            for (const e of data.edges) {
                let m = edges.get(e.f);
                if (!m) { m = new Map(); edges.set(e.f, m); }
                m.set(e.t, e.w);

                let arr = succ.get(e.f);
                if (!arr) { arr = []; succ.set(e.f, arr); }
                arr.push(e.t);
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
            ROUTE_GRAPH.guides = guides;
            ROUTE_GRAPH.walkSpeed = data.walkSpeed || 1.5;
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
    return w === undefined ? null : w;
}

function routeGetSuccessors(node) {
    return ROUTE_GRAPH.succ.get(node) || [];
}

function routeEdgeKey(from, to) {
    return from + '\u0001' + to;
}