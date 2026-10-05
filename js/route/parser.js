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

                let marginMin = null;
                if (typeof getBoardingMargin === 'function') {
                    marginMin = getBoardingMargin(vParts[0], uParts[1], vParts[2], boardingTime);
                }

                result.push({ key, timeMin: t, walkMin, boardingTime, marginMin });
            }
        }
        if (w !== null) t += w / 60;
    }
    return result;
}

/** 把 path 拆成有序的线路段，附带线路色与起止站。 */
function parseRouteSegments(path) {
    const segments = [];
    let lastLine = null;
    let currentSeg = null;

    for (const node of path.nodes) {
        const parts = node.split('|');
        if (parts.length < 2) continue;
        if (parts[1] === '开始' || parts[1] === '结束') continue;

        let lineName = parts[0];
        if (lineName === '3号线北') lineName = '3号线';
        if (lineName === '佛山3号线北') lineName = '佛山3号线';

        const station = parts[1];

        if (lineName !== lastLine) {
            currentSeg = {
                fullLine: lineName,
                fromStation: station,
                toStation: station,
            };
            segments.push(currentSeg);
            lastLine = lineName;
        } else if (currentSeg) {
            currentSeg.toStation = station;
        }
    }

    segments.forEach(s => {
        s.shortName = s.fullLine.replace(/号|线/g, '').replace(/佛山/g, '佛');
        s.color = (typeof LINE_COLORS !== 'undefined' && LINE_COLORS[s.fullLine]) || '#888';
        s.textColor = (typeof getContrastColor === 'function')
            ? getContrastColor(s.color)
            : '#ffffff';
    });

    return segments;
}