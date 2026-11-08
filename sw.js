const CACHE_NAME = `gz-metro-v1.2.12c`;
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './js/bootstrap.js',
    './css/base.css',
    './css/controls.css',
    './css/map.css',
    './css/modal.css',
    './css/responsive.css',
    './css/dark.css',
    './js/constants.js',
    './js/station-name.js',
    './js/store.js',
    './js/pinyin.js',
    './data/GZCoords.js',
    './data/mapData.js',
    './js/utils.js',
    './js/coords.js',
    './js/nearby.js',
    './js/search.js',
    './js/cache.js',
    './js/api.js',
    './js/ui.js',
    './js/render.js',
    './js/time.js',
    './js/topo.js',
    './js/theme.js',
    './js/main.js',

    './icons/icon.svg',
    './icons/icon-384.png',

    './data/metro-graph.json',
    './data/line3-through-train.json',
    './data/short-services.json',
    './data/transfers.json',
    './data/headways.json',
    './data/fares.json',
    './data/daily-times.json',
    './css/route-shell.css',
    './css/route-options.css',
    './css/route-result.css',
    './css/route-dark.css',
    './css/route-responsive.css',
    './js/route/heap.js',
    './js/route/graph.js',
    './js/route/dijkstra.js',
    './js/route/yen.js',
    './js/route/parser.js',
    './js/route/planner.js',
    './js/route/headway.js',
    './js/route/ui-state.js',
    './js/route/ui-prefs.js',
    './js/route/ui-autocomplete.js',
    './js/route/ui-shell.js',
    './js/route/ui-render.js',
    './js/route/ui-planning.js',

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
        void self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. 忽略官方 API 和不支持的请求
    if (url.hostname === 'apis.gzmtr.com') return;
    if (url.hostname === 'ydyc.gzmtr.cn') return;
    if (event.request.method !== 'GET') return;

    // 2. changelog.json：网络优先，保证用户能看到最新的更新提示
    if (url.pathname.endsWith('/data/changelog.json')) {
        event.respondWith(
            fetch(event.request).then(resp => {
                const clone = resp.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return resp;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // 3. 页面、JS、CSS、静态 JSON：Stale-While-Revalidate
    const isCoreAsset = /\.(html|js|css|json)$/.test(url.pathname) || url.pathname === './';

    if (isCoreAsset) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const fetchPromise = fetch(event.request).then(resp => {
                    if (resp && resp.status === 200 && resp.type === 'basic') {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return resp;
                }).catch(() => cached);

                return cached || fetchPromise;
            })
        );
    } else {
        // 4. 图片、字体等（兜底）：缓存优先
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(resp => {
                    if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return resp;
                }).catch(() => caches.match('./index.html'));
            })
        );
    }
});