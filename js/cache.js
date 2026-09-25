// ========== 缓存相关函数 ==========

function saveDataToCache(lineStations, serviceRecords) {
    console.log('[缓存] 正在保存数据到 localStorage...');
    const cacheData = {
        lineStations: lineStations,
        serviceRecords: serviceRecords,
        date: new Date().toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-')
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    console.log(`[缓存] 数据保存成功，日期：${cacheData.date}`);
}

function loadDataFromCache() {
    console.log('[缓存] 尝试从 localStorage 加载数据...');
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
        console.log('[缓存] 无缓存数据');
        return null;
    }
    try {
        const data = JSON.parse(cached);
        const today = new Date().toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-');
        if (data.date === today) {
            console.log(`[缓存] 命中当日缓存 (${data.date})`);
            return data;
        } else {
            console.log(`[缓存] 缓存日期 ${data.date} 与今日 ${today} 不符，已清除`);
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
    } catch (e) {
        console.error('[缓存] 解析缓存失败，已清除', e);
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}