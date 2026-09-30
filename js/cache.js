// ========== 缓存相关函数 ==========

const CACHE_VERSION = 3; // 版本 +1：缓存字段改为 serviceDate（运营日）

/**
 * 计算"运营日"（凌晨 5:00 为分界点）。
 * 例如：2026-10-01 03:00 视为 2026-09-30 运营日；
 *       2026-10-01 05:00 视为 2026-10-01 运营日。
 * @param {Date} [date] - 参考时间，默认当前
 * @returns {string} "YYYY-MM-DD"
 */
function getServiceDate(date = new Date()) {
    const d = new Date(date);
    if (d.getHours() < 5) {
        d.setDate(d.getDate() - 1);
    }
    return d.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');
}

function saveDataToCache(lineStations, serviceRecords) {
    const serviceDate = getServiceDate();
    console.log('[缓存] 正在保存数据到 localStorage...');
    const cacheData = {
        version: CACHE_VERSION,
        lineStations: lineStations,
        serviceRecords: serviceRecords,
        serviceDate: serviceDate
    };
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        console.log(`[缓存] 数据保存成功，运营日：${serviceDate}`);
    } catch (e) {
        console.error('[缓存] 保存失败（可能超出配额）：', e);
    }
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

        // 版本检查：旧格式自动失效
        if (data.version !== CACHE_VERSION) {
            console.log(`[缓存] 版本不符（缓存 ${data.version}，当前 ${CACHE_VERSION}），已清除`);
            localStorage.removeItem(CACHE_KEY);
            return null;
        }

        const currentServiceDate = getServiceDate();

        if (data.serviceDate === currentServiceDate) {
            console.log(`[缓存] 命中运营日缓存 (${data.serviceDate})`);
            return data;
        } else {
            console.log(`[缓存] 缓存运营日 ${data.serviceDate} 与当前运营日 ${currentServiceDate} 不符，已清除`);
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
    } catch (e) {
        console.error('[缓存] 解析缓存失败，已清除', e);
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}