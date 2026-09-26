// ========== API 请求函数 ==========

/** 带重试的fetch */
async function requestWithRetry(url, options = {}, retries = RETRY_TIMES, timeoutMs = 8000) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const resp = await fetch(url, { ...options, mode: 'cors', signal: controller.signal });
            clearTimeout(timer);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.success === false) throw new Error('接口返回 success=false');
            return data;
        } catch (err) {
            if (i === retries - 1) throw err;
            // 缩短重试延迟：从 1s、2s 改为 500ms、1s
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
}

/** 规范化线路名称 */
function normalizeLineName(name) {
    return name
        .replace(/^一号线/g, '1号线')
        .replace(/^二号线/g, '2号线')
        .replace(/^三号线/g, '3号线')
        .replace(/^三北线/g, '3号线北')
        .replace(/^四号线/g, '4号线')
        .replace(/^五号线/g, '5号线')
        .replace(/^六号线/g, '6号线')
        .replace(/^七号线/g, '7号线')
        .replace(/^八号线/g, '8号线')
        .replace(/^九号线/g, '9号线')
        .replace(/^十号线/g, '10号线')
        .replace(/^十一号线/g, '11号线')
        .replace(/^十二号线$/g, '12号线西')
        .replace(/^十二号线（二沙岛-大学城南）/g, '12号线东')
        .replace(/^十三号线/g, '13号线')
        .replace(/^十四号线/g, '14号线')
        .replace(/^十八号线/g, '18号线')
        .replace(/二十一号线/g, '21号线')
        .replace(/二十二号线/g, '22号线')
        .replace(/佛山地铁二号线|佛山地铁2号线/g, '佛山2号线')
        .replace(/佛山地铁三号线|佛山地铁3号线/g, '佛山3号线')
        .replace(/\(联和-佛山大学\)/g, '北')
        .replace(/^海珠有轨$/g, '海珠有轨1号线');
}

/** 通用字符串规范化 */
function normalizeString(str) {
    if (!str) return str;
    return str
        .replace(/^一号线/g, '1号线')
        .replace(/^二号线/g, '2号线')
        .replace(/^三号线/g, '3号线')
        .replace(/^三北线/g, '3号线北')
        .replace(/^四号线/g, '4号线')
        .replace(/^五号线/g, '5号线')
        .replace(/^六号线/g, '6号线')
        .replace(/^七号线/g, '7号线')
        .replace(/^八号线/g, '8号线')
        .replace(/^九号线/g, '9号线')
        .replace(/^十号线/g, '10号线')
        .replace(/^十一号线/g, '11号线')
        .replace(/^十二号线$/g, '12号线西')
        .replace(/^十二号线（二沙岛-大学城南）/g, '12号线东')
        .replace(/^十三号线/g, '13号线')
        .replace(/^十四号线/g, '14号线')
        .replace(/^十八号线/g, '18号线')
        .replace(/二十一号线/g, '21号线')
        .replace(/二十二号线/g, '22号线')
        .replace(/佛山地铁二号线|佛山地铁2号线/g, '佛山2号线')
        .replace(/佛山地铁三号线|佛山地铁3号线/g, '佛山3号线')
        .replace(/\(联和-佛山大学\)/g, '北')
        .replace(/^海珠有轨$/g, '海珠有轨1号线');
}

/** 第一步：获取线路及站点 */
async function fetchLineStations() {
    showLoadingMessage('正在获取最新运营首末时间... 准备中');
    const url = 'https://apis.gzmtr.com/app-map/metroweb/linestation';
    const data = await requestWithRetry(url, {method: 'POST'});
    const lines = data.businessObject;
    if (!lines || !Array.isArray(lines)) throw new Error('线路数据格式错误');

    const lineIds = [9, 1, 2, 4, 3, 5, 6, 10, 11, 7, 12, 32, 30, 31, 33, 13, 17, 14, 18, 16, 19, 8, 22, 21, 23, 29, 15, 20, 26];
    const lineMap = new Map(lines.map(l => [l.lineId, l]));

    const newLineStations = {};
    for (const id of lineIds) {
        const line = lineMap.get(id);
        if (!line) continue;
        let lineName = normalizeLineName(line.lineName);
        if (!HARDCODED_COLORS[lineName]) {
            console.warn(`未找到线路 ${lineName} 的硬编码颜色，将使用默认灰色`);
        }
        const stations = line.stations.map(s => normalizeLineName(s.stationName));
        if (lineName === '11号线' && stations.length > 0) {
            stations.push(stations[0]);
        }
        newLineStations[lineName] = stations;
    }

    LINE_STATIONS = newLineStations;
    LINE_COLORS = {...HARDCODED_COLORS};
    lineDirectionTime = {};
    populateLineFilter();
    populateLineButtons();
    versionEl.textContent = `线路版本: 实时获取 (${new Date().toLocaleDateString()})`;

    // 立即渲染线路骨架（时间占位 --:--），让用户先看到线路
    // lineDirectionTime 为空时，renderAllLines 会自动显示 --:--
    renderAllLines();
}

/** 第二步：获取各站运营时间 */
async function fetchServiceTimes() {
    const allStations = new Set();
    Object.values(LINE_STATIONS).forEach(stations => stations.forEach(s => allStations.add(s)));
    const uniqueStations = Array.from(allStations);
    const total = uniqueStations.length;
    updateLoadingMessage(`正在获取最新运营首末时间... 0/${total}`);

    const serviceTimeUrl = 'https://apis.gzmtr.com/app-map/serviceTime/list';
    const allRecords = [];
    let completed = 0;
    const concurrency = 25;
    const progressThreshold = 30; // 每完成 30 个站点刷新渲染 + 更新进度

    const tasks = uniqueStations.map(station => async () => {
        const encodedStation = encodeURIComponent(station);
        const url = `${serviceTimeUrl}/${encodedStation}`;
        try {
            const data = await requestWithRetry(url, { method: 'POST' }, 1, 5000);
            const records = data.businessObject || [];
            records.forEach(rec => {
                const normalized = {};
                for (let [key, value] of Object.entries(rec)) {
                    if (typeof value === 'string') {
                        normalized[key] = normalizeString(value);
                    } else {
                        normalized[key] = value;
                    }
                }
                allRecords.push(normalized);
            });
        } catch (err) {
            console.warn(`获取站点 ${station} 失败:`, err);
        } finally {
            completed++;
            updateLoadingMessage(`正在获取最新运营首末时间... ${completed}/${total}`);
            // 每完成一定数量就刷新渲染
            if (completed % progressThreshold === 0 || completed === total) {
                rawServiceRecords = allRecords.slice();
                parseTimeRecords(rawServiceRecords);
            }
        }
    });

    async function runTasks(tasks, concurrency) {
        const executing = new Set();
        for (const task of tasks) {
            const promise = task().finally(() => executing.delete(promise));
            executing.add(promise);
            if (executing.size >= concurrency) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);
    }

    await runTasks(tasks, concurrency);

    rawServiceRecords = allRecords;
    parseTimeRecords(allRecords);
    saveDataToCache(LINE_STATIONS, rawServiceRecords);
}