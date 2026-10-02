// ========== 共享渲染辅助 ==========

function getFontSizes() {
    let timeMetaFontSize = '12px';
    let stationFontSize = 16;
    if (rowHeight === 65) { timeMetaFontSize = '14px'; stationFontSize = 18; }
    else if (rowHeight === 55) { timeMetaFontSize = '13px'; stationFontSize = 17; }
    else if (rowHeight === 35) { stationFontSize = 15; }
    else if (rowHeight === 25) { stationFontSize = 14; }
    return { timeMetaFontSize, stationFontSize };
}

/**
 * 计算一条线路所有站点的上下行激活状态。
 * @returns {{ upActiveCache: boolean[], downActiveCache: boolean[], hasActiveStation: boolean }}
 */
function computeLineActivity(line, stations, currentMin) {
    const n = stations.length;
    const upActiveCache = new Array(n);
    const downActiveCache = new Array(n);
    let hasActiveStation = false;

    for (let i = 0; i < n; i++) {
        const st = stations[i];
        if (line === '11号线') {
            const d = lineDirectionTime[line]?.[st] || {};
            upActiveCache[i]   = !!(d.upFull     && currentMin >= d.upFull.first     && currentMin <= d.upFull.last)
                || !!(d.upTerminal && currentMin >= d.upTerminal.first && currentMin <= d.upTerminal.last);
            downActiveCache[i] = !!(d.downFull     && currentMin >= d.downFull.first     && currentMin <= d.downFull.last)
                || !!(d.downTerminal && currentMin >= d.downTerminal.first && currentMin <= d.downTerminal.last);
        } else {
            const up = lineDirectionTime[line]?.[st]?.up || [];
            const down = lineDirectionTime[line]?.[st]?.down || [];
            upActiveCache[i]   = up.some(t => currentMin >= t.first && currentMin <= t.last);
            downActiveCache[i] = down.some(t => currentMin >= t.first && currentMin <= t.last);
        }
        if (upActiveCache[i] || downActiveCache[i]) hasActiveStation = true;
    }
    return { upActiveCache, downActiveCache, hasActiveStation };
}

/** 构建 3 号线「乘坐提示」徽章（嵌入 tab 内，点击弹出说明） */
function buildLineNote() {
    const tip = document.createElement('span');
    tip.className = 'line-meta-tip';
    tip.textContent = '乘坐提示';
    tip.title = '点击查看 3 号线乘坐提示';

    tip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof ensureModal !== 'function') return;

        ensureModal();
        modalHistory.length = 0;

        if (typeof stopModalTimers === 'function') stopModalTimers();

        const modalHeader = document.querySelector('.modal-header');
        const lineColor = LINE_COLORS['3号线'] || '#eca154';
        modalHeader.style.background = lineColor;
        modalHeader.style.borderBottomColor = lineColor;
        const h3El = modalHeader.querySelector('h3');
        if (h3El) {
            h3El.textContent = '3号线乘坐提示';
            h3El.style.color = getContrastColor(lineColor);
        }

        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = `<div style="padding: 20px; font-size: 16px; line-height: 1.8; color: #333;">
                在一日较晚时候，<b>海傍~珠江新城</b>无直达<b>机场北</b>的列车时，可乘坐<b>天河客运站</b>方向的列车，并在<b>体育西路</b>换乘<b>机场北</b>方向的列车。
            </div>`;
        }

        const refreshBar = document.querySelector('.modal-refresh-bar');
        if (refreshBar) {
            refreshBar.classList.remove('animating');
            refreshBar.style.display = 'none';
        }
        const refreshBtn = document.querySelector('.v-refresh-btn');
        if (refreshBtn) refreshBtn.style.display = 'none';

        const prevBtn = document.querySelector('.v-prev-btn');
        if (prevBtn) prevBtn.classList.remove('show');

        // 6. 锁定 body 滚动并保存位置
        lockBodyScroll();

        // 7. 显示弹窗
        document.querySelector('.modal-overlay').style.display = 'flex';
    });

    return tip;
}

/** 构建线路名卡片的内部 HTML（含主名 + 副名排版） */
function buildLineNameHtml(line) {
    // let mainPart = line;
    // let extraPart = '';
    // const lineIndex = line.lastIndexOf('线');
    // if (lineIndex !== -1 && lineIndex < line.length - 1) {
    //     mainPart = line.substring(0, lineIndex + 1);
    //     extraPart = line.substring(lineIndex + 1);
    // }
    // const extraFontSize = getExtraFontSize(extraPart);
    // let nameHtml = '';
    // const numMatch = mainPart.match(/^(\d+)(.*)/);
    // if (numMatch) {
    //     nameHtml = `<div class="line-num" style="writing-mode: horizontal-tb; font-size: 18px; letter-spacing: 1px;">${numMatch[1]}</div>
    //         <div class="line-str" style="writing-mode: vertical-lr; text-orientation: upright; font-size: 18px; letter-spacing: 2px; margin-top: 2px;">${numMatch[2]}</div>`;
    // } else {
    //     nameHtml = `<div class="line-main" style="writing-mode: vertical-lr; text-orientation: upright; font-size: 18px; letter-spacing: 2px;">${mainPart}</div>`;
    // }
    // if (extraPart) {
    //     let extraHtml = extraPart;
    //     let extraCls = 'line-extra';
    //     if (extraPart.includes('（') || extraPart.includes('(')) {
    //         extraHtml = extraPart.replace(/[（(]|[)）]/g, '');
    //         extraCls += ' extra-long';
    //     }
    //     nameHtml += `<div class="${extraCls}" style="font-size: ${extraFontSize}px; line-height: 1.4; writing-mode: vertical-lr; text-orientation: upright;">${extraHtml}</div>`;
    // }

    // 卡片 tab 只需一行纯文本，形如 "2号线" / "3号线北"
    const tabText = document.createElement('span');
    tabText.className = 'line-tab-text';
    tabText.textContent = line;
    meta.appendChild(tabText);
    return nameHtml;
}

function renderAllLines() {
    const currentMin = getCurrentMinutes();
    const { timeMetaFontSize, stationFontSize } = getFontSizes();

    // 保存滚动位置
    document.querySelectorAll('.scroll-area').forEach((area) => {
        const lineName = area.dataset.lineName;
        if (lineName) scrollPositions[lineName] = area.scrollLeft;
    });

    const wrapper = document.getElementById('map-wrapper');
    wrapper.innerHTML = '';

    const lines = Object.entries(LINE_STATIONS).filter(([line]) => LINE_COLORS[line]);

    lines.forEach(([line, stations]) => {
        if (!selectedLines.has(line)) return;

        const originalColor = LINE_COLORS[line] || '#888';
        const { upActiveCache, downActiveCache, hasActiveStation } =
            computeLineActivity(line, stations, currentMin);
        const color = hasActiveStation ? originalColor : getGrayscaleColor(originalColor);

        const lineDiv = document.createElement('div');
        lineDiv.className = 'line-container';
        lineDiv.dataset.line = line;
        lineDiv.style.setProperty('--line-color', color);   // 新增：卡片边框用线路色

        // 线路名卡片
        const meta = document.createElement('div');
        meta.className = 'line-meta';
        meta.style.backgroundColor = color;
        meta.style.color = getContrastColor(color);

        const tabText = document.createElement('span');
        tabText.className = 'line-tab-text';
        tabText.textContent = line;
        meta.appendChild(tabText);

        if (line === '3号线') {
            meta.appendChild(buildLineNote());
        }

        // meta.innerHTML = `<div class="line-name">${buildLineNameHtml(line)}</div>`;
        meta.style.cursor = 'pointer';
        meta.addEventListener('click', (e) => {
            e.stopPropagation();
            modalHistory.length = 0;
            showLineDetails(line);
        });
        lineDiv.appendChild(meta);

        // 站点图
        const scrollArea = document.createElement('div');
        scrollArea.className = 'scroll-area';
        scrollArea.dataset.lineName = line;
        const diagram = document.createElement('div');
        diagram.className = 'line-diagram';

        const n = stations.length;
        for (let i = 0; i < n; i++) {
            const station = stations[i];
            const col = document.createElement('div');
            col.className = 'station-column';

            const upDiv = document.createElement('div');
            upDiv.className = 'col-up ' + (upActiveCache[i] ? 'active-dot' : 'inactive-dot');
            upDiv.style.height = rowHeight + 'px';
            upDiv.innerHTML = renderCellContent(line, station, stations, i, true, currentMin, hasActiveStation, timeMetaFontSize);
            col.appendChild(upDiv);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'col-station';
            nameDiv.textContent = station;
            nameDiv.style.fontSize = stationFontSize + 'px';
            if (!upActiveCache[i] && !downActiveCache[i]) nameDiv.style.color = '#aaa';
            col.appendChild(nameDiv);

            const downDiv = document.createElement('div');
            downDiv.className = 'col-down ' + (downActiveCache[i] ? 'active-dot' : 'inactive-dot');
            downDiv.style.height = rowHeight + 'px';
            downDiv.innerHTML = renderCellContent(line, station, stations, i, false, currentMin, hasActiveStation, timeMetaFontSize);
            col.appendChild(downDiv);

            // 站点列点击：打开该线路详情并聚焦该站
            col.addEventListener('click', (e) => {
                const area = col.closest('.scroll-area');
                // 拖拽滚动后的 click 不算点击，直接吞掉
                if (area && area.dataset.dragged === '1') return;

                e.stopPropagation();
                modalHistory.length = 0;
                showLineDetails(line, false, false, station);
            });

            diagram.appendChild(col);

            if (i < n - 1) {
                const arrowCol = document.createElement('div');
                arrowCol.className = 'arrow-column';

                const arrowUp = document.createElement('div');
                arrowUp.className = 'arrow-up';
                arrowUp.style.height = rowHeight + 'px';
                arrowUp.innerHTML = `<span class="segment-cell ${upActiveCache[i] ? 'active-segment' : 'inactive-segment'}" style="color: ${upActiveCache[i] ? color : '#b3c3d9'};">➔</span>`;
                arrowCol.appendChild(arrowUp);

                const blank = document.createElement('div');
                blank.className = 'arrow-blank';
                arrowCol.appendChild(blank);

                const arrowDown = document.createElement('div');
                arrowDown.className = 'arrow-down down-arrow';
                arrowDown.style.height = rowHeight + 'px';
                const nextDownActive = downActiveCache[i + 1];
                arrowDown.innerHTML = `<span class="segment-cell ${nextDownActive ? 'active-segment' : 'inactive-segment'}" style="color: ${nextDownActive ? color : '#b3c3d9'};">➔</span>`;
                arrowCol.appendChild(arrowDown);

                diagram.appendChild(arrowCol);
            }
        }

        scrollArea.appendChild(diagram);
        lineDiv.appendChild(scrollArea);

        wrapper.appendChild(lineDiv);
    });

    requestAnimationFrame(() => {
        document.querySelectorAll('.scroll-area').forEach(area => {
            const lineName = area.dataset.lineName;
            if (lineName && scrollPositions[lineName] !== undefined) {
                area.scrollLeft = scrollPositions[lineName];
            }
        });
        initDragScroll();
    });

    highlightActiveMode();
}

/**
 * 快速刷新：只更新线路图中随时间变化的部分（时间标签、激活状态、箭头颜色、站名颜色）。
 * 不重建 DOM 结构，适用于整分刷新、渐进式渲染的增量更新。
 */
function updateLinesTime() {
    const wrapper = document.getElementById('map-wrapper');
    if (!wrapper || !wrapper.querySelector('.line-container')) {
        // DOM 尚未建立，退回完整渲染
        return renderAllLines();
    }

    const currentMin = getCurrentMinutes();
    const { timeMetaFontSize, stationFontSize } = getFontSizes();

    wrapper.querySelectorAll('.line-container').forEach(lineDiv => {
        const line = lineDiv.dataset.line;
        const stations = LINE_STATIONS[line];
        if (!stations) return;

        const originalColor = LINE_COLORS[line] || '#888';
        const n = stations.length;

        // 一次性算出该线路的所有活动状态（复用共享函数）
        const { upActiveCache, downActiveCache, hasActiveStation } =
            computeLineActivity(line, stations, currentMin);

        const color = hasActiveStation ? originalColor : getGrayscaleColor(originalColor);

        // ---- 更新线路名卡片颜色 ----
        lineDiv.style.setProperty('--line-color', color);
        const meta = lineDiv.querySelector('.line-meta');
        if (meta) {
            meta.style.backgroundColor = color;
            meta.style.color = getContrastColor(color);
        }

        // ---- 更新每个站点列 ----
        lineDiv.querySelectorAll('.station-column').forEach((col, i) => {
            const station = stations[i];
            const upDiv = col.querySelector('.col-up');
            const downDiv = col.querySelector('.col-down');
            const nameDiv = col.querySelector('.col-station');

            if (upDiv) {
                upDiv.innerHTML = renderCellContent(
                    line, station, stations, i, true,
                    currentMin, hasActiveStation, timeMetaFontSize
                );
                upDiv.classList.toggle('active-dot', upActiveCache[i]);
                upDiv.classList.toggle('inactive-dot', !upActiveCache[i]);
            }

            if (downDiv) {
                downDiv.innerHTML = renderCellContent(
                    line, station, stations, i, false,
                    currentMin, hasActiveStation, timeMetaFontSize
                );
                downDiv.classList.toggle('active-dot', downActiveCache[i]);
                downDiv.classList.toggle('inactive-dot', !downActiveCache[i]);
            }

            if (nameDiv) {
                nameDiv.style.fontSize = stationFontSize + 'px';
                nameDiv.style.color = (upActiveCache[i] || downActiveCache[i]) ? '' : '#aaa';
            }
        });

        // ---- 更新箭头（上箭头用本站状态，下箭头用下一站状态） ----
        lineDiv.querySelectorAll('.arrow-column').forEach((arrowCol, i) => {
            const upArrow = arrowCol.querySelector('.arrow-up .segment-cell');
            const downArrow = arrowCol.querySelector('.arrow-down .segment-cell');

            if (upArrow) {
                const isActive = upActiveCache[i];
                upArrow.classList.toggle('active-segment', isActive);
                upArrow.classList.toggle('inactive-segment', !isActive);
                upArrow.style.color = isActive ? color : '#b3c3d9';
            }
            if (downArrow) {
                const isActive = downActiveCache[i + 1];
                downArrow.classList.toggle('active-segment', isActive);
                downArrow.classList.toggle('inactive-segment', !isActive);
                downArrow.style.color = isActive ? color : '#b3c3d9';
            }
        });
    });

    highlightActiveMode();
}

/**
 * 构建单个时间单元格的 HTML。
 */
function renderCellContent(line, station, stations, idx, isUp, currentMin, hasActiveStation, timeMetaFontSize) {
    const total = stations.length;

    // 非 11 号线的终点符号
    if (line !== '11号线') {
        if (isUp && idx === total - 1) return '<span class="dot-symbol">终</span>';
        if (!isUp && idx === 0) return '<span class="dot-symbol">终</span>';
    }

    const times = lineDirectionTime[line]?.[station] || (line === '11号线'
        ? {upFull: null, upTerminal: null, downFull: null, downTerminal: null}
        : {up: [], down: []});

    if (line === '11号线') {
        return buildLine11Cell(times, isUp, currentMin, timeMetaFontSize);
    }

    const dirTimes = (isUp ? times.up : times.down) || [];
    if (dirTimes.length === 0) {
        return `<span class="time-meta" style="font-size: ${timeMetaFontSize};">--:--</span>`;
    }
    if (dirTimes.length === 1) {
        return buildOneTime(dirTimes[0], currentMin, hasActiveStation, timeMetaFontSize);
    }
    // 多方向
    return dirTimes.map(t => {
        let toName = t.to;
        if (toName.includes('（') && toName.includes('）')) toName = toName.split('（')[0];
        return buildOneTime(t, currentMin, hasActiveStation, timeMetaFontSize, toName);
    }).join('');
}

function buildOneTime(time, currentMin, hasActiveStation, timeMetaFontSize, prefix) {
    const active = currentMin >= time.first && currentMin <= time.last;
    const firstStr = minutesToDisplayStr(time.first);
    const lastStr = minutesToDisplayStr(time.last);
    let displayText, metaClass = 'time-meta';
    if (active) {
        displayText = `${lastStr}`;
    } else if (currentMin < time.first) {
        displayText = `首 ${firstStr}`;
    } else if (hasActiveStation) {
        displayText = `${lastStr}`;
        metaClass += ' ended';
    } else {
        displayText = `首 ${firstStr}`;
    }
    const boldText = displayText.replace(/^(首)/, '<b>$1</b>');

    let extra = '';
    if (active) {
        const remaining = time.last - currentMin;
        if (remaining >= 0 && remaining <= 15) {
            const lightness = 70 + (remaining / 15) * 25;
            extra = `background-color: hsl(30, 80%, ${lightness}%); border-color: hsl(30, 80%, ${lightness - 10}%); color: #1f3a60;`;
        }
    }

    const displayInline = prefix ? 'display: inline-block;' : '';
    const fullText = prefix ? `${prefix} ${boldText}` : boldText;

    return `<span class="${metaClass}" style="font-size: ${timeMetaFontSize}; ${displayInline} ${extra}">${fullText}</span>`;
}

function buildLine11Cell(times, isUp, currentMin, timeMetaFontSize) {
    const full = isUp ? times.upFull : times.downFull;
    const terminal = isUp ? times.upTerminal : times.downTerminal;
    const terminalName = isUp ? '龙潭' : '赤沙';

    const fullActive = full ? (currentMin >= full.first && currentMin <= full.last) : false;
    const fullEnded = full ? (currentMin > full.last) : false;
    const fullNotStarted = full ? (currentMin < full.first) : false;
    const terminalActive = terminal ? (currentMin >= terminal.first && currentMin <= terminal.last) : false;
    const terminalEnded = terminal ? (currentMin > terminal.last) : false;
    const terminalNotStarted = terminal ? (currentMin < terminal.first) : false;

    const fragments = [];

    if (full) {
        const firstStr = minutesToDisplayStr(full.first);
        const lastStr = minutesToDisplayStr(full.last);
        let text = '', className = 'time-meta', extra = '';

        if (fullActive) {
            text = `全程 ${lastStr}`;
            const remaining = full.last - currentMin;
            if (remaining >= 0 && remaining <= 15) {
                const lightness = 70 + (remaining / 15) * 25;
                extra = `background-color: hsl(30, 80%, ${lightness}%); border-color: hsl(30, 80%, ${lightness - 10}%); color: #1f3a60;`;
            }
        } else if (fullEnded) {
            if (terminal && terminalActive) {
                text = `全程 ${lastStr}`;
                className += ' ended';
            } else {
                text = `全程 首 ${firstStr}`;
            }
        } else if (fullNotStarted) {
            text = `全程 首 ${firstStr}`;
        }

        if (text) {
            text = text.replace(/\b(首)\b/g, '<b>$1</b>');
            fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize}; ${extra}">${text}</span>`);
        }
    }

    if (terminal) {
        const firstStr = minutesToDisplayStr(terminal.first);
        const lastStr = minutesToDisplayStr(terminal.last);
        let text = '', className = 'time-meta', extra = '';

        if (terminalActive) {
            text = `${terminalName} ${lastStr}`;
            const remaining = terminal.last - currentMin;
            if (remaining >= 0 && remaining <= 15) {
                const lightness = 70 + (remaining / 15) * 25;
                extra = `background-color: hsl(30, 80%, ${lightness}%); border-color: hsl(30, 80%, ${lightness - 10}%); color: #1f3a60;`;
            }
        } else if (terminalEnded) {
            if (fullActive) {
                text = `${terminalName} ${lastStr}`;
                className += ' ended';
            } else if (fullEnded) {
                text = `${terminalName} 首 ${firstStr}`;
            } else if (fullNotStarted) {
                text = `${terminalName} ${lastStr}`;
                className += ' ended';
            }
        } else if (terminalNotStarted) {
            if (fullActive || fullNotStarted) {
                text = `${terminalName} 首 ${firstStr}`;
            } else if (fullEnded) {
                text = `${terminalName} 首 ${firstStr}`;
            }
        }

        if (text) {
            text = text.replace(/\b(首)\b/g, '<b>$1</b>');
            fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize}; ${extra}">${text}</span>`);
        }
    }

    if (fragments.length === 0) {
        return `<span class="time-meta" style="font-size: ${timeMetaFontSize};">--:--</span>`;
    }
    return fragments.join('');
}

/**
 * 请求一次渲染。同一帧内多次调用只会执行一次。
 * 已有线路 DOM 时用 updateLinesTime（增量），否则走 renderAllLines（全量）。
 */
function scheduleRender() {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(() => {
        _renderScheduled = false;
        const wrapper = document.getElementById('map-wrapper');
        if (wrapper && wrapper.querySelector('.line-container')) {
            updateLinesTime();
        } else {
            renderAllLines();
        }
    });
}