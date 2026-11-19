// ========== B站 Toy 云存储适配层 ==========
// 仅当 IS_TOY_ENV 为 true 时启用。职责：
//   A. localStorage 同步（前缀 gz_ / route_）：
//      - 启动时 toy.getCloudStorage() 拉云端 → 灌入 localStorage 镜像；
//      - 运行期 setItem/removeItem 防抖回传 toy.setCloudStorage / removeCloudStorage；
//      - 云端为空时把本地已有键一次性迁移上云。
//   B. 通用云端读写 cloudGet/cloudSet/cloudRemove：供 cache.js 把 IndexedDB 缓存
//      存到独立键（toy_cache，不在 A 的同步前缀内，避免互相干扰）。
// 非 toy 环境全部 no-op，行为与原来完全一致。

(function () {
    const SYNC_PREFIXES = ['gz_', 'route_'];
    const FLUSH_DELAY_MS = 800;
    const SDK_WAIT_TIMEOUT_MS = 8000;
    const SDK_SCRIPT_URL = '//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';

    // 与 store.js 保持一致的 toy 环境判断（本文件先于 store.js 加载，故自带一份）
    function detectToyEnv() {
        return window.self !== window.top ||
            location.hostname.includes('bilibili') ||
            location.href.includes('/toy/');
    }

    let enabled = false;
    let sdk = null;
    let dirtySet = {};
    let dirtyDel = [];
    let flushTimer = null;
    let flushing = false;

    const origSet = Storage.prototype.setItem;
    const origRemove = Storage.prototype.removeItem;

    function isSyncKey(key) {
        return SYNC_PREFIXES.some(p => String(key).startsWith(p));
    }

    // 按需注入 toy SDK 脚本（页面未内置时），已存在则跳过
    function injectSdkScript() {
        return new Promise((resolve) => {
            if (typeof window.toy !== 'undefined' && window.toy) { resolve(true); return; }
            const already = document.querySelector('script[src*="toy-sdk.js"]');
            if (already) { already.addEventListener('load', () => resolve(true)); already.addEventListener('error', () => resolve(false)); return; }
            const s = document.createElement('script');
            s.src = SDK_SCRIPT_URL;
            s.async = true;
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }

    async function waitForSdk() {
        await injectSdkScript();
        const t0 = Date.now();
        while (Date.now() - t0 < SDK_WAIT_TIMEOUT_MS) {
            const s = (typeof window.toy !== 'undefined' && window.toy) ? window.toy : null;
            if (s && typeof s.getCloudStorage === 'function') return s;
            await new Promise(r => setTimeout(r, 100));
        }
        return null;
    }

    // 兼容 SDK 可能的返回形态：{k:v} / {data:{k:v}} / {items:{k:v}}
    function normalizeCloud(res) {
        let obj = res;
        if (obj && typeof obj === 'object') {
            const isPlainKv = (o) => {
                const vals = Object.values(o);
                return vals.length === 0 || vals.every(v => typeof v === 'string');
            };
            if (!isPlainKv(obj) && obj.data && typeof obj.data === 'object') obj = obj.data;
            else if (!isPlainKv(obj) && obj.items && typeof obj.items === 'object') obj = obj.items;
        }
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (typeof v === 'string') out[k] = v;
                else if (v != null) {
                    try { out[k] = JSON.stringify(v); } catch (_) { /* 跳过 */ }
                }
            }
        }
        return out;
    }

    /* ---------- B. 通用云端读写（cache.js 复用） ---------- */
    async function cloudGet(key) {
        if (!sdk || typeof sdk.getCloudStorage !== 'function') return null;
        try {
            const res = normalizeCloud(await sdk.getCloudStorage([key]));
            return Object.prototype.hasOwnProperty.call(res, key) ? res[key] : null;
        } catch (e) {
            console.warn('[云存储] cloudGet 失败：', e);
            return null;
        }
    }

    async function cloudSet(key, value) {
        if (!sdk || typeof sdk.setCloudStorage !== 'function') return false;
        try {
            await sdk.setCloudStorage({ [key]: value });
            return true;
        } catch (e) {
            console.warn('[云存储] cloudSet 失败：', e);
            return false;
        }
    }

    async function cloudRemove(key) {
        if (!sdk || typeof sdk.removeCloudStorage !== 'function') return false;
        try {
            await sdk.removeCloudStorage([key]);
            return true;
        } catch (e) {
            console.warn('[云存储] cloudRemove 失败：', e);
            return false;
        }
    }

    /* ---------- A. localStorage 镜像同步 ---------- */
    function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_DELAY_MS);
    }

    function queueSet(key, value) {
        dirtySet[key] = value;
        const di = dirtyDel.indexOf(key);
        if (di >= 0) dirtyDel.splice(di, 1);
        scheduleFlush();
    }

    function queueRemove(key) {
        delete dirtySet[key];
        if (!dirtyDel.includes(key)) dirtyDel.push(key);
        scheduleFlush();
    }

    async function flush() {
        if (!enabled || flushing) return;
        const sets = dirtySet;
        const dels = dirtyDel;
        if (Object.keys(sets).length === 0 && dels.length === 0) return;
        dirtySet = {};
        dirtyDel = [];
        flushing = true;
        try {
            if (Object.keys(sets).length > 0 && typeof sdk.setCloudStorage === 'function') {
                await sdk.setCloudStorage(sets);
            }
            if (dels.length > 0 && typeof sdk.removeCloudStorage === 'function') {
                await sdk.removeCloudStorage(dels);
            }
        } catch (e) {
            console.warn('[云存储] 同步失败，稍后重试：', e);
            Object.assign(dirtySet, sets);
            dels.forEach(k => { if (!dirtyDel.includes(k)) dirtyDel.push(k); });
            scheduleFlush();
        } finally {
            flushing = false;
        }
    }

    function patchStorage() {
        Storage.prototype.setItem = function (k, v) {
            origSet.call(this, k, v);
            if (enabled && this === window.localStorage && isSyncKey(k)) {
                queueSet(String(k), String(v));
            }
        };
        Storage.prototype.removeItem = function (k) {
            origRemove.call(this, k);
            if (enabled && this === window.localStorage && isSyncKey(k)) {
                queueRemove(String(k));
            }
        };
        window.addEventListener('pagehide', () => { flush(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });
    }

    function reapplyThemeFromMirror() {
        const theme = window.localStorage.getItem('gz_metro_theme');
        if ((theme === 'dark' || theme === 'light') &&
            document.documentElement.getAttribute('data-theme') !== theme) {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    async function init() {
        if (!detectToyEnv()) return false;

        sdk = await waitForSdk();
        if (!sdk) {
            console.warn('[云存储] 未检测到 toy SDK，保持本地存储');
            return false;
        }

        let remote = {};
        try {
            remote = normalizeCloud(await sdk.getCloudStorage());
        } catch (e) {
            console.warn('[云存储] 读取云端存档失败，保持本地存储：', e);
            sdk = null;
            return false;
        }

        const remoteSyncKeys = Object.keys(remote).filter(isSyncKey);
        if (remoteSyncKeys.length > 0) {
            // 云端为准，灌入本地镜像（用原生 setItem，避免触发回传）
            for (const k of remoteSyncKeys) {
                if (window.localStorage.getItem(k) !== remote[k]) {
                    origSet.call(window.localStorage, k, remote[k]);
                }
            }
        } else {
            // 同步键云端为空：把本地已有同步键一次性迁移上云
            for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i);
                if (k && isSyncKey(k)) dirtySet[k] = window.localStorage.getItem(k);
            }
        }

        enabled = true;
        patchStorage();
        reapplyThemeFromMirror();
        if (Object.keys(dirtySet).length > 0) scheduleFlush();
        console.log('[云存储] 已启用，云端同步键数：', remoteSyncKeys.length);
        return true;
    }

    window.ToyCloudStorage = {
        init,
        flush,
        isEnabled: () => enabled,
        cloudGet,
        cloudSet,
        cloudRemove,
    };
})();
