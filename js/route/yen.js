// ========== Yen K 短路 ==========

const YEN_MAX_K = 50;
const YEN_TARGET = 10;

function yenKShortestPaths(startNode, endNode, K, globalBannedEdges = null) {
    const result = [];
    if (K <= 0) return result;

    const first = dijkstraPath(startNode, endNode, globalBannedEdges, null);
    if (!first) return result;
    result.push(first);

    const candidates = new MinHeap();
    const seenKeys = new Set();
    seenKeys.add(first.nodes.join('\u0001'));

    for (let k = 1; k < K; k++) {
        const prevPath  = result[k - 1];
        const prevNodes = prevPath.nodes;

        for (let i = 0; i < prevNodes.length - 1; i++) {
            const spurNode = prevNodes[i];
            const rootPath = prevNodes.slice(0, i + 1);
            const rootKey  = rootPath.join('\u0001');

            const bannedEdges = new Set();
            const bannedNodes = new Set();

            for (const p of result) {
                const pNodes = p.nodes;
                if (pNodes.length > i + 1
                    && pNodes.slice(0, i + 1).join('\u0001') === rootKey) {
                    bannedEdges.add(routeEdgeKey(pNodes[i], pNodes[i + 1]));
                }
            }
            for (let j = 0; j < i; j++) bannedNodes.add(rootPath[j]);

            // 合并全局禁边（站外换乘）
            const mergedBannedEdges = globalBannedEdges
                ? new Set([...bannedEdges, ...globalBannedEdges])
                : bannedEdges;

            const spurPath = dijkstraPath(spurNode, endNode, mergedBannedEdges, bannedNodes);
            if (!spurPath) continue;

            const totalNodes = rootPath.concat(spurPath.nodes.slice(1));
            const totalPath  = buildPathFromNodes(totalNodes);
            if (!totalPath) continue;

            const key = totalPath.nodes.join('\u0001');
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            candidates.push(totalPath, totalPath.totalCost);
        }

        if (candidates.size === 0) break;
        result.push(candidates.pop().node);
    }
    return result;
}

function buildPathFromNodes(nodes) {
    let total = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
        const w = routeGetEdgeWeight(nodes[i], nodes[i + 1]);
        if (w === null) return null;
        total += w;
    }
    return { nodes, totalCost: total };
}