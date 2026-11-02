// ========== 动态发车间隔与候车时间权重 ==========
let HEADWAY_DATA = null;
let _headwayPromise = null;

// 默认发车间隔（分钟），当数据缺失时使用
const DEFAULT_HEADWAY = 6;

function loadHeadwayData() {
    if (HEADWAY_DATA) return Promise.resolve(HEADWAY_DATA);
    if (_headwayPromise) return _headwayPromise;

    _headwayPromise = fetch('./data/headways.json')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            HEADWAY_DATA = data;
            console.log('[发车间隔] 数据已加载');
            return data;
        })
        .catch(err => {
            console.warn('[发车间隔] 加载失败，使用默认值：', err);
            HEADWAY_DATA = { weekday: {}, weekend: {} };
            return HEADWAY_DATA;
        });

    return _headwayPromise;
}

/**
 * 判断今天是工作日还是节假日
 */
function getDayType() {
    const day = new Date().getDay();
    // 暂定周六(6)、周日(0)为节假日
    return (day === 0 || day === 6) ? 'weekend' : 'weekday';
}

/**
 * 获取某条线路在指定时刻（分钟数）的发车间隔
 * @param {string} lineName 线路名（如 "1号线"）
 * @param {number} timeMin 距离0点的分钟数
 */
function getHeadwayAt(lineName, timeMin) {
    if (!HEADWAY_DATA) return DEFAULT_HEADWAY;

    const dayType = getDayType();
    let lineData = HEADWAY_DATA[dayType]?.[lineName];

    if (!lineData) {
        const otherType = dayType === 'weekday' ? 'weekend' : 'weekday';
        lineData = HEADWAY_DATA[otherType]?.[lineName];
        if (!lineData) return DEFAULT_HEADWAY;
    }

    // 将 timeMin 转换为 "HH:MM" 格式 (例如 "07:05")
    const mm = ((timeMin % 1440) + 1440) % 1440;
    const h = Math.floor(mm / 60);
    const m = mm % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // 找出数据中配置的所有时间点（排除 start）
    const rawTimes = Object.keys(lineData).filter(k => k !== 'start');

    // ====== 新增：标准化时间格式，兼容 "7:00" 和 "07:00" ======
    const times = rawTimes.map(t => {
        const parts = t.split(':');
        if (parts.length === 2) {
            // 补全小时的前导零，例如 "7:00" -> "07:00"
            return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
        return t; // 兜底
    }).sort();
    // ========================================================

    let currentHeadway = lineData['start'] || DEFAULT_HEADWAY;

    for (const t of times) {
        if (timeStr >= t) {
            // 注意：这里要反向查找回原始的 key 去取值，因为原始 key 可能没有前导零
            const originalKey = rawTimes.find(rk => {
                const p = rk.split(':');
                return p.length === 2
                    ? `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}` === t
                    : rk === t;
            });
            currentHeadway = lineData[originalKey];
        } else {
            break;
        }
    }

    return currentHeadway;
}

/**
 * 根据规划的出发时间，动态调整 ROUTE_GRAPH 的边权重
 * @param {number} departMin 出发时间（距离0点的分钟数）
 */
function applyDynamicHeadway(departMin) {
    if (typeof ROUTE_GRAPH === 'undefined' || !ROUTE_GRAPH.loaded || !ROUTE_GRAPH.originalEdges) {
        return;
    }

    // 1. 先把所有边恢复成原始权重（清除上一次的动态候车时间）
    for (const [from, toMap] of ROUTE_GRAPH.originalEdges.entries()) {
        const currentMap = ROUTE_GRAPH.edges.get(from);
        for (const [to, w] of toMap.entries()) {
            currentMap.set(to, w);
        }
    }

    // 2. 遍历所有边，找出 "站台 -> 发动" 的边，增加发车间隔一半的候车时间
    for (const [from, toMap] of ROUTE_GRAPH.edges.entries()) {
        const fp = from.split('|');
        // 只处理站台节点： 格式如 "1号线|体育西路|广州东站方向|站台"
        if (fp.length < 4 || fp[3] !== '站台') continue;

        const lineName = fp[0];
        const headwayMin = getHeadwayAt(lineName, departMin);
        const waitSeconds = (headwayMin / 2) * 60; // 候车时间转为秒

        for (const [to, w] of toMap.entries()) {
            const tp = to.split('|');
            if (tp.length >= 4 && tp[3] === '发动') {
                // 新权重 = 原权重(作业时间) + 期望候车时间
                toMap.set(to, w + waitSeconds);
            }
        }
    }
}