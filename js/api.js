// ========== API 请求函数 ==========

// @requires constants.js, store.js, utils.js, cache.js
if (typeof RETRY_TIMES === 'undefined') throw new Error('[api.js] 需要 constants.js 先加载');
if (typeof LINE_STATIONS === 'undefined') throw new Error('[api.js] 需要 store.js 先加载');
if (typeof requestWithRetry === 'function') {} // 自引用，忽略

const AUTO_RETRY_MAX = 10;   // 自动重试最大次数
let _autoRetryCount = 0;
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

const normalizeString = normalizeLineName;

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
    if (typeof invalidateOutdatedStationsCache === 'function') {
        invalidateOutdatedStationsCache();
    }
}

/** 第二步：获取各站运营时间 */
async function fetchServiceTimes(stationsToFetch = null) {
    const allStationsSet = new Set();
    Object.values(LINE_STATIONS).forEach(stations => stations.forEach(s => allStationsSet.add(s)));

    const isRetry = Array.isArray(stationsToFetch);
    if (isRetry) {
        _autoRetryCount++;
    } else {
        _autoRetryCount = 0;
        failedStations = [];   // 新一轮全量抓取，清空上次的失败记录
    }
    const uniqueStations = isRetry
        ? stationsToFetch.filter(s => allStationsSet.has(s))
        : Array.from(allStationsSet);
    const total = uniqueStations.length;
    if (total === 0) return;

    // 核心新增：优先尝试获取全局预缓存数据
    if (!isRetry) {
        try {
            updateLoadingMessage('正在获取今日全量运营数据包...');

            // 动态判断环境：Toy 环境从 GitHub 拉取，其他环境用相对路径
            let dailyTimesUrl = './data/daily-times.json';

            if (typeof IS_TOY_ENV !== 'undefined' && IS_TOY_ENV) {
                dailyTimesUrl = `${GITHUB_PAGES_BASE_URL}/data/daily-times.json`;
            }

            // 防止浏览器缓存
            const resp = await fetch(`${dailyTimesUrl}?t=${new Date().getTime()}`);
            if (resp.ok) {
                const bundle = await resp.json();
                // 如果数据包的日期和今天一致
                const serviceDate = getServiceDate();
                if (bundle.serviceDate === serviceDate || serviceDate === new Date().toISOString().split('T')[0]) {
                    const allRecords = [];
                    for (const st of uniqueStations) {
                        if (bundle.records[st]) {
                            // 遍历每条记录，对字符串字段重新执行一遍清洗
                            bundle.records[st].forEach(rec => {
                                const normalized = {};
                                for (let [key, value] of Object.entries(rec)) {
                                    if (typeof value === 'string') {
                                        normalized[key] = normalizeLineName(value);
                                    } else {
                                        normalized[key] = value;
                                    }
                                }
                                allRecords.push(normalized);
                            });
                        }
                    }

                    rawServiceRecords = allRecords;
                    parseTimeRecords(rawServiceRecords, { skipRender: true });
                    await saveDataToCache(LINE_STATIONS, rawServiceRecords, []);
                    scheduleRender();          // <-- 智能增量：有 DOM 就 patch，没 DOM 才重建
                    finishLoadingMessage();

                    // 找出没有数据的站点，静默向官方补发请求
                    const missing = uniqueStations.filter(st => {
                        let hasAnyData = false;
                        for (const [line, stations] of Object.entries(LINE_STATIONS)) {
                            if (!stations.includes(st)) continue;
                            const d = lineDirectionTime[line]?.[st];
                            if (!d) continue;

                            if (line === '11号线') {
                                if (d.upFull || d.upTerminal || d.downFull || d.downTerminal) {
                                    hasAnyData = true;
                                    break;
                                }
                            } else {
                                if ((d.up && d.up.length > 0) || (d.down && d.down.length > 0)) {
                                    hasAnyData = true;
                                    break;
                                }
                            }
                        }
                        return !hasAnyData;
                    });
                    if (missing.length > 0 && missing.length < 30) {
                        console.log('[补抓] 发现少量缺失站点，尝试向官方请求补充...', missing);
                        await fetchServiceTimes(missing);
                        // fetchServiceTimes 内部（重试模式）最后会调用 finishLoadingMessage()
                    } else {
                        finishLoadingMessage();
                    }
                    return;
                }
            }
        } catch (e) {
            console.warn('全量数据包不可用，回退到独立请求...', e);
        }
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
            const data = await requestWithRetry(url, { method: 'POST' }, 1, 1000);
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

    // 自动重试失败站点
    if (failedStations.length > 0 && _autoRetryCount < AUTO_RETRY_MAX) {
        const toRetry = failedStations.slice();
        failedStations = [];   // 清空，递归里只有真正失败的才会重新 push
        console.log(`[自动重试] 第 ${_autoRetryCount + 1} 次自动重试，失败站点：${toRetry.length} 个`);
        await new Promise(r => setTimeout(r, 1000));
        await fetchServiceTimes(toRetry);
        return;
    }

    finishLoadingMessage();

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
            toast.style.display = 'none';
            void fetchServiceTimes(toRetry);
        });
        document.body.appendChild(toast);
    }

    toast.textContent = `⚠️ ${failedStations.length} 个站点获取失败，点击重试`;
    toast.title = failedStations.join('\n');
    toast.style.display = 'flex';
}

// ========== 票价查询（官方 API） ==========

let _localFaresData = null;
let _localFaresPromise = null;

function preloadFares() {
    if (!_localFaresPromise) {
        _localFaresPromise = fetch('./data/fares.json')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                _localFaresData = data;
                console.log('[票价] 预加载成功');
                return data;
            })
            .catch(err => {
                console.warn('[票价] 预加载本地 fares.json 失败', err);
                _localFaresData = {};
                return _localFaresData;
            });
    }
    return _localFaresPromise;
}

async function fetchRouteFare(startStation, endStation) {
    if (!_localFaresData) {
        if (!_localFaresPromise) {
            _localFaresPromise = fetch('./data/fares.json')
                .then(res => {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                })
                .then(data => {
                    _localFaresData = data;
                    return data;
                })
                .catch(err => {
                    console.warn('[票价] 加载本地 fares.json 失败', err);
                    _localFaresData = {};
                    return _localFaresData;
                });
        }
        await _localFaresPromise;
    }

    if (!_localFaresData) return null;

    const tryGet = (s, e) => {
        if (_localFaresData[s] && _localFaresData[s][e] != null) return _localFaresData[s][e];
        return null;
    };

    // ====== 核心增强：生成所有可能的站名变体组合 ======
    const generateCandidates = (name) => {
        const cands = new Set();
        if (!name) return cands;

        // 1. 原名
        cands.add(name);

        // 2. 去空格、去括号清洗
        const clean = String(name).replace(/[（(].*[）)]/g, '').replace(/\s+/g, '').trim();
        if (clean) cands.add(clean);

        // 3. 票价别名映射
        if (typeof fareAlias === 'function') {
            cands.add(fareAlias(name));
            cands.add(fareAlias(clean));
        }

        // 4. 规范化站名映射
        if (typeof canonicalStation === 'function') {
            cands.add(canonicalStation(name));
            cands.add(canonicalStation(clean));
        }

        // 5. 显示名映射
        if (typeof toDisplayName === 'function') {
            cands.add(toDisplayName(name));
            cands.add(toDisplayName(clean));
        }

        // 移除空值
        cands.delete('');
        return Array.from(cands);
    };

    const startCands = generateCandidates(startStation);
    const endCands = generateCandidates(endStation);

    // 组合遍历，只要有一组能查到票价就返回
    for (const s of startCands) {
        for (const e of endCands) {
            const fare = tryGet(s, e);
            if (fare != null) return fare;
        }
    }
    // ==============================================

    // 尝试查询临近站（原有逻辑保留，但适配新的候选数组）
    if (typeof NEARBY_STATION_MAP !== 'undefined') {
        const mappedEnd = NEARBY_STATION_MAP[endStation];
        if (mappedEnd) {
            const mappedEndCands = generateCandidates(mappedEnd);
            for (const s of startCands) {
                for (const e of mappedEndCands) {
                    const fare = tryGet(s, e);
                    if (fare != null) return fare;
                }
            }
        }

        const mappedStart = NEARBY_STATION_MAP[startStation];
        if (mappedStart) {
            const mappedStartCands = generateCandidates(mappedStart);
            for (const s of mappedStartCands) {
                for (const e of endCands) {
                    const fare = tryGet(s, e);
                    if (fare != null) return fare;
                }
            }
        }
    }

    return null;
}

// ========== 车站管制查询（官方 API） ==========

const STATION_CTRL_API = 'https://ydyc.gzmtr.cn:19090/interface/info?equipmentType=pc';
const STATION_CTRL_CACHE_TTL = 60 * 1000;   // 60 秒内复用
const _stationCtrlCache = { data: null, ts: 0 };

const STATION_CTRL_TYPE_TEXT = {
    'NOSTOP': '停止对外服务',
    'DELAY': '延误',
    'FLOWCONTROL': '客流控制',
    'TRANSFERONLY': '仅保留换乘',
    // 未知 type 会原样显示，方便排查
};

/** 清洗 mapData 里的站名（去括号、去 *# 标记、去空格） */
function cleanMapDataStationName(name) {
    if (!name) return '';
    return String(name)
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/\s+/g, '');
}

async function fetchStationControllers(force = false) {
    const now = Date.now();
    if (!force && _stationCtrlCache.data && (now - _stationCtrlCache.ts) < STATION_CTRL_CACHE_TTL) {
        return _stationCtrlCache.data;
    }

    try {
        // 直接请求官方接口
        const resp = await fetch(STATION_CTRL_API, { method: 'GET', mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();

        if (!json.state) throw new Error('接口 state=false');

        const list = json?.data?.info?.stationController || [];
        const map = {};

        for (const item of list) {
            const stationNo = item.StationNo;
            const type = item.type;
            const rawName = (typeof MAPDATA !== 'undefined' && MAPDATA?.stationName?.ch?.[stationNo]?.name) || '';
            const name = cleanMapDataStationName(rawName);
            if (!name) {
                console.warn(`[车站管制] 无法解析 StationNo=${stationNo} 的站名`);
                continue;
            }
            map[name] = {
                type,
                typeText: STATION_CTRL_TYPE_TEXT[type] || type,
                rawStationNo: stationNo,
            };
        }

        const lineInfo = json?.data?.info?.lineInfo || [];
        const msgText = json?.data?.msg?.ch || '';
        const delays = [];

        for (const item of lineInfo) {
            // colorIndex 50 为延误，60 为中断
            if (item.colorIndex === 50 || item.colorIndex === 60) {
                // 【核心修复】使用定长匹配 (\d{3})(\d{3})，防止贪婪截断
                const match = item.code.match(/SS_(\d+)OD(\d{3})(\d{3})UD\d/);
                if (match) {
                    const startNo = match[2];
                    const endNo = match[3];
                    let startStation = startNo;
                    let endStation = endNo;

                    if (startStation && endStation) {
                        // 从提示文本中提取方向关键字，如“机场北”
                        let dirKeyword = null;
                        const dirMatch = msgText.match(/开往([^的]+)的列车/) || msgText.match(/往([^方向]+)方向/);
                        if (dirMatch) dirKeyword = dirMatch[1].trim();

                        delays.push({
                            startStation,
                            endStation,
                            type: item.colorIndex === 50 ? 'DELAY' : 'INTERRUPT',
                            dirKeyword: dirKeyword // 用于精准匹配方向
                        });
                    }
                }
            }
        }

        window._currentLineDelays = delays;
        // 保存官方通告文本
        window._currentOfficialMsg = json?.data?.msg?.ch || '';
        console.log('[客控] 解析出的区间延误:', delays);

        _stationCtrlCache.data = map;
        _stationCtrlCache.ts = now;
        return map;
    } catch (err) {
        console.warn('[车站管制] 获取失败：', err);
        return null;
    }
}