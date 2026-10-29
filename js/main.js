const versionEl = document.getElementById('version-display');
versionEl.textContent = '线路版本: 2026-10-24 (内置)';

function applyBannerColors() {
    const banner = document.querySelector('.banner');
    if (!banner) return;

    const colors = Object.values(HARDCODED_COLORS);
    if (colors.length < 2) return;

    let c1 = colors[Math.floor(Math.random() * colors.length)];
    let c2 = colors[Math.floor(Math.random() * colors.length)];
    let attempts = 0;

    while (attempts < 20) {
        if (c1 !== c2) {
            const h1 = hexToHslObj(c1).h;
            const h2 = hexToHslObj(c2).h;
            let diff = Math.abs(h1 - h2);
            if (diff > 180) diff = 360 - diff;
            if (diff > 40) break;
        }
        c2 = colors[Math.floor(Math.random() * colors.length)];
        attempts++;
    }

    const hsl1 = hexToHslObj(c1);
    const hsl2 = hexToHslObj(c2);

    // 亮度调高到 80%~85%，饱和度 75%，确保在纯白背景下颜色鲜艳透亮不显脏
    const soft1 = `hsl(${hsl1.h}, 30%, 85%)`;
    const soft2 = `hsl(${hsl2.h}, 30%, 85%)`;

    const soft3 = `hsl(${hsl1.h}, 30%, 25%)`;
    const soft4 = `hsl(${hsl2.h}, 30%, 25%)`;

    banner.style.setProperty('--banner-c1', soft1);
    banner.style.setProperty('--banner-c2', soft2);
    banner.style.setProperty('--banner-c3', soft3);
    banner.style.setProperty('--banner-c4', soft4);
}

applyBannerColors();

document.getElementById('apply-custom-time').addEventListener('click', () => {
    const hourSel = document.getElementById('hour-select');
    const minSel = document.getElementById('minute-select');

    // 优先用 select 的 value；若为空（选项缺失），回退到触发器显示的文字
    let h = parseInt(hourSel.value, 10);
    let m = parseInt(minSel.value, 10);

    if (isNaN(h)) {
        h = parseInt(document.getElementById('hour-trigger').textContent, 10);
    }
    if (isNaN(m)) {
        m = parseInt(document.getElementById('minute-trigger').textContent, 10);
    }

    if (isNaN(h) || isNaN(m)) {
        console.warn('[事件] 无法解析自定义时间，忽略本次操作');
        return;
    }

    const d = new Date();
    d.setHours(h, m, 0, 0);
    currentCustomTime = d;
    renderAllLines();
});

// 抽出一个可复用的处理函数
function applySystemTime() {
    currentCustomTime = null;
    renderAllLines();
}

// 点击"应用系统时间"按钮触发
document.getElementById('use-system-time').addEventListener('click', (e) => {
    e.stopPropagation(); // 防止冒泡到外层再次触发
    applySystemTime();
});

// 点击整个 system-time-area 也触发
const systemTimePanel = document.getElementById('system-time-panel');
if (systemTimePanel) {
    systemTimePanel.style.cursor = 'pointer';
    systemTimePanel.addEventListener('click', () => {
        applySystemTime();
    });
}

document.getElementById('line-filter').addEventListener('change', applyFilter);
document.getElementById('select-all').addEventListener('click', () => {
    const select = document.getElementById('line-filter');
    for (let opt of select.options) opt.selected = true;
    applyFilter();
});
document.getElementById('deselect-all').addEventListener('click', () => {
    const select = document.getElementById('line-filter');
    for (let opt of select.options) opt.selected = false;
    applyFilter();
});

// 初始化时间选择器、时钟、整分刷新
initTimeSelectors();
scheduleNextMinuteTick();
document.getElementById('real-time-clock').textContent = (() => {
    const d = new Date();
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
})();

// ========== 凌晨时段（2:00~3:59）提示昨日数据 ==========
function showYesterdayDataNotice() {
    // 避免重复插入
    if (document.querySelector('.yesterday-data-notice')) return;

    // 计算应显示的日期：若当前时间在 5:00 前，则为前一天
    const now = new Date();
    const displayDate = new Date(now);
    if (now.getHours() < 5) {
        displayDate.setDate(displayDate.getDate() - 1);
    }
    const dateStr = displayDate.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');

    const notice = document.createElement('div');
    notice.className = 'yesterday-data-notice';
    notice.innerHTML = `⚠️ 当前显示的是 <b>${dateStr}</b> 的数据，新的运营数据将在 <b>5:00</b> 自动获取。<p><i>官方大约在 <b>2:00~4:00</b> 提供新一天的运营数据</i>`;

    // 插入到 banner 之后
    const banner = document.querySelector('.banner');
    if (banner && banner.parentNode) {
        banner.parentNode.insertBefore(notice, banner.nextSibling);
    }
}

// ========== 新增：强制获取最新数据 ==========
function forceFetchLatestData() {
    (async () => {
        try {
            isFetchingData = true;
            _gzCompletedStations = new Set();
            await fetchLineStations();
            await fetchServiceTimes();

            // 移除凌晨时段的昨日数据提示
            const notice = document.querySelector('.yesterday-data-notice');
            if (notice) notice.remove();

            if (currentCustomTime === null) {
                scheduleNextMinuteTick();
            }
        } catch (err) {
            console.error('[5:00定时] 获取数据失败', err);
        } finally {
            isFetchingData = false;
        }
    })();
}

// ========== 新增：设置 5:00 定时刷新 ==========
function scheduleForceRefreshAt5AM() {
    const now = new Date();
    const next5 = new Date(now);
    next5.setHours(5, 0, 0, 0);
    // 如果已经过了今天的 5:00，则目标改为明天的 5:00
    if (next5 <= now) {
        next5.setDate(next5.getDate() + 1);
    }
    const delay = next5 - now;

    systemTimeoutId = setTimeout(() => {
        forceFetchLatestData();
        // 递归设置下一天的 5:00 定时
        scheduleForceRefreshAt5AM();
    }, delay);
}

const now = new Date();

(async () => {
    const cached = await loadDataFromCache();

    if (cached) {
        LINE_STATIONS = cached.lineStations;
        rawServiceRecords = cached.serviceRecords;

        // 缓存中已包含所有站点数据（含失败站点占位），先把它们标记为已完成，
        // 避免后台重试时线路按钮颜色回退
        _gzCompletedStations = new Set();
        Object.values(LINE_STATIONS).forEach(stations => {
            stations.forEach(s => _gzCompletedStations.add(s));
        });

        populateLineFilter();
        populateLineButtons();
        parseTimeRecords(rawServiceRecords);
        versionEl.textContent = `线路版本: 缓存数据 (${cached.serviceDate})`;
        currentCustomTime = null;

        const hour = now.getHours();
        if (hour >= 2 && hour < 4) showYesterdayDataNotice();   // 注释修正为 2:00~3:59

        // ====== 后台重试上次失败的站点 ======
        const cachedFailed = Array.isArray(cached.failedStations) ? cached.failedStations : [];
        if (cachedFailed.length > 0) {
            // 延迟一点，先让页面渲染完首屏
            setTimeout(() => {
                fetchServiceTimes(cachedFailed).catch(err => {
                    console.warn('[初始化] 后台重试失败：', err);
                });
            }, 200);
        }
    } else {
        // ...原逻辑不变，注释修正为 2:00~3:59
        try {
            _gzCompletedStations = new Set();
            await fetchLineStations();
            await fetchServiceTimes();

            const hour = now.getHours();
            if (hour >= 2 && hour < 4) showYesterdayDataNotice();
        } catch (err) {
            console.error('[初始化] 获取数据失败', err);
            showLoadingMessage('获取数据失败，请检查网络后刷新页面重试');
            versionEl.textContent = '线路版本: 获取失败';
        }
    }
})();

// 5:00 定时刷新仍然保留（页面长驻时用于自动更新数据）
scheduleForceRefreshAt5AM();

// 后台预加载短线车数据（UI 弹窗点击时立即就能用）
if (typeof loadShortServices === 'function') loadShortServices();

initStationSearch();
initNearbyButton();
initRouteUI();
loadManualTransfers();   // 后台加载手工换乘映射

// 绑定获取数据按钮事件
document.getElementById('fetch-data-btn').addEventListener('click', async () => {
    try {
        const btn = document.getElementById('fetch-data-btn');
        btn.disabled = true;
        btn.textContent = '获取中...';

        if (systemTimeoutId) {
            clearTimeout(systemTimeoutId);
            systemTimeoutId = null;
        }
        isFetchingData = true;

        const cached = await loadDataFromCache();
        if (cached) {
            LINE_STATIONS = cached.lineStations;
            rawServiceRecords = cached.serviceRecords;
            populateLineFilter();
            populateLineButtons();
            parseTimeRecords(rawServiceRecords);
            versionEl.textContent = `线路版本: 缓存数据 (${cached.serviceDate})`;
            versionEl.classList.add('version-highlight');
            setTimeout(() => {
                versionEl.classList.remove('version-highlight');
            }, 3000);
        } else {
            _gzCompletedStations = new Set();
            await fetchLineStations();
            await fetchServiceTimes();
        }

        if (currentCustomTime === null) {
            scheduleNextMinuteTick();
        }
    } catch (err) {
        console.error(err);
        document.getElementById('map-wrapper').innerHTML = `<div class="loading-message" style="color:red;">获取数据失败：${err.message}</div>`;
        if (currentCustomTime === null) {
            scheduleNextMinuteTick();
        }
    } finally {
        const btn = document.getElementById('fetch-data-btn');
        btn.disabled = false;
        btn.textContent = '🚇 获取最新首末数据';
        isFetchingData = false;
    }
});

// ========== 回到顶部按钮逻辑 ==========
const backToTopBtn = document.getElementById('back-to-top');
if (backToTopBtn) {
    // 1. 去重后的线路颜色池
    const allColors = [...new Set(Object.values(HARDCODED_COLORS))];

    // 2. 随机抽取两条不同的颜色
    const idx1 = Math.floor(Math.random() * allColors.length);
    let idx2;
    do {
        idx2 = Math.floor(Math.random() * allColors.length);
    } while (idx2 === idx1 && allColors.length > 1);

    const c1 = allColors[idx1];
    const c2 = allColors[idx2];

    // 3. 随机渐变角度（0° ~ 360°）
    const angle = Math.floor(Math.random() * 360);

    // 4. 应用渐变背景
    backToTopBtn.style.background = `linear-gradient(${angle}deg, ${c1}, ${c2})`;

    // 5. 根据第一个颜色亮度自动选白/黑箭头（利用已有的 getContrastColor）
    backToTopBtn.style.color = getContrastColor(c1);

    // 6. 阴影色跟随第一个颜色
    backToTopBtn.style.boxShadow = `0 4px 14px ${c1}88`;

    // 7. 滚动超过 300px 显示
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    }, {passive: true});

    // 8. 点击平滑回到顶部
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({top: 0, behavior: 'smooth'});
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('controls-toggle-btn');
    const wrapper = document.getElementById('controls-wrapper');
    const toggleText = document.getElementById('toggle-text');

    if (btn && wrapper && toggleText) {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('loading')) return;

            const isCollapsed = wrapper.classList.contains('collapsed');

            if (isCollapsed) {
                // 展开
                wrapper.classList.remove('collapsed');
                wrapper.classList.add('expanded');
                toggleText.textContent = '收起控制面板 ▲';
            } else {
                // 收起
                wrapper.classList.remove('expanded');
                wrapper.classList.add('collapsed');
                toggleText.textContent = '展开控制面板 ▼';
            }
        });
    }
});