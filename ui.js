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

    // ====== 新增：以“广佛线”为界，拆分成两行 ======
    const splitIndex = lines.indexOf('广佛线');
    let row1Lines = [];
    let row2Lines = [];

    if (splitIndex !== -1) {
        row1Lines = lines.slice(0, splitIndex);
        row2Lines = lines.slice(splitIndex); // 包含广佛线及其后面的所有线路
    } else {
        row1Lines = lines; // 找不到广佛线时全部放到第一行
    }

    // 创建两个横向滚动容器
    const row1Container = document.createElement('div');
    row1Container.className = 'line-scroll-row';
    const row2Container = document.createElement('div');
    row2Container.className = 'line-scroll-row';

    // 生成按钮的工具函数
    const createButton = (line) => {
        const btn = document.createElement('button');
        btn.className = 'line-button';
        let displayText = line;
        displayText = displayText.replace(/号线/g, '');
        if (displayText.includes('佛山')) {
            displayText = displayText.replace(/佛山/g, '佛');
        }
        btn.textContent = displayText;
        btn.style.backgroundColor = LINE_COLORS[line];
        btn.style.color = getContrastColor(LINE_COLORS[line]);
        btn.addEventListener('click', () => {
            // 改为弹出详情
            showLineDetails(line);
        });
        return btn;
    };

    // 填充第一行
    row1Lines.forEach(line => row1Container.appendChild(createButton(line)));
    // 填充第二行
    row2Lines.forEach(line => row2Container.appendChild(createButton(line)));

    // 将两行添加到主容器中
    container.appendChild(row1Container);
    container.appendChild(row2Container);
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

    // ====== 新增：人工换乘映射表 ======
    const MANUAL_TRANSFERS = {
        "海珠有轨1号线": {
            "广州塔（有轨）": "广州塔",
            "万胜围（有轨）": "万胜围"
        },
        "黄埔有轨1号线": {
            "地铁长平": "长平",
            "地铁水西": "水西",
            "市民广场": "萝岗",
            "地铁香雪": "香雪"
        },
        "黄埔有轨2号线": {
            "地铁香雪": "香雪"
        },
        "南海有轨1号线": {
            "虫雷 岗（有轨）": "虫雷 岗" // 注：广佛线的站名实际是“礌岗”，若需显示“虫雷岗”可自行改为 "虫雷岗"
        }
    };

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

    // ====== 判断是否将方向统一提取到顶部 ======
    let useTopLegend = false;
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
        // 只要该线路有终点站数据，就使用顶部图例
        if (upSet.size > 0 || downSet.size > 0) {
            useTopLegend = true;
            upTargetName = [...upSet].join(' ｜ '); // 修改这里：使用全角竖线作为分割线
            downTargetName = [...downSet].join(' ｜ '); // 修改这里：使用全角竖线作为分割线
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

        return `<div class="${cls}">
            ${badge ? `<div class="v-badge-row">${badge}</div>` : ''}
            ${dirLabel ? `<div class="v-dir">${dirLabel}</div>` : ''}
            ${inner}
        </div>`;
    }

    let html = '';

    // 自定义时间模式提示
    if (currentCustomTime !== null) {
        html += `<div class="v-custom-time-notice">
            <span class="v-custom-icon">⏸</span>
            当前为自定义时间模式，本页面不会自动刷新
        </div>`;
    }

    // 3号线警告：放在内容最顶部（非悬浮）
    if (line === "3号线") {
        html += `<div class="v-notice-inline">⚠️ 在一日较晚时候，<strong>海傍~珠江新城</strong>无直达<strong>机场北</strong>的列车时，可乘坐<strong>天河客运站</strong>方向的列车，并在<strong>体育西路</strong>换乘<strong>机场北</strong>方向的列车。</div>`;
    }

    // ====== 悬浮头部：包含方向图例和悬浮时钟 ======
    html += `<div class="modal-sticky-header">`;

    if (useTopLegend) {
        html += `<div class="v-legend" style="--up-color: ${upColor}; --down-color: ${downColor};">
            <div class="v-legend-up">
                <span class="v-legend-arrow">↓</span>
                <span>往 ${upTargetName || '--'}</span>
            </div>
            <div class="v-legend-divider">|</div>
            <div class="v-legend-down">
                <span class="v-legend-arrow">↑</span>
                <span>往 ${downTargetName || '--'}</span>
            </div>
        </div>`;
    }

    // 时钟
    html += `<div class="modal-clock-row ${useTopLegend ? 'with-legend' : 'no-legend'}">
        <span class="modal-live-clock" id="modal-live-clock">--:--:--</span>
    </div>`;

    html += `</div>`; // 结束 modal-sticky-header

    // 站点详情
    html += `<div class="vertical-diagram" style="--line-color: ${lineColor}; --up-color: ${upColor}; --down-color: ${downColor};">`;

    for (let idx = 0; idx < stations.length; idx++) {
        const station = stations[idx];
        const times = lineDirectionTime[line]?.[station] || (line === '11号线' ? {
            upFull: null, upTerminal: null, downFull: null, downTerminal: null
        } : { up: [], down: [] });

        // ====== 计算换乘线路 ======
        const transferLines = new Map(); // key: 线路名, value: { realStation, isManual }

        // 1. 标准匹配（站名完全一致，无需出闸）
        for (const [otherLine, otherStations] of Object.entries(LINE_STATIONS)) {
            if (otherLine !== line && otherStations.includes(station)) {
                transferLines.set(otherLine, { realStation: station, isManual: false });
            }
        }

        // 2. 处理有轨电车人工换乘映射（需出闸）
        for (const [tramLine, mapping] of Object.entries(MANUAL_TRANSFERS)) {
            if (tramLine === line) {
                const targetMetroStation = mapping[station];
                if (targetMetroStation) {
                    for (const [metroLine, metroStations] of Object.entries(LINE_STATIONS)) {
                        if (metroLine !== line && metroStations.includes(targetMetroStation)) {
                            transferLines.set(metroLine, { realStation: targetMetroStation, isManual: true });
                        }
                    }
                }
            } else {
                for (const [tramStation, metroStation] of Object.entries(mapping)) {
                    if (metroStation === station) {
                        if (LINE_STATIONS[tramLine] && LINE_STATIONS[tramLine].includes(tramStation)) {
                            transferLines.set(tramLine, { realStation: tramStation, isManual: true });
                        }
                    }
                }
            }
        }

        let transferHtml = '';
        if (transferLines.size > 0) {
            transferHtml = `<div class="v-transfer-lines">`;
            transferLines.forEach((data, tLine) => {
                const { realStation, isManual } = data;
                const transferData = lineDirectionTime[tLine]?.[realStation];
                let isTransferActive = false;
                let upActive = false;
                let downActive = false;
                let activeToStation = '';

                if (transferData) {
                    if (tLine === '11号线') {
                        upActive = (transferData.upFull && currentMin >= transferData.upFull.first && currentMin <= transferData.upFull.last) ||
                            (transferData.upTerminal && currentMin >= transferData.upTerminal.first && currentMin <= transferData.upTerminal.last);
                        downActive = (transferData.downFull && currentMin >= transferData.downFull.first && currentMin <= transferData.downFull.last) ||
                            (transferData.downTerminal && currentMin >= transferData.downTerminal.first && currentMin <= transferData.downTerminal.last);
                        isTransferActive = upActive || downActive;
                    } else {
                        upActive = (transferData.up || []).some(t => currentMin >= t.first && currentMin <= t.last);
                        downActive = (transferData.down || []).some(t => currentMin >= t.first && currentMin <= t.last);
                        isTransferActive = upActive || downActive;

                        // 提取当前运营方向的终点站
                        if (upActive) {
                            const upTime = (transferData.up || []).find(t => currentMin >= t.first && currentMin <= t.last);
                            if (upTime) activeToStation = upTime.to;
                        } else if (downActive) {
                            const downTime = (transferData.down || []).find(t => currentMin >= t.first && currentMin <= t.last);
                            if (downTime) activeToStation = downTime.to;
                        }
                    }
                }

                let color = LINE_COLORS[tLine] || '#888';
                let textColor = getContrastColor(color);
                let badgeClass = 'v-transfer-badge';

                if (!isTransferActive) {
                    color = '#e2e8f0';
                    textColor = '#94a3b8';
                    badgeClass += ' inactive';
                }

                let iconHtml = '';
                if (isManual) {
                    badgeClass += ' manual';
                    iconHtml = '<span class="v-transfer-icon">出</span>';
                }

                let displayName = tLine.replace(/号线/g, '');
                if (displayName.includes('佛山')) displayName = displayName.replace(/佛山/g, '佛');

                // 单方向判断，并修改分割线样式
                if (isTransferActive && tLine !== '11号线' && upActive !== downActive && activeToStation) {
                    // 检查该站点是否为换乘线路的起点或终点站
                    const transferStations = LINE_STATIONS[tLine] || [];
                    const isTerminal = transferStations.length > 0 &&
                        (realStation === transferStations[0] || realStation === transferStations[transferStations.length - 1]);

                    // 只有非终点站才显示“仅xx方向”
                    if (!isTerminal) {
                        let toName = activeToStation;
                        if (toName.includes('（') && toName.includes('）')) toName = toName.split('（')[0];
                        if (toName.includes('(') && toName.includes(')')) toName = toName.split('(')[0];

                        // 去掉“往”字，只保留“仅xx方向”
                        displayName = `${displayName} <span class="v-transfer-icon direction">仅${toName}方向</span>`;
                    }
                }

                const titleAttr = isManual ? 'title="需出闸换乘"' : '';

                // 添加点击跳转事件
                transferHtml += `<span class="${badgeClass}" ${titleAttr} style="background-color: ${color}; color: ${textColor};" onclick="event.stopPropagation(); showLineDetails('${tLine}');">${iconHtml}${displayName}</span>`;
            });
            transferHtml += `</div>`;
        }

        let upCards = '';
        let downCards = '';

        if (line === '11号线') {
            // up 视觉向下 → 用 ↓；down 视觉向上 → 用 ↑
            if (times.upFull)     upCards   += makeBlock('↓ 外环 全程',   times.upFull.first,     times.upFull.last,true);
            if (times.upTerminal) upCards   += makeBlock('↓ 外环 往龙潭', times.upTerminal.first, times.upTerminal.last,true);
            if (times.downFull)   downCards += makeBlock('↑ 内环 全程',   times.downFull.first,   times.downFull.last,false);
            if (times.downTerminal) downCards += makeBlock('↑ 内环 往赤沙', times.downTerminal.first, times.downTerminal.last,false);
        } else {
            // 非11号线：方向已提取至顶部，卡片内不再显示具体方向
            // 修改：判断是否有多个终点，如果有，则用容器包裹并左右分布
            if (times.up && times.up.length > 1) {
                upCards = `<div class="v-multi-terminals">` +
                    times.up.map(t => makeBlock('', t.first, t.last, true)).join('') +
                    `</div>`;
            } else {
                upCards = (times.up || []).map(t => makeBlock('', t.first, t.last, true)).join('');
            }

            if (times.down && times.down.length > 1) {
                downCards = `<div class="v-multi-terminals">` +
                    times.down.map(t => makeBlock('', t.first, t.last, false)).join('') +
                    `</div>`;
            } else {
                downCards = (times.down || []).map(t => makeBlock('', t.first, t.last, false)).join('');
            }
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

        // 判断是否有换乘标签，以此决定是否添加 has-transfer 类名
        const hasTransferClass = transferHtml ? 'has-transfer' : '';

        html += `
            <div class="v-station-row ${hasTransferClass}">
                <div class="${nameClass}">
                    <span>${station}</span>
                    ${transferHtml}
                </div>
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

    // ====== 新增：恢复进度条显示状态 ======
    const refreshBar = document.querySelector('.modal-refresh-bar');
    if (refreshBar) {
        refreshBar.style.display = '';
    }

    contentDiv.innerHTML = html;

    // 动态调整站点行的上内边距，防止换乘标签遮挡下方时间卡片
    requestAnimationFrame(() => {
        const rows = contentDiv.querySelectorAll('.v-station-row');
        rows.forEach(row => {
            const nameDiv = row.querySelector('.v-name');
            if (nameDiv) {
                // 获取 .v-name 的实际渲染高度
                const nameHeight = nameDiv.offsetHeight;

                // 基础的上内边距（默认站名高度约 28px，原有的 26px 是为了留白）
                // 如果站名高度大于 36px，说明包含了换乘标签并且可能发生了换行
                if (nameHeight > 36) {
                    // 动态撑开行高：站名高度 + 8px 的安全边距
                    row.style.paddingTop = `${nameHeight + 8}px`;
                } else {
                    // 恢复默认（确保没有换乘标签的站点不受影响）
                    row.style.paddingTop = '26px';
                }
            }
        });
    });

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
    }

    // ====== 新增：控制刷新按钮的显示与隐藏 ======
    const refreshBtn = modalOverlay.querySelector('.v-refresh-btn');
    if (currentCustomTime === null) {
        // 系统时间模式：显示刷新按钮（'' 让它回到 CSS 默认的 flex 状态）
        if (refreshBtn) refreshBtn.style.display = '';

        if (!keepScroll) {
            startModalTimers(line);
        }
    } else {
        // 自定义时间模式：隐藏刷新按钮
        if (refreshBtn) refreshBtn.style.display = 'none';

        if (!keepScroll) {
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