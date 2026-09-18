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

    let stationFontSize = 17;
    if (rowHeight === 65) stationFontSize = 19;
    else if (rowHeight === 55) stationFontSize = 18;
    else if (rowHeight === 45) stationFontSize = 17;
    else if (rowHeight === 35) stationFontSize = 16;
    else if (rowHeight === 25) stationFontSize = 15;

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
        let nameHtml = `<div class="line-main">${mainPart}</div>`;
        if (extraPart) {
            nameHtml += `<div class="line-extra" style="font-size: ${extraFontSize}px; line-height: 1.4;">${extraPart}</div>`;
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
                    if (fullActive) text = `全程 末 ${lastStr}`;
                    else if (fullEnded) {
                        if (upTerminal && terminalActive) { text = `全程 末 ${lastStr}`; className += ' ended'; }
                        else text = `全程 首 ${firstStr}`;
                    } else if (fullNotStarted) text = `全程 首 ${firstStr}`;
                    if (text) {
                        text = text.replace(/\b(首|末)\b/g, '<b>$1</b>');
                        fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize};">${text}</span>`);
                    }
                }
                if (upTerminal) {
                    const firstStr = minutesToDisplayStr(upTerminal.first);
                    const lastStr = minutesToDisplayStr(upTerminal.last);
                    let text, className = 'time-meta';
                    if (terminalActive) text = `龙潭 末 ${lastStr}`;
                    else if (terminalEnded) {
                        if (upFull && fullActive) { text = `龙潭 末 ${lastStr}`; className += ' ended'; }
                        else text = `龙潭 首 ${firstStr}`;
                    } else if (terminalNotStarted) text = `龙潭 首 ${firstStr}`;
                    if (text) {
                        text = text.replace(/\b(首|末)\b/g, '<b>$1</b>');
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
                    upDiv.innerHTML = `<span class="dot-symbol">●</span>`;
                } else {
                    if (upTimes.length === 1) {
                        const time = upTimes[0];
                        const active = (currentMin >= time.first && currentMin <= time.last);
                        const firstStr = minutesToDisplayStr(time.first);
                        const lastStr = minutesToDisplayStr(time.last);
                        const displayText = active ? `末 ${lastStr}` : `首 ${firstStr}`;
                        const boldText = displayText.replace(/^(首|末)/, '<b>$1</b>');
                        upDiv.innerHTML = `<span class="time-meta" style="font-size: ${timeMetaFontSize};">${boldText}</span>`;
                        if (active) {
                            const remaining = time.last - currentMin;
                            if (remaining >= 0 && remaining <= 15) {
                                const lightness = 70 + (remaining / 15) * 25;
                                const timeMeta = upDiv.querySelector('.time-meta');
                                if (timeMeta) {
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
                            const displayText = active ? `末 ${lastStr}` : `首 ${firstStr}`;
                            const boldText = displayText.replace(/^(首|末)/, '<b>$1</b>');
                            let toName = time.to;
                            if (toName.includes('（') && toName.includes('）')) {
                                toName = toName.split('（')[0];
                            }
                            const fragment = `<span class="time-meta" style="font-size: ${timeMetaFontSize}; display: inline-block;">${toName} ${boldText}</span>`;
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
                                        if (timeMeta) {
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
                    if (fullActive) text = `全程 末 ${lastStr}`;
                    else if (fullEnded) {
                        if (downTerminal && terminalActive) { text = `全程 末 ${lastStr}`; className += ' ended'; }
                        else text = `全程 首 ${firstStr}`;
                    } else if (fullNotStarted) text = `全程 首 ${firstStr}`;
                    if (text) {
                        text = text.replace(/\b(首|末)\b/g, '<b>$1</b>');
                        fragments.push(`<span class="${className}" style="font-size: ${timeMetaFontSize};">${text}</span>`);
                    }
                }
                if (downTerminal) {
                    const firstStr = minutesToDisplayStr(downTerminal.first);
                    const lastStr = minutesToDisplayStr(downTerminal.last);
                    let text, className = 'time-meta';
                    if (terminalActive) text = `赤沙 末 ${lastStr}`;
                    else if (terminalEnded) {
                        if (fullActive) { text = `赤沙 末 ${lastStr}`; className += ' ended'; }
                        else if (fullEnded) text = `赤沙 首 ${firstStr}`;
                        else if (fullNotStarted) { text = `赤沙 末 ${lastStr}`; className += ' ended'; }
                    } else if (terminalNotStarted) {
                        if (fullActive || fullNotStarted) text = `赤沙 首 ${firstStr}`;
                        else if (fullEnded) text = `赤沙 首 ${firstStr}`;
                    }
                    if (text) {
                        text = text.replace(/\b(首|末)\b/g, '<b>$1</b>');
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
                    downDiv.innerHTML = `<span class="dot-symbol">●</span>`;
                } else {
                    if (downTimes.length === 1) {
                        const time = downTimes[0];
                        const active = (currentMin >= time.first && currentMin <= time.last);
                        const firstStr = minutesToDisplayStr(time.first);
                        const lastStr = minutesToDisplayStr(time.last);
                        const displayText = active ? `末 ${lastStr}` : `首 ${firstStr}`;
                        const boldText = displayText.replace(/^(首|末)/, '<b>$1</b>');
                        downDiv.innerHTML = `<span class="time-meta" style="font-size: ${timeMetaFontSize};">${boldText}</span>`;
                        if (active) {
                            const remaining = time.last - currentMin;
                            if (remaining >= 0 && remaining <= 15) {
                                const lightness = 70 + (remaining / 15) * 25;
                                const timeMeta = downDiv.querySelector('.time-meta');
                                if (timeMeta) {
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
                            const displayText = active ? `末 ${lastStr}` : `首 ${firstStr}`;
                            const boldText = displayText.replace(/^(首|末)/, '<b>$1</b>');
                            let toName = time.to;
                            if (toName.includes('（') && toName.includes('）')) {
                                toName = toName.split('（')[0];
                            }
                            const fragment = `<span class="time-meta" style="font-size: ${timeMetaFontSize}; display: inline-block;">${toName} ${boldText}</span>`;
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
                                        if (timeMeta) {
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
            note.innerHTML = '在一日较晚时候，<em>海傍~珠江新城</em>无直达<u>机场北</u>的列车时，可乘坐<u>天河客运站</u>方向的列车，并在<u>体育西路</u>换乘<u>机场北</u>方向的列车';
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