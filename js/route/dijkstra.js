// ========== Dijkstra 单源最短路（支持禁边 / 禁点） ==========

function dijkstraPath(startNode, endNode, bannedEdges, bannedNodes) {
    bannedEdges = bannedEdges || new Set();
    bannedNodes = bannedNodes || new Set();
    if (bannedNodes.has(startNode) || bannedNodes.has(endNode)) return null;

    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    const heap = new MinHeap();

    dist.set(startNode, 0);
    heap.push(startNode, 0);

    while (heap.size > 0) {
        const { node: cur, key: curDist } = heap.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);

        if (cur === endNode) {
            return dijkstraReconstructPath(startNode, endNode, prev, curDist);
        }

        for (const succ of routeGetSuccessors(cur)) {
            if (visited.has(succ)) continue;
            if (bannedNodes.has(succ)) continue;
            if (bannedEdges.has(routeEdgeKey(cur, succ))) continue;

            const w = routeGetEdgeWeight(cur, succ);
            if (w === null) continue;

            const nd = curDist + w;
            const existing = dist.get(succ);
            if (existing === undefined || nd < existing) {
                dist.set(succ, nd);
                prev.set(succ, cur);
                heap.push(succ, nd);
            }
        }
    }
    return null;
}

function dijkstraReconstructPath(startNode, endNode, prev, totalCost) {
    const nodes = [];
    let cur = endNode;
    while (cur !== startNode) {
        nodes.unshift(cur);
        cur = prev.get(cur);
        if (cur === undefined) return null;
    }
    nodes.unshift(startNode);
    return { nodes, totalCost };
}