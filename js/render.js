function renderAllLines() {
    console.log('[渲染] 开始 renderAllLines');
    console.log('[渲染] LINE_STATIONS 线路数量：', Object.keys(LINE_STATIONS).length);
    console.log('[渲染] selectedLines 大小：', selectedLines.size);
    const currentMin = getCurrentMinutes();
    console.log('[渲染] 当前时间分钟：', currentMin);

    let timeMetaFontSize = '12px';
    if (rowHeight === 65) timeMetaFontSize = '14px';
    else if (rowHeight === 55) timeMetaFontSize = '13px';

    const lines = Object.entries(LINE_STATIONS).filter(([line]) => LINE_COLORS[line]);
    console.log('[渲染] 待渲染线路数（有颜色且选中）：', lines.length);

    const scrollAreas = document.querySelectorAll('.scroll-area');
    scrollAreas.forEach((area) => {
        const lineName = area.dataset.lineName;
        if (lineName) scrollPositions[lineName] = area.scrollLeft;
    });

    const wrapper = document.getElementById('map-wrapper');
    wrapper.innerHTML = '';

    let stationFontSize = 16;
    if (rowHeight === 65) stationFontSize = 18;
    else if (rowHeight === 55) stationFontSize = 17;
    else if (rowHeight === 45) stationFontSize = 16;
    else if (rowHeight === 35) stationFontSize = 15;
    else if (rowHeight === 25) stationFontSize = 14;

    lines.forEach(([line, stations]) => {
        if (!selectedLines.has(line)) return;

        const originalColor = LINE_COLORS[line] || '#888';

        let hasActiveStation = false;
        for (let i = 0; i < stations.length; i++) {
            const st = stations[i];
            if (line === '11号线') {
                const data = lineDirectionTime[line]?.[st] || {};
                const upFullActive = data.upFull ? (currentMin >= data.upFull.first && currentMin <= data.upFull.last) : false;
                const upTerminalActive = data.upTerminal ? (currentMin >= data.upTerminal.first && currentMin <= data.upTerminal.last) : false;
                const downFullActive = data.downFull ? (currentMin >= data.downFull.first && currentMin <= data.downFull.last) : false;
                const downTerminalActive = data.downTerminal ? (currentMin >= data.downTerminal.first && currentMin <= data.downTerminal.last) : false;
                if (upFullActive || upTerminalActive || downFullActive || downTerminalActive) {
                    hasActiveStation = true;
                    break;
                }
            } else {
                const upTimes = lineDirectionTime[line]?.[st]?.up || [];
                const downTimes = lineDirectionTime[line]?.[st]?.down || [];
                const upActive = upTimes.some(t => currentMin >= t.first && currentMin <= t.last);
                const downActive = downTimes.some(t => currentMin >= t.first && currentMin <= t.last);
                if (upActive || downActive) {
                    hasActiveStation = true;
                    break;
                }
            }
        }

        const color = hasActiveStation ? originalColor : getGrayscaleColor(originalColor);

        const lineDiv = document.createElement('div');
        lineDiv.className = 'line-container';
        lineDiv.dataset.line = line;

        const meta = document.createElement('div');
        meta.className = 'line-meta';
        meta.style.backgroundColor = color;
        meta.style.color = getContrastColor(color);

        let mainPart = line;
        let extraPart = '';
        const lineIndex = line.lastIndexOf('线');
        if (lineIndex !== -1 && lineIndex < line.length - 1) {
            mainPart = line.substring(0, lineIndex + 1);
            extraPart = line.substring(lineIndex + 1);
        }

        const extraFontSize = getExtraFontSize(extraPart);
        let nameHtml = '';
        const numMatch = mainPart.match(/^(\d+)(.*)/);
        if (numMatch) {
            // 如果有数字（如10号线），将数字拆出，横向显示；汉字部分（如号线）竖向显示
            nameHtml = `<div class="line-num" style="writing-mode: horizontal-tb; font-size: 18px; letter-spacing: 1px;">${numMatch[1]}</div>
                <div class="line-str" style="writing-mode: vertical-lr; text-orientation: upright; font-size: 18px; letter-spacing: 2px; margin-top: 2px;">${numMatch[2]}</div>`;
        } else {
            // 纯汉字线路
            nameHtml = `<div class="line-main" style="writing-mode: vertical-lr; text-orientation: upright; font-size: 18px; letter-spacing: 2px;">${mainPart}</div>`;
        }
        if (extraPart) {
            let extraHtml = extraPart;
            let extraCls = "line-extra";
            // 如果是括号或多字附加词，去掉括号或者使用专门样式
            if (extraPart.includes('（') || extraPart.includes('(')) {
                extraHtml = extraPart.replace(/[（(]|[)）]/g, ''); // 去掉括号，只保留“知识城”
                extraCls += " extra-long"; // 添加额外类名
            }
            nameHtml += `<div class="${extraCls}" style="font-size: ${extraFontSize}px; line-height: 1.4; writing-mode: vertical-lr; text-orientation: upright;">${extraHtml}</div>`;
        }
        meta.innerHTML = `<div class="line-name">${nameHtml}</div>`;
        // 新增：点击线路名牌弹出详情
        meta.style.cursor = 'pointer';
        meta.addEventListener('click', (e) => {
            e.stopPropagation();
            showLineDetails(line);
        });
        lineDiv.appendChild(meta);

        const scrollArea = document.createElement('div');
        scrollArea.className = 'scroll-area';
        scrollArea.dataset.lineName = line;
        const diagram = document.createElement('div');
        diagram.className = 'line-diagram';

        const n = stations.length;

        const upActiveCache = [];
        const downActiveCache = [];
        if (line === '11号线') {
            for (let i = 0; i < n; i++) {
                const st = stations[i];
                const data = lineDirectionTime[line]?.[st] || {};
                upActiveCache[i] = (data.upFull ? (currentMin >= data.upFull.first && currentMin <= data.upFull.last) : false) ||
                    (data.upTerminal ? (currentMin >= data.upTerminal.first && currentMin <= data.upTerminal.last) : false);
                downActiveCache[i] = (data.downFull ? (currentMin >= data.downFull.first && currentMin <= data.downFull.last) : false) ||
                    (data.downTerminal ? (currentMin >= data.downTerminal.first && currentMin <= data.downTerminal.last) : false);
            }
        } else {
            for (let i = 0; i < n; i++) {
                const st = stations[i];
                const upTimes = lineDirectionTime[line]?.[st]?.up || [];
                const downTimes = lineDirectionTime[line]?.[st]?.down || [];
                upActiveCache[i] = upTimes.some(t => currentMin >= t.first && currentMin <= t.last);
                downActiveCache[i] = downTimes.some(t => currentMin >= t.first && currentMin <= t.last);
            }
        }

        for (let i = 0; i < n; i++) {
            const station = stations[i];

            const col = document.createElement('div');
            col.className = 'station-column';

            // 上行单元格
            const upDiv = document.createElement('div');
            upDiv.className = 'col-up';
            upDiv.style.height = rowHeight + 'px';

            if (line === '11号线') {
                const data = lineDirectionTime[line]?.[station] || {};
                const upFull = data.upFull;
                const upTerminal = data.upTerminal;
                const fullActive = upFull ? (currentMin >= upFull.first && currentMin <= upFull.last) : false;
                const fullEnded = upFull ? (currentMin > upFull.last) : false;
                const fullNotStarted = upFull ? (currentMin < upFull.first) : false;
                const terminalActive = upTerminal ? (currentMin >= upTerminal.first && currentMin <= upTerminal.last) : false;
                const terminalEnded = upTerminal ? (currentMin > upTerminal.last) : false;
                const terminalNotStarted = upTerminal ? (currentMin < upTerminal.first) : false;
                const fragments = [];
                if (upFull) {
                    const firstStr = minutesToDisplayStr(upFull.first);
                    const lastStr = minutesToDisplayStr(upFull.last);
                    let text, className = 'time-meta';
                    if (fullActive) text = `全程 ${lastStr}`;
                    else if (fullEnded) {
                        if (upTerminal && terminalActive) { text = `全程 ${lastStr}`; className += ' ended'; }
                        else text = `全程 首 ${firstStr}`;
                    } else if (fullNotStarted) text = `全程 首 ${firstStr}`;
                    if (text) {
                        text = text.replace(/\b(首)\b/g, '<b>$1</b>');
                        fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize};">${text}</span>`);
                    }
                }
                if (upTerminal) {
                    const firstStr = minutesToDisplayStr(upTerminal.first);
                    const lastStr = minutesToDisplayStr(upTerminal.last);
                    let text, className = 'time-meta';
                    if (terminalActive) text = `龙潭 ${lastStr}`;
                    else if (terminalEnded) {
                        if (upFull && fullActive) { text = `龙潭 ${lastStr}`; className += ' ended'; }
                        else text = `龙潭 首 ${firstStr}`;
                    } else if (terminalNotStarted) text = `龙潭 首 ${firstStr}`;
                    if (text) {
                        text = text.replace(/\b(首)\b/g, '<b>$1</b>');
                        fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize};">${text}</span>`);
                    }
                }
                if (fragments.length === 0) fragments.push(`<span class="time-meta" style="font-size: ${timeMetaFontSize};">--:--</span>`);
                upDiv.innerHTML = fragments.join('');
                if (upFull && fullActive) {
                    const remaining = upFull.last - currentMin;
                    if (remaining >= 0 && remaining <= 15) {
                        const lightness = 70 + (remaining / 15) * 25;
                        const timeMeta = upDiv.querySelectorAll('.time-meta')[0];
                        if (timeMeta && !timeMeta.classList.contains('ended')) {
                            timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                            timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                            timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                        }
                    }
                }
                if (upTerminal && terminalActive) {
                    const remaining = upTerminal.last - currentMin;
                    if (remaining >= 0 && remaining <= 15) {
                        const lightness = 70 + (remaining / 15) * 25;
                        const timeMeta = upDiv.querySelectorAll('.time-meta')[upFull ? 1 : 0];
                        if (timeMeta && !timeMeta.classList.contains('ended')) {
                            timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                            timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                            timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                        }
                    }
                }
                upDiv.classList.add(upActiveCache[i] ? 'active-dot' : 'inactive-dot');
            } else {
                // 非11号线：多终点支持
                const upTimes = lineDirectionTime[line]?.[station]?.up || [];
                const upActive = upActiveCache[i];
                upDiv.classList.add(upActive ? 'active-dot' : 'inactive-dot');

                if (i === n - 1) {
                    upDiv.innerHTML = `<span class="dot-symbol">终</span>`;
                } else {
                    if (upTimes.length === 1) {
                        const time = upTimes[0];
                        const active = (currentMin >= time.first && currentMin <= time.last);
                        const firstStr = minutesToDisplayStr(time.first);
                        const lastStr = minutesToDisplayStr(time.last);
                        let displayText, metaClass = 'time-meta';
                        if (active) {
                            displayText = `${lastStr}`;
                        } else if (currentMin < time.first) {
                            // 早上还没开始运营：显示首班车
                            displayText = `首 ${firstStr}`;
                        } else if (hasActiveStation) {
                            displayText = `${lastStr}`;
                            metaClass += ' ended';
                        } else {
                            displayText = `首 ${firstStr}`;
                        }
                        const boldText = displayText.replace(/^(首)/, '<b>$1</b>');
                        upDiv.innerHTML = `<span class="${metaClass}" style="font-size: ${timeMetaFontSize};">${boldText}</span>`;
                        if (active) {
                            const remaining = time.last - currentMin;
                            if (remaining >= 0 && remaining <= 15) {
                                const lightness = 70 + (remaining / 15) * 25;
                                const timeMeta = upDiv.querySelector('.time-meta');
                                if (timeMeta && !timeMeta.classList.contains('ended')) {
                                    timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                                    timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                                    timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                                }
                            }
                        }
                    } else if (upTimes.length > 1) {
                        const fragments = [];
                        upTimes.forEach((time, idx) => {
                            const active = (currentMin >= time.first && currentMin <= time.last);
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
                            let toName = time.to;
                            if (toName.includes('（') && toName.includes('）')) {
                                toName = toName.split('（')[0];
                            }
                            const fragment = `<span class="${metaClass}" style="font-size: ${timeMetaFontSize}; display: inline-block;">${toName} ${boldText}</span>`;
                            fragments.push(fragment);
                        });
                        upDiv.innerHTML = fragments.join('');
                        if (upActive) {
                            upTimes.forEach((time, idx) => {
                                const active = (currentMin >= time.first && currentMin <= time.last);
                                if (active) {
                                    const remaining = time.last - currentMin;
                                    if (remaining >= 0 && remaining <= 15) {
                                        const lightness = 70 + (remaining / 15) * 25;
                                        const timeMeta = upDiv.querySelectorAll('.time-meta')[idx];
                                        if (timeMeta && !timeMeta.classList.contains('ended')) {
                                            timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                                            timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                                            timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                                        }
                                    }
                                }
                            });
                        }
                    } else {
                        upDiv.innerHTML = `<span class="time-meta" style="font-size: ${timeMetaFontSize};">--:--</span>`;
                    }
                }
            }
            col.appendChild(upDiv);

            // 站名单元格
            const nameDiv = document.createElement('div');
            nameDiv.className = 'col-station';
            nameDiv.textContent = station;
            nameDiv.style.fontSize = stationFontSize + 'px';
            if (line === '11号线') {
                if (!upActiveCache[i] && !downActiveCache[i]) nameDiv.style.color = '#aaa';
            } else {
                if (!upActiveCache[i] && !downActiveCache[i]) nameDiv.style.color = '#aaa';
            }
            col.appendChild(nameDiv);

            // 下行单元格
            const downDiv = document.createElement('div');
            downDiv.className = 'col-down';
            downDiv.style.height = rowHeight + 'px';

            if (line === '11号线') {
                const data = lineDirectionTime[line]?.[station] || {};
                const downFull = data.downFull;
                const downTerminal = data.downTerminal;
                const fullActive = downFull ? (currentMin >= downFull.first && currentMin <= downFull.last) : false;
                const fullEnded = downFull ? (currentMin > downFull.last) : false;
                const fullNotStarted = downFull ? (currentMin < downFull.first) : false;
                const terminalActive = downTerminal ? (currentMin >= downTerminal.first && currentMin <= downTerminal.last) : false;
                const terminalEnded = downTerminal ? (currentMin > downTerminal.last) : false;
                const terminalNotStarted = downTerminal ? (currentMin < downTerminal.first) : false;
                const fragments = [];
                if (downFull) {
                    const firstStr = minutesToDisplayStr(downFull.first);
                    const lastStr = minutesToDisplayStr(downFull.last);
                    let text, className = 'time-meta';
                    if (fullActive) text = `全程 ${lastStr}`;
                    else if (fullEnded) {
                        if (downTerminal && terminalActive) { text = `全程 ${lastStr}`; className += ' ended'; }
                        else text = `全程 首 ${firstStr}`;
                    } else if (fullNotStarted) text = `全程 首 ${firstStr}`;
                    if (text) {
                        text = text.replace(/\b(首)\b/g, '<b>$1</b>');
                        fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize};">${text}</span>`);
                    }
                }
                if (downTerminal) {
                    const firstStr = minutesToDisplayStr(downTerminal.first);
                    const lastStr = minutesToDisplayStr(downTerminal.last);
                    let text, className = 'time-meta';
                    if (terminalActive) text = `赤沙 ${lastStr}`;
                    else if (terminalEnded) {
                        if (fullActive) { text = `赤沙 ${lastStr}`; className += ' ended'; }
                        else if (fullEnded) text = `赤沙 首 ${firstStr}`;
                        else if (fullNotStarted) { text = `赤沙 ${lastStr}`; className += ' ended'; }
                    } else if (terminalNotStarted) {
                        if (fullActive || fullNotStarted) text = `赤沙 首 ${firstStr}`;
                        else if (fullEnded) text = `赤沙 首 ${firstStr}`;
                    }
                    if (text) {
                        text = text.replace(/\b(首)\b/g, '<b>$1</b>');
                        fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize};">${text}</span>`);
                    }
                }
                if (fragments.length === 0) fragments.push(`<span class="time-meta" style="font-size: ${timeMetaFontSize};">--:--</span>`);
                downDiv.innerHTML = fragments.join('');
                if (downFull && fullActive) {
                    const remaining = downFull.last - currentMin;
                    if (remaining >= 0 && remaining <= 15) {
                        const lightness = 70 + (remaining / 15) * 25;
                        const timeMeta = downDiv.querySelectorAll('.time-meta')[0];
                        if (timeMeta && !timeMeta.classList.contains('ended')) {
                            timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                            timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                            timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                        }
                    }
                }
                if (downTerminal && terminalActive) {
                    const remaining = downTerminal.last - currentMin;
                    if (remaining >= 0 && remaining <= 15) {
                        const lightness = 70 + (remaining / 15) * 25;
                        const timeMeta = downDiv.querySelectorAll('.time-meta')[1];
                        if (timeMeta && !timeMeta.classList.contains('ended')) {
                            timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                            timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                            timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                        }
                    }
                }
                downDiv.classList.add(downActiveCache[i] ? 'active-dot' : 'inactive-dot');
            } else {
                // 非11号线：多终点支持（下行）
                const downTimes = lineDirectionTime[line]?.[station]?.down || [];
                const downActive = downActiveCache[i];
                downDiv.classList.add(downActive ? 'active-dot' : 'inactive-dot');

                if (i === 0) {
                    downDiv.innerHTML = `<span class="dot-symbol">终</span>`;
                } else {
                    if (downTimes.length === 1) {
                        const time = downTimes[0];
                        const active = (currentMin >= time.first && currentMin <= time.last);
                        const firstStr = minutesToDisplayStr(time.first);
                        const lastStr = minutesToDisplayStr(time.last);
                        let displayText, metaClass = 'time-meta';
                        if (active) {
                            displayText = `${lastStr}`;
                        } else if (currentMin < time.first) {
                            // 早上还没开始运营：显示首班车
                            displayText = `首 ${firstStr}`;
                        } else if (hasActiveStation) {
                            displayText = `${lastStr}`;
                            metaClass += ' ended';
                        } else {
                            displayText = `首 ${firstStr}`;
                        }
                        const boldText = displayText.replace(/^(首)/, '<b>$1</b>');
                        downDiv.innerHTML = `<span class="${metaClass}" style="font-size: ${timeMetaFontSize};">${boldText}</span>`;
                        if (active) {
                            const remaining = time.last - currentMin;
                            if (remaining >= 0 && remaining <= 15) {
                                const lightness = 70 + (remaining / 15) * 25;
                                const timeMeta = downDiv.querySelector('.time-meta');
                                if (timeMeta && !timeMeta.classList.contains('ended')) {
                                    timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                                    timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                                    timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                                }
                            }
                        }
                    } else if (downTimes.length > 1) {
                        const fragments = [];
                        downTimes.forEach((time, idx) => {
                            const active = (currentMin >= time.first && currentMin <= time.last);
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
                            let toName = time.to;
                            if (toName.includes('（') && toName.includes('）')) {
                                toName = toName.split('（')[0];
                            }
                            const fragment = `<span class="${metaClass}" style="font-size: ${timeMetaFontSize}; display: inline-block;">${toName} ${boldText}</span>`;
                            fragments.push(fragment);
                        });
                        downDiv.innerHTML = fragments.join('');
                        if (downActive) {
                            downTimes.forEach((time, idx) => {
                                const active = (currentMin >= time.first && currentMin <= time.last);
                                if (active) {
                                    const remaining = time.last - currentMin;
                                    if (remaining >= 0 && remaining <= 15) {
                                        const lightness = 70 + (remaining / 15) * 25;
                                        const timeMeta = downDiv.querySelectorAll('.time-meta')[idx];
                                        if (timeMeta && !timeMeta.classList.contains('ended')) {
                                            timeMeta.style.backgroundColor = `hsl(30, 80%, ${lightness}%)`;
                                            timeMeta.style.borderColor = `hsl(30, 80%, ${lightness - 10}%)`;
                                            timeMeta.style.color = lightness < 65 ? 'white' : '#1f3a60';
                                        }
                                    }
                                }
                            });
                        }
                    } else {
                        downDiv.innerHTML = `<span class="time-meta" style="font-size: ${timeMetaFontSize};">--:--</span>`;
                    }
                }
            }
            col.appendChild(downDiv);

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

        if (line === "3号线") {
            const note = document.createElement('div');
            note.className = 'line-note';
            note.style.cursor = 'pointer';
            // 将长文本替换为“乘坐提示”
            note.innerHTML = '乘<br>坐<br>提<br>示';

            // 点击事件弹出长文本（复用之前的弹窗逻辑）
            note.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof ensureModal === 'function') {
                    ensureModal();

                    // 1. 停止所有定时器（防止后台刷新干扰）
                    if (typeof stopModalTimers === 'function') {
                        stopModalTimers();
                    }

                    // 2. 设置抬头颜色为 3 号线主题色
                    const modalHeader = document.querySelector('.modal-header');
                    const lineColor = LINE_COLORS['3号线'] || '#eca154';
                    modalHeader.style.background = lineColor;
                    modalHeader.style.borderBottomColor = lineColor;
                    const h3El = modalHeader.querySelector('h3');
                    if (h3El) {
                        h3El.textContent = '3号线乘坐提示';
                        h3El.style.color = getContrastColor(lineColor);
                    }

                    // 3. 注入提示内容
                    const modalContent = document.querySelector('.modal-content');
                    if (modalContent) {
                        modalContent.innerHTML = `<div style="padding: 20px; font-size: 16px; line-height: 1.8; color: #333;">
                            在一日较晚时候，<b>海傍~珠江新城</b>无直达<b>机场北</b>的列车时，可乘坐<b>天河客运站</b>方向的列车，并在<b>体育西路</b>换乘<b>机场北</b>方向的列车。
                        </div>`;
                    }

                    // 4. 隐藏倒计时进度条和刷新按钮
                    const refreshBar = document.querySelector('.modal-refresh-bar');
                    if (refreshBar) {
                        refreshBar.classList.remove('animating');
                        refreshBar.style.display = 'none';
                    }
                    const refreshBtn = document.querySelector('.v-refresh-btn');
                    if (refreshBtn) {
                        refreshBtn.style.display = 'none';
                    }

                    // 5. 显示弹窗
                    document.querySelector('.modal-overlay').style.display = 'flex';
                }
            });

            lineDiv.appendChild(note);
        }

        wrapper.appendChild(lineDiv);
    });

    requestAnimationFrame(() => {
        const newScrollAreas = document.querySelectorAll('.scroll-area');
        newScrollAreas.forEach(area => {
            const lineName = area.dataset.lineName;
            if (lineName && scrollPositions[lineName] !== undefined) {
                area.scrollLeft = scrollPositions[lineName];
            }
        });
        initDragScroll();
    });

    highlightActiveMode();
}