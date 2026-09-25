// 全局变量声明
let rawServiceRecords = [];
let LINE_STATIONS = { ...linesData.线路 };
let LINE_COLORS = { ...HARDCODED_COLORS };
let lineDirectionTime = {};
let currentCustomTime = null;
let systemTimeoutId = null;
let scrollPositions = {};
let selectedLines = new Set();
let rowHeight = 45;

const versionEl = document.getElementById('version-display');
versionEl.textContent = '线路版本: 2026-03-03 (内置)';

// 事件监听绑定
document.getElementById('apply-custom-time').addEventListener('click', () => {
    const h = parseInt(document.getElementById('hour-select').value, 10);
    const m = parseInt(document.getElementById('minute-select').value, 10);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    currentCustomTime = d;
    console.log(`[事件] 应用自定义时间：${h}:${m}`);
    renderAllLines();
});

document.getElementById('use-system-time').addEventListener('click', () => {
    console.log('[事件] 应用系统时间');
    currentCustomTime = null;
    renderAllLines();
});

document.getElementById('line-filter').addEventListener('change', applyFilter);
document.getElementById('select-all').addEventListener('click', () => {
    console.log('[事件] 全选线路');
    const select = document.getElementById('line-filter');
    for (let opt of select.options) opt.selected = true;
    applyFilter();
});
document.getElementById('deselect-all').addEventListener('click', () => {
    console.log('[事件] 清空线路');
    const select = document.getElementById('line-filter');
    for (let opt of select.options) opt.selected = false;
    applyFilter();
});

document.getElementById('size-select').addEventListener('change', (e) => {
    console.log(`[事件] 行高调整为：${e.target.value}`);
    rowHeight = parseInt(e.target.value, 10);
    renderAllLines();
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

// ========== 凌晨时段（2:00~5:59）提示昨日数据 ==========
function showYesterdayDataNotice() {
    // 避免重复插入
    if (document.querySelector('.yesterday-data-notice')) return;

    // 计算应显示的日期：若当前时间在 6:00 前，则为前一天
    const now = new Date();
    const displayDate = new Date(now);
    if (now.getHours() < 6) {
        displayDate.setDate(displayDate.getDate() - 1);
    }
    const dateStr = displayDate.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');

    const notice = document.createElement('div');
    notice.className = 'yesterday-data-notice';
    notice.innerHTML = `⚠️ 当前显示的是 <b>${dateStr}</b> 的数据，新的运营数据将在 <b>6:00</b> 自动获取。`;

    // 插入到 banner 之后
    const banner = document.querySelector('.banner');
    if (banner && banner.parentNode) {
        banner.parentNode.insertBefore(notice, banner.nextSibling);
    }
}

// ========== 新增：强制获取最新数据 ==========
function forceFetchLatestData() {
    console.log('[6:00定时] 强制获取最新数据');
    (async () => {
        try {
            isFetchingData = true;
            await fetchLineStations();
            await fetchServiceTimes();

            // 新增：移除凌晨时段的昨日数据提示
            const notice = document.querySelector('.yesterday-data-notice');
            if (notice) notice.remove();

            if (currentCustomTime === null) {
                scheduleNextMinuteTick();
            }
        } catch (err) {
            console.error('[6:00定时] 获取数据失败', err);
        } finally {
            isFetchingData = false;
        }
    })();
}

// ========== 新增：设置 6:00 定时刷新 ==========
function scheduleForceRefreshAt6AM() {
    const now = new Date();
    const next6 = new Date(now);
    next6.setHours(6, 0, 0, 0);
    // 如果已经过了今天的 6:00，则目标改为明天的 6:00
    if (next6 <= now) {
        next6.setDate(next6.getDate() + 1);
    }
    const delay = next6 - now;
    console.log(`[定时] 下一次强制刷新时间：${next6.toLocaleString()}（约 ${Math.round(delay / 1000 / 60)} 分钟后）`);

    systemTimeoutId = setTimeout(() => {
        forceFetchLatestData();
        // 递归设置下一天的 6:00 定时
        scheduleForceRefreshAt6AM();
    }, delay);
}

// ========== 初始化数据加载 ==========
const now = new Date();
const isAfter6AM = now.getHours() >= 6;
const cached = loadDataFromCache();

if (isAfter6AM) {
    // 6:00 之后：强制拉取最新数据
    console.log('[初始化] 当前时间在 6:00 之后，强制获取最新数据');
    (async () => {
        try {
            await fetchLineStations();
            await fetchServiceTimes();
        } catch (err) {
            console.error('[初始化] 获取最新数据失败，尝试降级到缓存', err);
            if (cached) {
                LINE_STATIONS = cached.lineStations;
                rawServiceRecords = cached.serviceRecords;
                populateLineFilter();
                populateLineButtons();
                parseTimeRecords(rawServiceRecords);
                versionEl.textContent = `线路版本: 缓存数据 (${cached.date})`;
                currentCustomTime = null;
            } else {
                showLoadingMessage('获取数据失败，请检查网络后点击“获取最新首末数据”');
                versionEl.textContent = '线路版本: 获取失败';
            }
        }
    })();
} else {
    // 6:00 之前：优先使用缓存
    console.log('[初始化] 当前时间在 6:00 之前，优先使用缓存');
    if (cached) {
        LINE_STATIONS = cached.lineStations;
        rawServiceRecords = cached.serviceRecords;
        populateLineFilter();
        populateLineButtons();
        parseTimeRecords(rawServiceRecords);
        versionEl.textContent = `线路版本: 缓存数据 (${cached.date})`;
        currentCustomTime = null;

        // 2:00~5:59 提示用户这是昨天数据
        const hour = now.getHours();
        if (hour >= 2 && hour < 6) {
            showYesterdayDataNotice(); // 不再传参数
        }
    } else {
        // 无缓存时仍然尝试获取
        (async () => {
            try {
                await fetchLineStations();
                await fetchServiceTimes();

                // 新增：2:00~5:59 时，即使没有缓存，获取完数据后也提示用户这是昨天的数据
                const hour = now.getHours();
                if (hour >= 2 && hour < 6) {
                    showYesterdayDataNotice();
                }
            } catch (err) {
                console.error('[初始化] 无缓存且自动获取失败', err);
                showLoadingMessage('获取数据失败，请检查网络后点击“获取最新首末数据”');
                versionEl.textContent = '线路版本: 获取失败';
            }
        })();
    }
}

// 设置 6:00 定时刷新（无论何时打开页面，都会在下一个 6:00 触发）
scheduleForceRefreshAt6AM();

// 绑定获取数据按钮事件
document.getElementById('fetch-data-btn').addEventListener('click', async () => {
    console.log('[事件] 用户点击“获取最新首末时间数据”');
    try {
        const btn = document.getElementById('fetch-data-btn');
        btn.disabled = true;
        btn.textContent = '获取中...';

        if (systemTimeoutId) {
            clearTimeout(systemTimeoutId);
            systemTimeoutId = null;
        }
        isFetchingData = true;

        const cached = loadDataFromCache();
        if (cached) {
            console.log('[事件] 使用缓存数据');
            LINE_STATIONS = cached.lineStations;
            rawServiceRecords = cached.serviceRecords;
            populateLineFilter();
            populateLineButtons();
            parseTimeRecords(rawServiceRecords);
            versionEl.textContent = `线路版本: 缓存数据 (${cached.date})`;
            versionEl.classList.add('version-highlight');
            setTimeout(() => {
                versionEl.classList.remove('version-highlight');
            }, 3000);
        } else {
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

// 全局标志，用于防止在获取数据期间因系统时间自动刷新而重复渲染
let isFetchingData = false;

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
    }, { passive: true });

    // 8. 点击平滑回到顶部
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}