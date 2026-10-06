// 版本号变更时触发缓存更新（改 constants.js 里的 APP_VERSION 即可）
const CACHE_NAME = `gz-metro-v1.1.5`;
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/base.css',
    './css/controls.css',
    './css/map.css',
    './css/modal.css',
    './css/responsive.css',
    './css/dark.css',
    './js/constants.js',
    './js/store.js',
    './js/pinyin.js',
    './data/GZCoords.js',
    './js/utils.js',
    './js/coords.js',
    './js/nearby.js',
    './js/search.js',
    './js/cache.js',
    './js/api.js',
    './js/ui.js',
    './js/render.js',
    './js/time.js',
    './js/theme.js',
    './js/main.js',
    './icons/icon.svg',
    './icons/icon-384.png',

    './data/metro-graph.json',
    './css/route.css',
    './js/route/heap.js',
    './js/route/graph.js',
    './js/route/dijkstra.js',
    './js/route/yen.js',
    './js/route/parser.js',
    './js/route/planner.js',
    './js/route/ui.js',

];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
        // 注意：不再自动 skipWaiting，等待用户确认
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// 接收页面发来的"跳过等待"指令
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API 请求交给浏览器处理（已有 localStorage 缓存和重试机制，不经过 SW）
    if (url.hostname === 'apis.gzmtr.com') return;

    // 只处理 GET
    if (event.request.method !== 'GET') return;

    // 静态资源：Cache First
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(resp => {
                // 只缓存同源成功响应
                if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
                const clone = resp.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return resp;
            }).catch(() => caches.match('./index.html'));
        })
    );
});