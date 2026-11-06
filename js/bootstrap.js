// ============================================================
// 全项目唯一脚本入口
// index.html 只保留一个 <script type="module" src="js/bootstrap.js">
// 加载顺序 = 下面 SCRIPTS 数组的顺序（务必与旧 index.html 一致）
// ============================================================

const SCRIPTS = [
    // ---- 基础层 ----
    'js/constants.js',
    'js/station-name.js',
    'js/store.js',
    'js/pinyin.js',
    // ---- 数据层 ----
    'data/GZCoords.js',
    'data/mapData.js',
    // ---- 站名/坐标/搜索 ----
    'js/coords.js',
    'js/search.js',
    'js/nearby.js',
    // ---- 工具与缓存 ----
    'js/utils.js',
    'js/cache.js',
    'js/api.js',
    // ---- 主界面 ----
    'js/ui.js',
    'js/render.js',
    'js/time.js',
    // ---- 路径规划核心 ----
    'js/route/heap.js',
    'js/route/graph.js',
    'js/route/headway.js',
    'js/route/dijkstra.js',
    'js/route/yen.js',
    'js/route/parser.js',
    'js/route/planner.js',
    // ---- 路径规划 UI（按依赖顺序） ----
    'js/route/ui-state.js',
    'js/route/ui-prefs.js',
    'js/route/ui-autocomplete.js',
    'js/route/ui-shell.js',
    'js/route/ui-render.js',
    'js/route/ui-planning.js',
    // ---- 线网图 ----
    'js/topo.js',
    // ---- 主题 / 启动 / PWA ----
    'js/theme.js',
    'js/main.js',
    'js/pwa.js',
];

const SCRIPT_TIMEOUT_MS = 15000;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        // 动态插入的 script 默认 async=true，设 false 才能保证按插入顺序执行
        s.async = false;

        const timer = setTimeout(() => {
            reject(new Error(`脚本加载超时(${SCRIPT_TIMEOUT_MS}ms): ${src}`));
        }, SCRIPT_TIMEOUT_MS);

        s.onload = () => { clearTimeout(timer); resolve(); };
        s.onerror = () => { clearTimeout(timer); reject(new Error(`脚本加载失败: ${src}`)); };

        document.body.appendChild(s);
    });
}

function showBootError(msg) {
    const div = document.createElement('div');
    div.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0',
        'background:#dc2626', 'color:#fff', 'padding:12px 16px',
        'font-size:14px', 'line-height:1.5', 'text-align:center',
        'z-index:999999', 'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
    ].join(';');
    div.innerHTML = `⚠️ 页面初始化失败：${msg}<br><span style="opacity:.85">请刷新页面重试</span>`;
    document.body.appendChild(div);
    console.error('[bootstrap]', msg);
}

(async () => {
    try {
        // 并行下载、按序执行（async=false 保证执行顺序）
        const promises = SCRIPTS.map(loadScript);
        await Promise.all(promises);
        // 全部脚本加载并执行完毕
        window.dispatchEvent(new CustomEvent('app:scripts-loaded'));
    } catch (err) {
        showBootError(err.message || String(err));
    }
})();