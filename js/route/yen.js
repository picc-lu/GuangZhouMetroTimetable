// ========== Yen K 短路 ==========

function yenKShortestPaths(startNode, endNode, K, globalBannedEdges = null) {
    const result = [];
    if (K <= 0) return result;

    const first = dijkstraPath(startNode, endNode, globalBannedEdges, null);
    if (!first) return result;
    result.push(first);

    // 路径越短，说明路线越直接，不需要太多时间；路径越长，涉及换乘复杂，适当放宽时间
    // 以节点数的 5 倍作为基准（例如 20个节点=100ms，100个节点=500ms），限制在 100 ~ 700ms
    const estimatedTime = first.nodes.length / 2 * 10;
    const MAX_YEN_TIME = Math.max(100, Math.min(700, estimatedTime));

    const candidates = new MinHeap();
    const seenKeys = new Set();
    seenKeys.add(first.nodes.join('\u0001'));

    // 【修改】Yen 算法耗时限制，根据最短路节点数动态计算
    const startTime = performance.now();
    for (let k = 1; k < K; k++) {
        // 【新增】超时检查
        if (performance.now() - startTime > MAX_YEN_TIME) {
            console.warn(`[Yen] 路径生成超时 (${MAX_YEN_TIME}ms)，已提前结束搜索`);
            break;
        }
        const prevPath = result[k - 1];
        const prevNodes = prevPath.nodes;

        for (let i = 0; i < prevNodes.length - 1; i++) {
            const spurNode = prevNodes[i];
            const rootPath = prevNodes.slice(0, i + 1);
            const rootKey = rootPath.join('\u0001');

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
            const totalPath = buildPathFromNodes(totalNodes);
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
    return {nodes, totalCost: total};
}