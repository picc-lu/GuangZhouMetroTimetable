// ========== API 请求函数 ==========

/** 带重试的fetch */
async function requestWithRetry(url, options = {}, retries = RETRY_TIMES, timeoutMs = 8000) {
    for (let i = 0; i < retries; i++) {
        let timer;
        try {
            const controller = new AbortController();
            timer = setTimeout(() => controller.abort(), timeoutMs);
            const resp = await fetch(url, { ...options, mode: 'cors', signal: controller.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data.success === false) throw new Error('接口返回 success=false');
            return data;
        } catch (err) {
            if (i === retries - 1) throw err;
            // 重试延迟：500ms、1000ms
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        } finally {
            // 无论成功失败都清掉定时器，避免内存泄漏和幽灵 abort
            if (timer) clearTimeout(timer);
        }
    }
}

/** 地铁名称规范化：线路名与站点名通用 */
function normalizeMetroText(str) {
    if (!str) return str;
    return str
        .replace(/^一号线/g, '1号线')
        .replace(/^二号线/g, '2号线')
        .replace(/^三北线/g, '3号线北')
        .replace(/^三号线/g, '3号线')
        .replace(/^四号线/g, '4号线')
        .replace(/^五号线/g, '5号线')
        .replace(/^六号线/g, '6号线')
        .replace(/^七号线/g, '7号线')
        .replace(/^八号线/g, '8号线')
        .replace(/^九号线/g, '9号线')
        .replace(/^十号线/g, '10号线')
        .replace(/^十一号线/g, '11号线')
        .replace(/^十二号线（二沙岛-大学城南）/g, '12号线东')
        .replace(/^十二号线$/g, '12号线西')
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

// 兼容旧调用点：直接别名，不再保留两份实现
const normalizeLineName = normalizeMetroText;
const normalizeString = normalizeMetroText;

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
    setAllLineButtonsToGray(); // 按钮先置灰，等数据到齐后再逐条恢复
    versionEl.textContent = `线路版本: 实时获取 (${new Date().toLocaleDateString()})`;
    // 立即渲染线路骨架（时间占位 --:--），让用户先看到线路
    renderAllLines();
}

/** 第二步：获取各站运营时间 */
async function fetchServiceTimes(stationsToFetch = null) {
    const allStationsSet = new Set();
    Object.values(LINE_STATIONS).forEach(stations => stations.forEach(s => allStationsSet.add(s)));

    const isRetry = Array.isArray(stationsToFetch);
    const uniqueStations = isRetry
        ? stationsToFetch.filter(s => allStationsSet.has(s))
        : Array.from(allStationsSet);
    const total = uniqueStations.length;

    if (total === 0) return;

    // 首次抓取时清空历史，重试时保留已有数据
    if (!isRetry) {
        rawServiceRecords = [];
        failedStations = [];
    } else {
        failedStations = failedStations.filter(s => !uniqueStations.includes(s));
    }

    updateLoadingMessage(`正在获取最新运营首末时间... 0/${total}`);

    const serviceTimeUrl = 'https://apis.gzmtr.com/app-map/serviceTime/list';
    let completed = 0;
    const concurrency = 5;
    const progressThreshold = 30;

    const completedStations = _gzCompletedStations;
    const restoredLines = new Set();

    function checkAndRestoreLines() {
        for (const [line, stations] of Object.entries(LINE_STATIONS)) {
            if (restoredLines.has(line)) continue;
            if (stations.every(s => completedStations.has(s))) {
                restoredLines.add(line);
                setLineButtonState(line, true);
            }
        }
    }

    for (const [line, stations] of Object.entries(LINE_STATIONS)) {
        if (stations.every(s => completedStations.has(s))) {
            setLineButtonState(line, true);
        }
    }

    // ====== 增量解析缓冲 ======
    // 每个批次只解析"新到达"的记录，避免每次全量重新解析 O(n²)
    const batchRecords = [];
    // 是否是本次 fetchServiceTimes 第一次解析
    // 重试模式：lineDirectionTime 已有数据，直接从"增量模式"开始
    let hasParsedOnce = isRetry;

    function flushBatch() {
        if (batchRecords.length === 0) return;
        parseTimeRecords(batchRecords, {
            skipRender: true,
            append: hasParsedOnce
        });
        hasParsedOnce = true;
        batchRecords.length = 0;
    }

    const tasks = uniqueStations.map(station => async () => {
        const encodedStation = encodeURIComponent(station);
        const url = `${serviceTimeUrl}/${encodedStation}`;
        try {
            const data = await requestWithRetry(url, { method: 'POST' }, 1, 3000);
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
                rawServiceRecords.push(normalized);
                batchRecords.push(normalized);   // 只把这批记录交给解析器
            });
        } catch (err) {
            console.warn(`获取站点 ${station} 失败:`, err);
            failedStations.push(station);
        } finally {
            completed++;
            completedStations.add(station);
            checkAndRestoreLines();
            updateLoadingMessage(`正在获取最新运营首末时间... ${completed}/${total}`);
            if (completed % progressThreshold === 0 || completed === total) {
                flushBatch();
                scheduleRender();
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

    // 处理最后不足一个批次的残留记录
    flushBatch();
    scheduleRender();

    // ====== 缓存保存策略：保存成功部分 + 失败站点列表 ======
    // 下次启动时优先用部分数据渲染，再后台重试失败站点
    if (rawServiceRecords.length > 0) {
        await saveDataToCache(LINE_STATIONS, rawServiceRecords, failedStations);
    } else {
        console.warn('[缓存] 无任何成功记录，跳过保存');
    }

    // 更新失败徽章
    updateFetchErrorBadge();
}

/** 更新"失败站点"提示 toast（fixed 定位，不受布局影响） */
function updateFetchErrorBadge() {
    let toast = document.getElementById('fetch-error-badge');

    // 没有失败站点：移除或隐藏
    if (failedStations.length === 0) {
        if (toast) toast.style.display = 'none';
        return;
    }

    if (!toast) {
        toast = document.createElement('button');
        toast.id = 'fetch-error-badge';
        toast.className = 'fetch-error-badge';
        toast.addEventListener('click', () => {
            if (failedStations.length === 0) return;
            const toRetry = failedStations.slice();
            console.log('[重试] 重试失败站点：', toRetry);
            toast.style.display = 'none';
            fetchServiceTimes(toRetry);
        });
        document.body.appendChild(toast);
    }

    toast.textContent = `⚠️ ${failedStations.length} 个站点获取失败，点击重试`;
    toast.title = failedStations.join('\n');
    toast.style.display = 'flex';
}