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

let modalOverlay = null;

function ensureModal() {
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>线路详情</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-content"></div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // 关闭事件
        const closeBtn = modalOverlay.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    }
}

function showLineDetails(line) {
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

        // 徽章颜色：剩余 60 分钟 → HSL 色相 45°（深黄）；剩余 0 分钟 → 0°（深红）
        let badge = '';
        if (showRemaining) {
            const hue = (remaining / 60) * 45;
            // 0~3 分钟：文案改为"即将结束运营"，并附加紧急样式
            const isUrgent = remaining >= 0 && remaining <= 3;
            const badgeText = isUrgent ? '即将结束运营' : `剩${remaining}分钟`;
            const urgentCls = isUrgent ? ' v-remaining-urgent' : '';
            badge = `<span class="v-remaining${urgentCls}" style="--badge-hue: ${hue};">${badgeText}</span>`;
        }

        // 上行徽章在前，下行交换为徽章在前
        const content = `${badge}${dirLabel}`;

        return `<div class="${cls}">
            <div class="v-dir">${content}</div>
            ${inner}
        </div>`;
    }

    let html = `<div class="vertical-diagram" style="--line-color: ${lineColor}; --up-color: ${upColor}; --down-color: ${downColor};">`;

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

        const upCard = upCards ? `<div class="v-card v-up">${upCards}</div>` : '';
        const downCard = downCards ? `<div class="v-card v-down">${downCards}</div>` : '';

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

    if (line === "3号线") {
        html += `<div class="line-note-modal">⚠️ 在一日较晚时候，<strong>海傍~珠江新城</strong>无直达<strong>机场北</strong>的列车时，可乘坐<strong>天河客运站</strong>方向的列车，并在<strong>体育西路</strong>换乘<strong>机场北</strong>方向的列车。</div>`;
    }

    contentDiv.innerHTML = html;
    modalOverlay.style.display = 'flex';
    contentDiv.scrollTop = 0;
}