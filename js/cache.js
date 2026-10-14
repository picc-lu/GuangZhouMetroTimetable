// ========== 缓存相关函数（IndexedDB） ==========

const DB_NAME = 'gz_metro_db';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const CACHE_KEY = 'latest';
const CACHE_VERSION = 5; // 结构变化：新增 failedStations 字段

let _dbPromise = null;
function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

/**
 * 计算"运营日"（凌晨 5:00 为分界点）。
 */
function getServiceDate(date = new Date()) {
    const d = new Date(date);
    if (d.getHours() < 5) d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');
}

async function saveDataToCache(lineStations, serviceRecords, failedStations = []) {
    const serviceDate = getServiceDate();
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
            version: CACHE_VERSION,
            lineStations,
            serviceRecords,
            failedStations,      // 新增
            serviceDate,
            savedAt: Date.now()
        }, CACHE_KEY);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } catch (e) {
        console.error('[缓存] 保存失败：', e);
    }
}

async function loadDataFromCache() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
        const data = await new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        if (!data) {
            return null;
        }
        if (data.version !== CACHE_VERSION) {
            await clearCache();
            return null;
        }
        const currentServiceDate = getServiceDate();
        if (data.serviceDate === currentServiceDate) {
            return data;
        }
        await clearCache();
        return null;
    } catch (e) {
        console.error('[缓存] 读取失败：', e);
        return null;
    }
}

async function clearCache() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(CACHE_KEY);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error('[缓存] 清除失败：', e);
    }
}