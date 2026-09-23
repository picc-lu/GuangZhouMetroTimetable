// ========== 界面辅助函数 ==========

function populateLineFilter() {
    console.log('[筛选] 开始 populateLineFilter');
    const select = document.getElementById('line-filter');
    select.innerHTML = '';
    const allLines = Object.keys(LINE_STATIONS).filter(line => LINE_COLORS[line]);
    console.log('[筛选] 所有有颜色的线路：', allLines);
    allLines.forEach(line => {
        const option = document.createElement('option');
        option.value = line;
        option.textContent = line;
        option.selected = true;
        select.appendChild(option);
    });
    selectedLines.clear();
    allLines.forEach(line => selectedLines.add(line));
    console.log('[筛选] 最终 selectedLines：', Array.from(selectedLines));
}

function applyFilter() {
    const select = document.getElementById('line-filter');
    selectedLines.clear();
    for (let option of select.options) {
        if (option.selected) selectedLines.add(option.value);
    }
    renderAllLines();
    populateLineButtons();
}

function populateLineButtons() {
    console.log('[按钮] 开始 populateLineButtons');
    const container = document.getElementById('line-buttons-row');
    if (!container) return;
    container.innerHTML = '';

    const lines = Object.entries(LINE_STATIONS)
        .filter(([line]) => LINE_COLORS[line] && selectedLines.has(line))
        .map(([line]) => line);
    console.log('[按钮] 生成的线路按钮：', lines);

    lines.forEach(line => {
        // 新增：当遇到 10号线时，插入一个强制换行块
        // if (line === '10') {
        //     const breakLine = document.createElement('div');
        //     breakLine.style.width = '100%';
        //     breakLine.style.height = '0';
        //     breakLine.style.flexBasis = '100%'; // 强制换行
        //     container.appendChild(breakLine);
        // }

        const btn = document.createElement('button');
        btn.className = 'line-button';

        // 核心修改：处理按钮显示文字
        let displayText = line;
        displayText = displayText.replace(/号线/g, ''); // 1. 删除所有"号线"
        if (displayText.includes('佛山')) {
            displayText = displayText.replace(/佛山/g, '佛'); // 2. 佛山替换为佛，比如"佛山2号线"变成"佛2"
        }
        btn.textContent = displayText;

        btn.style.backgroundColor = LINE_COLORS[line];
        btn.style.backgroundColor = LINE_COLORS[line];
        btn.style.color = getContrastColor(LINE_COLORS[line]);
        btn.addEventListener('click', () => {
            // 精确查找对应的线路容器
            const lineContainer = document.querySelector(`.line-container[data-line="${line}"]`);
            if (lineContainer) {
                const controls = document.querySelector('.controls');
                const controlsHeight = controls ? controls.offsetHeight : 0;
                const targetPosition = lineContainer.offsetTop - controlsHeight;
                window.scrollTo({top: targetPosition, behavior: 'smooth'});
            }
        });
        container.appendChild(btn);
    });
}

function showLoadingMessage(text) {
    const wrapper = document.getElementById('map-wrapper');
    wrapper.innerHTML = `<div class="loading-message">${text}</div>`;
}

function updateLoadingMessage(text) {
    const wrapper = document.getElementById('map-wrapper');
    const loadingDiv = wrapper.querySelector('.loading-message');
    if (loadingDiv) {
        loadingDiv.textContent = text;
    } else {
        wrapper.innerHTML = `<div class="loading-message">${text}</div>`;
    }
}

// ========== 模态框相关 ==========

// ========== 模态框相关 ==========

let modalOverlay = null;
let modalRefreshTimer = null;
let modalClockTimer = null;
let currentModalLine = null;
const modalScrollPositions = {}; // 每条线路独立的滚动位置
let bodyScrollY = 0;

function ensureModal() {
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>线路详情</h3>
                    <div class="modal-refresh-bar" id="modal-refresh-bar"></div>
                </div>
                <div class="modal-content"></div>
                <button class="v-refresh-btn" type="button" title="刷新" aria-label="刷新">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                </button>
                <button class="v-back-btn" type="button">← 返回</button>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        window.closeMetroModal = function() {
            // 保存当前线路的滚动位置
            if (currentModalLine) {
                const contentDiv = modalOverlay.querySelector('.modal-content');
                if (contentDiv) {
                    modalScrollPositions[currentModalLine] = contentDiv.scrollTop;
                }
            }
            stopModalTimers();
            modalOverlay.style.display = 'none';

            // 恢复 body 滚动
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            window.scrollTo(0, bodyScrollY);
        };

        modalOverlay.querySelector('.v-back-btn').addEventListener('click', closeMetroModal);

        // 手动刷新按钮：保持滚动位置
        modalOverlay.querySelector('.v-refresh-btn').addEventListener('click', () => {
            if (currentModalLine) {
                const contentDiv = modalOverlay.querySelector('.modal-content');
                const scrollTop = contentDiv.scrollTop;
                showLineDetails(currentModalLine, true);
                requestAnimationFrame(() => {
                    contentDiv.scrollTop = scrollTop;
                    if (currentCustomTime === null) {
                        restartRefreshBar();
                    }
                });
            }
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeMetroModal();
            }
        });

        // 阻止遮罩区域的滚动穿透
        modalOverlay.addEventListener('touchmove', (e) => {
            const scrollable = e.target.closest('.modal-content');
            if (!scrollable) {
                e.preventDefault();
            }
        }, { passive: false });
    }
}

function updateModalClock() {
    const el = document.getElementById('modal-live-clock');
    if (!el) return;
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
}

function startModalTimers(line) {
    stopModalTimers();
    currentModalLine = line;

    updateModalClock();
    modalClockTimer = setInterval(updateModalClock, 1000);

    restartRefreshBar(); // 启动进度条动画

    modalRefreshTimer = setInterval(() => {
        if (currentModalLine && modalOverlay && modalOverlay.style.display === 'flex') {
            const contentDiv = modalOverlay.querySelector('.modal-content');
            const scrollTop = contentDiv.scrollTop;
            showLineDetails(currentModalLine, true);
            requestAnimationFrame(() => {
                contentDiv.scrollTop = scrollTop;
                restartRefreshBar(); // 刷新完成后重置进度条
            });
        }
    }, 30000);
}

function stopModalTimers() {
    if (modalClockTimer) { clearInterval(modalClockTimer); modalClockTimer = null; }
    if (modalRefreshTimer) { clearInterval(modalRefreshTimer); modalRefreshTimer = null; }
    currentModalLine = null;
}

function restartRefreshBar() {
    const bar = document.getElementById('modal-refresh-bar');
    if (!bar) return;
    bar.classList.remove('animating');
    void bar.offsetWidth; // 强制 reflow，重新触发动画
    bar.classList.add('animating');
}

function showLineDetails(line, keepScroll = false) {
    ensureModal();

    const stations = LINE_STATIONS[line];
    if (!stations) return;

    const contentDiv = modalOverlay.querySelector('.modal-content');
    const title = modalOverlay.querySelector('.modal-header h3');
    title.textContent = `${line} 运营时间详情`;

    const lineColor = LINE_COLORS[line] || '#888';
    const currentMin = getCurrentMinutes();

    // ====== 计算双向主题色：色相偏移 + 加深，保证可读性 ======
    function hexToHsl(hex) {
        let r, g, b;
        const hh = hex.replace('#', '');
        if (hh.length === 3) {
            r = parseInt(hh[0] + hh[0], 16) / 255;
            g = parseInt(hh[1] + hh[1], 16) / 255;
            b = parseInt(hh[2] + hh[2], 16) / 255;
        } else {
            r = parseInt(hh.substring(0, 2), 16) / 255;
            g = parseInt(hh.substring(2, 4), 16) / 255;
            b = parseInt(hh.substring(4, 6), 16) / 255;
        }
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let hDeg = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: hDeg = (g - b) / d + (g < b ? 6 : 0); break;
                case g: hDeg = (b - r) / d + 2; break;
                case b: hDeg = (r - g) / d + 4; break;
            }
            hDeg /= 6;
        }
        return { h: Math.round(hDeg * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    const baseHsl = hexToHsl(lineColor);
    // 饱和度下限 55%，保证有颜色，避免灰色线路变成一片灰
    const colorS = Math.max(baseHsl.s, 55);
    // 上行：线路色相，加深到 32% 亮度
    const upColor = `hsl(${baseHsl.h}, ${colorS}%, 32%)`;
    // 下行：色相偏移 150°，加深到 32% 亮度，与上行对比明显
    const downColor = `hsl(${(baseHsl.h + 150) % 360}, ${colorS}%, 32%)`;

    // 预计算每一站的运营状态
    const stationStatus = stations.map(station => {
        const data = lineDirectionTime[line]?.[station];
        let upActive = false, downActive = false;
        if (data) {
            if (line === '11号线') {
                upActive = (data.upFull && currentMin >= data.upFull.first && currentMin <= data.upFull.last) ||
                    (data.upTerminal && currentMin >= data.upTerminal.first && currentMin <= data.upTerminal.last);
                downActive = (data.downFull && currentMin >= data.downFull.first && currentMin <= data.downFull.last) ||
                    (data.downTerminal && currentMin >= data.downTerminal.first && currentMin <= data.downTerminal.last);
            } else {
                upActive = (data.up || []).some(t => currentMin >= t.first && currentMin <= t.last);
                downActive = (data.down || []).some(t => currentMin >= t.first && currentMin <= t.last);
            }
        }
        return { upActive, downActive, anyActive: upActive || downActive };
    });

    const lineActive = stationStatus.some(s => s.anyActive);

    // ====== 判断整条线路方向是否统一（用于简化卡片显示） ======
    let simpleMode = false;
    let upTargetName = '';
    let downTargetName = '';
    if (line !== '11号线') {
        const upSet = new Set();
        const downSet = new Set();
        for (const st of stations) {
            const data = lineDirectionTime[line]?.[st] || {};
            (data.up || []).forEach(t => {
                let n = t.to;
                if (n.includes('（') && n.includes('）')) n = n.split('（')[0];
                upSet.add(n);
            });
            (data.down || []).forEach(t => {
                let n = t.to;
                if (n.includes('（') && n.includes('）')) n = n.split('（')[0];
                downSet.add(n);
            });
        }
        if (upSet.size === 1 && downSet.size === 1) {
            simpleMode = true;
            upTargetName = [...upSet][0];
            downTargetName = [...downSet][0];
        }
    }

    // ====== 弹窗抬头背景色：跟随线路色；整条线路全部结束 → 灰色 ======
    const modalHeader = modalOverlay.querySelector('.modal-header');
    const headerColor = lineActive ? lineColor : getGrayscaleColor(lineColor);
    const headerTextColor = getContrastColor(headerColor);
    modalHeader.style.background = headerColor;
    modalHeader.style.borderBottomColor = headerColor;
    const h3El = modalHeader.querySelector('h3');
    if (h3El) h3El.style.color = headerTextColor;

    function makeBlock(dirLabel, first, last, isUp) {
        const active = currentMin >= first && currentMin <= last;
        const remaining = last - currentMin;
        const showRemaining = active && remaining >= 0 && remaining <= 60;

        let inner, cls = 'v-time-block';
        if (active) {
            inner = `<div class="v-time-line"><span><b>末</b> ${minutesToDisplayStr(last)}</span></div>`;
        } else if (lineActive) {
            inner = `<div class="v-time-line ended"><span><b>末</b> ${minutesToDisplayStr(last)}</span></div>`;
            cls += ' ended';
        } else {
            inner = `<div class="v-time-line"><span><b>首</b> ${minutesToDisplayStr(first)}</span></div>`;
        }

        let badge = '';
        if (showRemaining) {
            const hue = (remaining / 60) * 45;
            const isUrgent = remaining >= 0 && remaining <= 3;
            const badgeText = isUrgent ? '即将结束运营' : `剩${remaining}分钟`;
            const urgentCls = isUrgent ? ' v-remaining-urgent' : '';
            badge = `<span class="v-remaining${urgentCls}" style="--badge-hue: ${hue};">${badgeText}</span>`;
        }

        // 徽章独占一行，方向独占一行，时间独立一行
        return `<div class="${cls}">
            ${badge ? `<div class="v-badge-row">${badge}</div>` : ''}
            ${simpleMode ? '' : `<div class="v-dir">${dirLabel}</div>`}
            ${inner}
        </div>`;
    }

    let html = '';

    // 自定义时间模式提示
    if (currentCustomTime !== null) {
        // ...
        html += `<div class="v-custom-time-notice">
            <span class="v-custom-icon">⏸</span>
            当前为自定义时间模式，详情页不会自动刷新
        </div>`;
    }

    // 3号线警告：放在内容最顶部（非悬浮）
    if (line === "3号线") {
        html += `<div class="v-notice-inline">⚠️ 在一日较晚时候，<strong>海傍~珠江新城</strong>无直达<strong>机场北</strong>的列车时，可乘坐<strong>天河客运站</strong>方向的列车，并在<strong>体育西路</strong>换乘<strong>机场北</strong>方向的列车。</div>`;
    }

    // 方向统一时，图例条放在 vertical-diagram 外面，才能紧贴 header
    if (simpleMode) {
        html += `<div class="v-legend" style="--up-color: ${upColor}; --down-color: ${downColor};">
            <div class="v-legend-up">
                <span class="v-legend-arrow">↓</span>
                <span>往 ${upTargetName}</span>
            </div>
            <div class="v-legend-divider">|</div>
            <div class="v-legend-down">
                <span class="v-legend-arrow">↑</span>
                <span>往 ${downTargetName}</span>
            </div>
        </div>`;

        // 新增：时间放到方向行的下面，且悬浮
        html += `<div class="modal-clock-row with-legend">
            <span class="modal-live-clock" id="modal-live-clock">--:--:--</span>
        </div>`;
    } else {
        // 没有图例条时，时间仍然悬浮在顶部
        html += `<div class="modal-clock-row no-legend">
            <span class="modal-live-clock" id="modal-live-clock">--:--:--</span>
        </div>`;
    }

    html += `<div class="vertical-diagram" style="--line-color: ${lineColor}; --up-color: ${upColor}; --down-color: ${downColor};">`;

    for (let idx = 0; idx < stations.length; idx++) {
        const station = stations[idx];
        const times = lineDirectionTime[line]?.[station] || (line === '11号线' ? {
            upFull: null, upTerminal: null, downFull: null, downTerminal: null
        } : { up: [], down: [] });

        let upCards = '';
        let downCards = '';

        if (line === '11号线') {
            // up 视觉向下 → 用 ↓；down 视觉向上 → 用 ↑
            if (times.upFull)     upCards   += makeBlock('↓ 外环 全程',   times.upFull.first,     times.upFull.last,true);
            if (times.upTerminal) upCards   += makeBlock('↓ 外环 往龙潭', times.upTerminal.first, times.upTerminal.last,true);
            if (times.downFull)   downCards += makeBlock('↑ 内环 全程',   times.downFull.first,   times.downFull.last,false);
            if (times.downTerminal) downCards += makeBlock('↑ 内环 往赤沙', times.downTerminal.first, times.downTerminal.last,false);
        } else {
            upCards = (times.up || []).map(t => {
                let n = t.to;
                if (n.includes('（') && n.includes('）')) n = n.split('（')[0];
                return makeBlock(`↓ 往 ${n}`, t.first, t.last, true);
            }).join('');
            downCards = (times.down || []).map(t => {
                let n = t.to;
                if (n.includes('（') && n.includes('）')) n = n.split('（')[0];
                return makeBlock(`↑ 往 ${n}`, t.first, t.last, false);
            }).join('');
        }

        // 统计该方向所有 block 是否都已结束
        const upTotal = (upCards.match(/v-time-block/g) || []).length;
        const upEnded = (upCards.match(/v-time-block ended/g) || []).length;
        const upAllEnded = upTotal > 0 && upTotal === upEnded;

        const downTotal = (downCards.match(/v-time-block/g) || []).length;
        const downEnded = (downCards.match(/v-time-block ended/g) || []).length;
        const downAllEnded = downTotal > 0 && downTotal === downEnded;

        const upCard = upCards ? `<div class="v-card v-up${upAllEnded ? ' v-card-ended' : ''}">${upCards}</div>` : '';
        const downCard = downCards ? `<div class="v-card v-down${downAllEnded ? ' v-card-ended' : ''}">${downCards}</div>` : '';

        const stationActive = stationStatus[idx].anyActive;
        const nameClass = stationActive ? 'v-name' : 'v-name v-name-inactive';
        const dotClass = stationActive ? 'v-dot' : 'v-dot v-dot-inactive';

        // 上方线段：连接 idx-1 与 idx；首站不判断
        const topActive = idx > 0 && stationStatus[idx - 1].anyActive && stationStatus[idx].anyActive;
        const topClass = (idx === 0) ? 'v-line top'
            : (topActive ? 'v-line top' : 'v-line top v-line-inactive');

        // 下方线段：连接 idx 与 idx+1；末站不判断
        const bottomActive = idx < stations.length - 1 && stationStatus[idx].anyActive && stationStatus[idx + 1].anyActive;
        const bottomClass = (idx === stations.length - 1) ? 'v-line bottom'
            : (bottomActive ? 'v-line bottom' : 'v-line bottom v-line-inactive');

        html += `
            <div class="v-station-row">
                <div class="${nameClass}">${station}</div>
                <div class="v-up-col">${upCard}</div>
                <div class="v-line-col">
                    <div class="${topClass}"></div>
                    <div class="${dotClass}"></div>
                    <div class="${bottomClass}"></div>
                </div>
                <div class="v-down-col">${downCard}</div>
            </div>
        `;
    }

    html += '</div>';

    // 3号线警告框：悬浮固定在弹窗底部
    // let fixedNotice = modalOverlay.querySelector('.v-fixed-notice');
    // if (line === "3号线") {
    //     if (!fixedNotice) {
    //         fixedNotice = document.createElement('div');
    //         fixedNotice.className = 'v-fixed-notice';
    //         modalOverlay.querySelector('.modal-container').appendChild(fixedNotice);
    //     }
    //     fixedNotice.innerHTML = '⚠️ 在一日较晚时候，<strong>海傍~珠江新城</strong>无直达<strong>机场北</strong>的列车时，可乘坐<strong>天河客运站</strong>方向的列车，并在<strong>体育西路</strong>换乘<strong>机场北</strong>方向的列车。';
    //     fixedNotice.style.display = 'block';
    //     contentDiv.style.paddingBottom = '230px';
    // } else {
    //     if (fixedNotice) fixedNotice.style.display = 'none';
    //     contentDiv.style.paddingBottom = '90px';
    // }

    contentDiv.innerHTML = html;
    updateModalClock();
    modalOverlay.style.display = 'flex';

    // 只在首次打开时记录页面位置，刷新时不覆盖
    if (document.body.style.position !== 'fixed') {
        bodyScrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.top = `-${bodyScrollY}px`;
    }

    // 恢复该线路上次的滚动位置（默认 0）
    if (!keepScroll) {
        const savedPos = modalScrollPositions[line] || 0;
        contentDiv.scrollTop = savedPos;
        if (currentCustomTime === null) {
            startModalTimers(line);
        } else {
            // 自定义时间模式：只启动时钟，不启动 30 秒自动刷新
            stopModalTimers();
            currentModalLine = line;
            updateModalClock();
            if (modalClockTimer) clearInterval(modalClockTimer);
            modalClockTimer = setInterval(updateModalClock, 1000);
            // 进度条不启动，隐藏之
            const bar = document.getElementById('modal-refresh-bar');
            if (bar) bar.classList.remove('animating');
        }
    }
}