let topoAutoRefreshTimer = null;
let hideTopoText = false;
let hideTopoNode = false;

const TOPO_FILES = [
    '1号线', '2号线', '3号线', '3号线北', '4号线', '5号线', '6号线', '7号线', '8号线', '9号线', '10号线', '11号线', '12号线东', '12号线西', '13号线', '14号线(知识城)', '14号线', '18号线', '21号线', '22号线', '佛山2号线', '佛山3号线', '南海有轨1号线', '广佛线', '海珠有轨1号线', '黄埔有轨1号线', '黄埔有轨2号线', 'APM'
];

function cleanGeoName(name, isTram = false) {
    if (!name) return '';
    let n = name.trim();

    // 1. 半角括号转全角
    n = n.replace(/\(/g, '（').replace(/\)/g, '）');

    // 2. 仅去除明确多余的括号后缀
    n = n.replace(/（\d号线）/g, '');
    n = n.replace(/（有轨）/g, '');

    // 机场特殊处理
    if (n === '机场北（2号航站楼）') return '机场北（T2）';
    if (n === '机场南（1号航站楼）') return '机场南';

    // 3. 特殊名称映射
    if (isTram) {
        // 有轨电车侧别名
        const TRAM_ALIAS = {
            '广州塔站': '广州塔（有轨）',
            '万胜围': '万胜围（有轨）',
            '地铁长平站': '地铁长平',
            '水西': '水西（有轨）',
            '礌岗': '虫雷 岗（有轨）',
            '林岳东': '林岳东（有轨）'
        };
        if (TRAM_ALIAS[n]) n = TRAM_ALIAS[n];
    } else {
        // 地铁侧别名
        const METRO_ALIAS = {
            '庆盛': '庆盛（南沙北站）',
            '清布': '清㘵',
            '礌岗': '虫雷 岗'
        };
        if (METRO_ALIAS[n]) n = METRO_ALIAS[n];
    }

    return n;
}

let topoData = [];
let topoBounds = {minLng: 999, maxLng: -999, minLat: 999, maxLat: -999};
let topoTransform = {x: 0, y: 0, scale: 1};
let topoViewInitialized = false;
let topoStationCount = {};

let topoRefreshTimer = null;

function initTopoUI() {
    const btn = document.getElementById('topo-btn');
    const overlay = document.getElementById('topo-overlay');
    const closeBtn = document.getElementById('topo-close-btn');
    const refreshBtn = document.getElementById('topo-refresh-btn');
    const svg = document.getElementById('topo-svg');
    const wrap = document.getElementById('topo-canvas-wrap');

    if (!btn || !overlay) return;

    btn.addEventListener('click', async () => {
        overlay.style.display = 'flex';

        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(0.98)';
        overlay.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.style.transform = 'scale(1)';
        });

        if (topoData.length === 0) {
            const h3 = overlay.querySelector('h3');
            if (h3) h3.textContent = '正在加载线网数据...';
            await loadTopoData();
            calculateBounds();
            setupTopoInteract(svg, wrap);
            if (h3) h3.textContent = '广州地铁线网图';
        }

        updateTopoTimeDisplay();
        renderTopo(svg);

        // 启动系统时间刷新计时器
        if (topoRefreshTimer) clearInterval(topoRefreshTimer);
        if (typeof currentCustomTime !== 'undefined' && currentCustomTime === null) {
            topoRefreshTimer = setInterval(() => {
                updateTopoTimeDisplay();
                renderTopo(svg);
            }, 30000);
        }
    });

    closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (topoRefreshTimer) {
            clearInterval(topoRefreshTimer);
            topoRefreshTimer = null;
        }
    });

    refreshBtn.addEventListener('click', () => {
        updateTopoTimeDisplay();
        renderTopo(svg);
    });

    document.getElementById('topo-hide-text').addEventListener('change', () => {
        applyTopoTransform();
    });

    document.getElementById('topo-hide-node').addEventListener('change', () => {
        applyTopoTransform();
    });
}

function updateTopoTimeDisplay() {
    const timeDisplay = document.getElementById('topo-time-display');
    if (!timeDisplay) return;

    const min = getCurrentMinutes();
    const mm = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(mm / 60);
    const m = mm % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    if (typeof currentCustomTime !== 'undefined' && currentCustomTime !== null) {
        timeDisplay.textContent = `自定义时间 ${timeStr}`;
    } else {
        timeDisplay.textContent = `当前时间 ${timeStr}`;
    }
}

async function loadTopoData() {
    const promises = TOPO_FILES.map(async (line) => {
        try {
            const res = await fetch(`./data/polyline/${line}.geojson`);
            if (!res.ok) throw new Error('Not found');
            return {line, data: await res.json()};
        } catch (e) {
            return null;
        }
    });
    const results = await Promise.all(promises);
    topoData = results.filter(r => r !== null);
}

function calculateBounds() {
    topoBounds = {minLng: 999, maxLng: -999, minLat: 999, maxLat: -999};
    topoStationCount = {};

    topoData.forEach(item => {
        const isTram = item.line.includes('有轨');
        const features = item.data.features || [];
        features.forEach(f => {
            if (f.geometry.type === 'Point') {
                const [lng, lat] = f.geometry.coordinates;
                if (lng < topoBounds.minLng) topoBounds.minLng = lng;
                if (lng > topoBounds.maxLng) topoBounds.maxLng = lng;
                if (lat < topoBounds.minLat) topoBounds.minLat = lat;
                if (lat > topoBounds.maxLat) topoBounds.maxLat = lat;

                let name = f.properties.name || '';
                // 使用清洗函数
                name = cleanGeoName(name, isTram);

                if (name) {
                    topoStationCount[name] = (topoStationCount[name] || 0) + 1;
                }
            }
        });
    });

    topoBounds.minLng -= 0.05;
    topoBounds.maxLng += 0.05;
    topoBounds.minLat -= 0.05;
    topoBounds.maxLat += 0.05;
}

function project(lng, lat) {
    const x = (lng - topoBounds.minLng) / (topoBounds.maxLng - topoBounds.minLng) * 2000;
    const y = (topoBounds.maxLat - lat) / (topoBounds.maxLat - topoBounds.minLat) * 2000;
    return [x, y];
}

function getCircleHtml(colors, isTransfer) {
    const uniqueColors = [...new Set(colors)];
    if (!isTransfer) {
        return `<circle cx="0" cy="0" r="4.5" fill="${uniqueColors[0]}" stroke="#ffffff" stroke-width="1.5"/>`;
    }
    if (uniqueColors.length === 1) {
        return `<circle cx="0" cy="0" r="7" fill="#ffffff" stroke="${uniqueColors[0]}" stroke-width="3.5"/>`;
    }
    const n = uniqueColors.length;
    if (n === 2) {
        return `
            <circle cx="0" cy="0" r="8" fill="#ffffff" />
            <path d="M -8 0 A 8 8 0 0 1 8 0 Z" fill="${uniqueColors[0]}" />
            <path d="M 8 0 A 8 8 0 0 1 -8 0 Z" fill="${uniqueColors[1]}" />
            <circle cx="0" cy="0" r="8" fill="none" stroke="#ffffff" stroke-width="2.5" />
        `;
    }
    let html = `<circle cx="0" cy="0" r="8" fill="#ffffff" />`;
    const angleStep = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
        const startAngle = i * angleStep - Math.PI / 2;
        const endAngle = (i + 1) * angleStep - Math.PI / 2;
        const x1 = 8 * Math.cos(startAngle);
        const y1 = 8 * Math.sin(startAngle);
        const x2 = 8 * Math.cos(endAngle);
        const y2 = 8 * Math.sin(endAngle);
        html += `<path d="M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 8 8 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${uniqueColors[i]}" />`;
    }
    html += `<circle cx="0" cy="0" r="8" fill="none" stroke="#ffffff" stroke-width="2.5" />`;
    return html;
}

function isOverlap(rect1, rect2, padding = 2) {
    return !(rect1.x + rect1.w + padding < rect2.x ||
        rect1.x > rect2.x + rect2.w + padding ||
        rect1.y + rect1.h + padding < rect2.y ||
        rect1.y > rect2.y + rect2.h + padding);
}

function renderTopo(svg) {
    svg.innerHTML = '';
    const gMap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gMap.setAttribute('id', 'topo-map-layer');

    const gLabel = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gLabel.setAttribute('id', 'topo-label-layer');

    let pathHtml = '';
    let pointHtml = '';
    let labelHtml = '';
    let stationDict = {};
    let lineCoordsMap = {};
    let stationCoordsMap = {};

    const mustShowStations = new Set();

    const currentMin = getCurrentMinutes();

    topoData.forEach(item => {
        const lineName = item.line;
        const isTram = lineName.includes('有轨');
        const isSpecial = isTram || lineName === 'APM';
        const features = item.data.features || [];
        const color = HARDCODED_COLORS[lineName] || '#888888';

        let lineCoords = null;

        features.forEach(f => {
            if (f.geometry.type === 'LineString') {
                lineCoords = f.geometry.coordinates;
            } else if (f.geometry.type === 'Point') {
                const [lng, lat] = f.geometry.coordinates;
                let rawName = f.properties.name || '';
                let stdName = cleanGeoName(rawName, isTram);

                stationCoordsMap[rawName] = [lng, lat];
                stationCoordsMap[stdName] = [lng, lat];

                if (!stationDict[stdName]) {
                    stationDict[stdName] = {
                        x: 0,
                        y: 0,
                        colors: [],
                        displayName: stdName,
                        hasSpecialLine: false,
                        hasNormalLine: false,
                        hasCoord: false,
                        lines: [],
                        lineColors: {}
                    };
                }

                if (!stationDict[stdName].hasCoord) {
                    const [x, y] = project(lng, lat);
                    stationDict[stdName].x = x;
                    stationDict[stdName].y = y;
                    stationDict[stdName].hasCoord = true;
                }

                if (!stationDict[stdName].colors.includes(color)) {
                    stationDict[stdName].colors.push(color);
                }

                if (!stationDict[stdName].lines.includes(lineName)) {
                    stationDict[stdName].lines.push(lineName);
                }

                // 记录每条线路对应的颜色
                stationDict[stdName].lineColors[lineName] = color;

                if (isSpecial) {
                    stationDict[stdName].hasSpecialLine = true;
                } else {
                    stationDict[stdName].hasNormalLine = true;
                }
            }
        });

        if (lineCoords) lineCoordsMap[lineName] = lineCoords;
    });

    topoData.forEach(item => {
        const lineName = item.line;
        const isSpecialLine = lineName.includes('有轨') || lineName === 'APM';
        const color = HARDCODED_COLORS[lineName] || '#888888';
        const lineCoords = lineCoordsMap[lineName];
        if (!lineCoords) return;

        const stations = LINE_STATIONS[lineName] || [];
        let isFallback = false;

        if (stations.length === 0) {
            isFallback = true;
        } else {
            for (let i = 0; i < stations.length - 1; i++) {
                let stA = stations[i];
                let stB = stations[i + 1];
                let cA = stationCoordsMap[stA];
                let cB = stationCoordsMap[stB];
                if (!cA || !cB) {
                    isFallback = true;
                    break;
                }
            }
        }

        if (isFallback) {
            let pathParts = lineCoords.map(([lng, lat]) => {
                const [x, y] = project(lng, lat);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            pathHtml += `<polyline class="topo-line" data-special-line="${isSpecialLine}" points="${pathParts.join(' ')}" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
            return;
        }

        for (let i = 0; i < stations.length - 1; i++) {
            let stA = stations[i];
            let stB = stations[i + 1];

            let cA = stationCoordsMap[stA];
            let cB = stationCoordsMap[stB];
            if (!cA || !cB) continue;

            // 找出所有距离最小的候选点（环线首尾坐标相同，如11号线赤沙会出现两次）
            let minDistA = Infinity, minDistB = Infinity;
            const distsA = new Array(lineCoords.length);
            const distsB = new Array(lineCoords.length);
            for (let j = 0; j < lineCoords.length; j++) {
                distsA[j] = Math.pow(lineCoords[j][0] - cA[0], 2) + Math.pow(lineCoords[j][1] - cA[1], 2);
                distsB[j] = Math.pow(lineCoords[j][0] - cB[0], 2) + Math.pow(lineCoords[j][1] - cB[1], 2);
                if (distsA[j] < minDistA) minDistA = distsA[j];
                if (distsB[j] < minDistB) minDistB = distsB[j];
            }
            const candA = [], candB = [];
            for (let j = 0; j < lineCoords.length; j++) {
                if (distsA[j] <= minDistA + 1e-12) candA.push(j);
                if (distsB[j] <= minDistB + 1e-12) candB.push(j);
            }
            // 邻站应取线路上相距最近的一对下标，保证环线收尾站（琶洲->赤沙）取到直接相连的那段
            let idxA = candA[0], idxB = candB[0], bestGap = Infinity;
            for (const ia of candA) {
                for (const ib of candB) {
                    const gap = Math.abs(ia - ib);
                    if (gap < bestGap) { bestGap = gap; idxA = ia; idxB = ib; }
                }
            }

            let segmentCoords = [];
            if (idxA < idxB) {
                segmentCoords = lineCoords.slice(idxA, idxB + 1);
            } else if (idxA > idxB) {
                segmentCoords = lineCoords.slice(idxB, idxA + 1).reverse();
            } else {
                segmentCoords = [cA, cB];
            }

            if (segmentCoords.length === 0) continue;

            let pathParts = segmentCoords.map(([lng, lat]) => {
                const [x, y] = project(lng, lat);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            });

            // 判断 stA -> stB 方向与 stB -> stA 方向是否还在运营
            const isUpActive = isDirActive(lineName, stA, 'up', currentMin);
            const isDownActive = isDirActive(lineName, stB, 'down', currentMin);

            let strokeColor = color;
            let arrowHtml = '';

            if (!isUpActive && !isDownActive) {
                strokeColor = '#e2e8f0';
            } else if (isUpActive !== isDownActive) {
                strokeColor = mixColor(color, 60);
                if (!isUpActive && isDownActive) {
                    pathParts.reverse();
                    // 如果是反向运营 (B->A)，记录 stA 为需要强制显示的终点站
                    mustShowStations.add(stA);
                } else if (isUpActive && !isDownActive) {
                    // 如果是正向运营 (A->B)，记录 stB 为需要强制显示的终点站
                    mustShowStations.add(stB);
                }
            }

            pathHtml += `<polyline class="topo-line" data-special-line="${isSpecialLine}" points="${pathParts.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;

            if (isUpActive !== isDownActive) {
                if (pathParts.length >= 2) {
                    // 箭头放在邻站间线路长度的 1/2 处（按弧长而非折点序号取中点）
                    const pts = pathParts.map(p => p.split(',').map(Number));
                    const cum = [0];
                    for (let k = 1; k < pts.length; k++) {
                        cum[k] = cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
                    }
                    const total = cum[cum.length - 1];
                    let midP = pts[0], angle = 0;
                    if (total > 0) {
                        const half = total / 2;
                        let k = 1;
                        while (k < cum.length - 1 && cum[k] < half) k++;
                        const segLen = cum[k] - cum[k - 1];
                        const t = segLen > 0 ? (half - cum[k - 1]) / segLen : 0;
                        midP = [
                            pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t,
                            pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t
                        ];
                        angle = Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0]) * 180 / Math.PI;
                    }

                    const arrowFill = getContrastColor(strokeColor);
                    const arrowStroke = arrowFill === '#000000' ? '#ffffff' : '#000000';

                    // 加上 paint-order="stroke fill"，保证填充不被描边挤压
                    arrowHtml += `<g class="topo-arrow" data-x="${midP[0]}" data-y="${midP[1]}" data-angle="${angle}">
                        <g transform="scale(0.015625) translate(-512, -512)">
                            <path d="M941.34 466.656a63.508 63.508 0 0 0-2.914-2.719L685.134 210.656c-24.882-24.881-65.599-24.881-90.482 0-24.885 24.883-24.885 65.602 0 90.485l146.861 146.855H127.996c-35.2 0-64 28.8-64 64s28.8 64 64 64h613.517l-146.86 146.855c-24.885 24.883-24.885 65.602 0 90.485 24.882 24.881 65.599 24.881 90.482 0l253.292-253.281a64.641 64.641 0 0 0 2.914-2.719c12.467-12.466 18.686-28.907 18.661-45.34 0.024-16.433-6.195-32.873-18.662-45.34z" 
                                  fill="${arrowFill}" 
                                  stroke="${arrowStroke}" 
                                  stroke-width="128" 
                                  stroke-linejoin="round" 
                                  fill-opacity="0.9"
                                  paint-order="stroke fill">
                            </path>
                        </g>
                    </g>`;
                }
            }

            if (arrowHtml) {
                pathHtml += arrowHtml;
            }
        }
    });

    Object.entries(stationDict).forEach(([key, info]) => {
        const isTransfer = topoStationCount[key] > 1;

        let hasActive = false;
        const renderColors = [];

        for (const line of info.lines) {
            const isAct = isStationActive(line, info.displayName, currentMin);
            if (isAct) hasActive = true;
            // 如果某个方向有车，这个站点对应线路的扇形颜色就保留；如果彻底没了就是灰色
            renderColors.push(isAct ? info.lineColors[line] : '#cbd5e1');
        }

        // 检查是否是被单向车指向的终点站
        const isMustShow = mustShowStations.has(info.displayName);

        // 双向均停运且不是终点指向站：隐藏
        if (!hasActive && !isMustShow) return;

        // 如果只是被指向（自身没车了），圆点和文字全部变为纯灰色
        const finalActive = hasActive || isMustShow;
        const finalRenderColors = hasActive ? renderColors : renderColors.map(() => '#cbd5e1');

        const circleHtml = getCircleHtml(finalRenderColors, isTransfer);
        const finalIsSpecial = info.hasSpecialLine && !info.hasNormalLine;

        pointHtml += `
            <g class="topo-station-node" data-special-node="${finalIsSpecial}" data-active="${finalActive}" data-x="${info.x.toFixed(1)}" data-y="${info.y.toFixed(1)}">
                ${circleHtml}
            </g>
        `;

        const textClass = isTransfer ? 'topo-text topo-text-transfer' : 'topo-text';
        const fontWeight = isTransfer ? 'bold' : 'normal';
        let dx = 10, dy = 5, anchor = 'start';
        if (isTransfer) {
            dx = 0;
            dy = -15;
            anchor = 'middle';
        }
        const strokeWidth = isTransfer ? '4px' : '2px';

        // 如果被单向箭头指着，文字颜色用深灰，保证看得清
        const textColor = hasActive ? '#1e293b' : '#64748b';

        labelHtml += `
            <g class="label-group" data-x="${info.x.toFixed(1)}" data-y="${info.y.toFixed(1)}">
                <text class="${textClass}" data-transfer="${isTransfer}" data-special="${finalIsSpecial}" x="${dx}" y="${dy}" text-anchor="${anchor}" font-size="12" font-weight="${fontWeight}" fill="${textColor}" style="pointer-events:none; paint-order: stroke; stroke: #ffffff; stroke-width: ${strokeWidth}; stroke-linejoin: round;">${info.displayName}</text>
            </g>
        `;
    });

    gMap.innerHTML = pathHtml + pointHtml;
    gLabel.innerHTML = labelHtml;

    svg.appendChild(gMap);
    svg.appendChild(gLabel);

    // 仅在首次渲染时居中并适配缩放，后续（含30秒自动刷新）保持用户当前视图
    if (!topoViewInitialized) {
        const [cx, cy] = project((topoBounds.minLng + topoBounds.maxLng) / 2, (topoBounds.minLat + topoBounds.maxLat) / 2);
        const wrap = document.getElementById('topo-canvas-wrap');
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;

        const initialScale = Math.min(w / 2000, h / 2000) * 0.9;
        topoTransform = {x: w / 2, y: h / 2, scale: initialScale};
        topoTransform.x -= cx * initialScale;
        topoTransform.y -= cy * initialScale;
        topoViewInitialized = true;
    }

    applyTopoTransform();
}

function isDirActive(line, station, dir, currentMin) {
    const d = lineDirectionTime[line]?.[station];
    if (!d) return false;
    if (line === '11号线') {
        if (dir === 'up') {
            return (d.upFull && currentMin >= d.upFull.first && currentMin <= d.upFull.last) ||
                (d.upTerminal && currentMin >= d.upTerminal.first && currentMin <= d.upTerminal.last);
        } else {
            return (d.downFull && currentMin >= d.downFull.first && currentMin <= d.downFull.last) ||
                (d.downTerminal && currentMin >= d.downTerminal.first && currentMin <= d.downTerminal.last);
        }
    } else {
        const arr = d[dir] || [];
        return arr.some(t => currentMin >= t.first && currentMin <= t.last);
    }
}

function isStationActive(line, station, currentMin) {
    return isDirActive(line, station, 'up', currentMin) || isDirActive(line, station, 'down', currentMin);
}

function mixColor(hex, percent) {
    const gray = [203, 213, 225];
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    const p = percent / 100;
    r = Math.round(r * (1 - p) + gray[0] * p);
    g = Math.round(g * (1 - p) + gray[1] * p);
    b = Math.round(b * (1 - p) + gray[2] * p);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getBrightness(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}

function applyTopoTransform() {
    const wrap = document.getElementById('topo-canvas-wrap');

    if (wrap) {
        const mapW = 2000 * topoTransform.scale;
        const mapH = 2000 * topoTransform.scale;
        const wrapW = wrap.clientWidth;
        const wrapH = wrap.clientHeight;

        const marginW = wrapW * 0.5;
        const marginH = wrapH * 0.5;

        if (mapW <= wrapW) {
            topoTransform.x = (wrapW - mapW) / 2;
        } else {
            const minX = wrapW - mapW - marginW;
            const maxX = marginW;
            topoTransform.x = Math.max(minX, Math.min(maxX, topoTransform.x));
        }

        if (mapH <= wrapH) {
            topoTransform.y = (wrapH - mapH) / 2;
        } else {
            const minY = wrapH - mapH - marginH;
            const maxY = marginH;
            topoTransform.y = Math.max(minY, Math.min(maxY, topoTransform.y));
        }
    }

    const isTextHidden = document.getElementById('topo-hide-text')?.checked;
    const isNodeHidden = document.getElementById('topo-hide-node')?.checked;

    const gMap = document.getElementById('topo-map-layer');
    const gLabel = document.getElementById('topo-label-layer');
    const scale = topoTransform.scale;

    const indicator = document.getElementById('topo-zoom-indicator');
    if (indicator) {
        indicator.textContent = `缩放: ${Math.round(scale * 100)}%`;
    }

    const showSpecial = scale >= 1.2;

    if (gMap) {
        gMap.setAttribute('transform', `translate(${topoTransform.x}, ${topoTransform.y}) scale(${scale})`);

        const realLineWidth = Math.max(2, Math.min(6, 3 * scale));
        // 有轨电车 / APM 线使用更细的线宽
        const realSpecialLineWidth = Math.max(1, realLineWidth * 0.5);

        gMap.querySelectorAll('.topo-line').forEach(el => {
            const isSpecial = el.getAttribute('data-special-line') === 'true';
            el.setAttribute('stroke-width', (isSpecial ? realSpecialLineWidth : realLineWidth) / scale);
            if (isSpecial) {
                el.style.display = showSpecial ? '' : 'none';
            }
        });

        // 箭头的动态大小和颜色控制
        const realArrowScale = Math.max(0.5, Math.min(1.3, 0.65 * scale));

        gMap.querySelectorAll('.topo-arrow').forEach(el => {
            el.style.display = showSpecial ? '' : 'none';
            const x = el.getAttribute('data-x');
            const y = el.getAttribute('data-y');
            const angle = el.getAttribute('data-angle');

            if (x && y && angle) {
                el.setAttribute('transform', `translate(${x}, ${y}) rotate(${angle}) scale(${realArrowScale / scale})`);
            }
        });

        // ... 前面的代码不变 ...

        const showNodes = scale >= 0.5;

        gMap.querySelectorAll('.topo-station-node').forEach(el => {
            // 如果用户勾选了隐藏节点
            if (isNodeHidden) {
                el.style.display = 'none';
                return;
            }

            const isSpecial = el.getAttribute('data-special-node') === 'true';
            if (isSpecial) {
                el.style.display = showSpecial ? '' : 'none';
            } else {
                el.style.display = showNodes ? '' : 'none';
            }

            const x = el.dataset.x;
            const y = el.dataset.y;

            const isTransfer = el.children.length > 1;
            const maxScale = isTransfer ? 0.85 : 1.1;
            const nodeScale = Math.max(0.55, Math.min(maxScale, scale));

            el.setAttribute('transform', `translate(${x}, ${y}) scale(${nodeScale / scale})`);
        });
    }

    if (gLabel) {

        if (isTextHidden) {
            gLabel.style.display = 'none';
            return;
        } else {
            gLabel.style.display = '';
        }

        gLabel.setAttribute('transform', `translate(${topoTransform.x}, ${topoTransform.y})`);

        const groups = gLabel.querySelectorAll('.label-group');

        groups.forEach(g => {
            const rawX = parseFloat(g.dataset.x);
            const rawY = parseFloat(g.dataset.y);

            g.setAttribute('transform', `translate(${rawX * scale}, ${rawY * scale})`);

            const text = g.querySelector('text');
            if (text) {
                const isTransfer = text.dataset.transfer === 'true';
                const isSpecial = text.dataset.special === 'true';

                // 如果开启了隐藏文本，直接 display: none
                if (hideTopoText) {
                    text.style.display = 'none';
                    return;
                }

                let showText = false;
                if (isTransfer) {
                    showText = scale >= 1.0;
                } else {
                    showText = scale >= 2.3;
                }

                // ... 下面保留原样

                if (showText) {
                    text.style.display = '';

                    let currentFontSize = 12;
                    if (isSpecial) {
                        currentFontSize = Math.max(6, Math.min(10, 6 * Math.sqrt(scale)));
                    } else {
                        if (isTransfer) {
                            currentFontSize = Math.max(12, Math.min(22, 11 * Math.sqrt(scale)));
                        } else {
                            currentFontSize = Math.max(9, Math.min(18, 9 * Math.sqrt(scale)));
                        }
                    }
                    text.setAttribute('font-size', currentFontSize);
                } else {
                    text.style.display = 'none';
                }
            }
        });
    }
}

function setupTopoInteract(svg, wrap) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initX = 0, initY = 0;

    let isPinching = false;
    let initialDistance = 0;
    let initialScale = 1;
    let startCenterX = 0;
    let startCenterY = 0;

    wrap.style.touchAction = 'none';

    wrap.addEventListener('mousedown', (e) => {
        isDragging = true;
        wrap.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        initX = topoTransform.x;
        initY = topoTransform.y;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        topoTransform.x = initX + dx;
        topoTransform.y = initY + dy;
        applyTopoTransform();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        wrap.style.cursor = 'grab';
    });

    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.max(0.18, Math.min(5, topoTransform.scale * zoomFactor));

        topoTransform.x = mouseX - (mouseX - topoTransform.x) * (newScale / topoTransform.scale);
        topoTransform.y = mouseY - (mouseY - topoTransform.y) * (newScale / topoTransform.scale);
        topoTransform.scale = newScale;

        applyTopoTransform();
    }, {passive: false});

    wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            isPinching = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            initX = topoTransform.x;
            initY = topoTransform.y;
        } else if (e.touches.length === 2) {
            isDragging = false;
            isPinching = true;
            initialDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialScale = topoTransform.scale;
            startCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            startCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            initX = topoTransform.x;
            initY = topoTransform.y;
        }
    }, {passive: false});

    wrap.addEventListener('touchmove', (e) => {
        e.preventDefault();

        if (e.touches.length === 1) {
            if (!isDragging) {
                isDragging = true;
                isPinching = false;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                initX = topoTransform.x;
                initY = topoTransform.y;
            } else {
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                topoTransform.x = initX + dx;
                topoTransform.y = initY + dy;
                applyTopoTransform();
            }
        } else if (e.touches.length === 2 && isPinching) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            let zoomFactor = currentDistance / initialDistance;
            let newScale = Math.max(0.18, Math.min(5, initialScale * zoomFactor));

            const scaleChange = newScale / initialScale;

            topoTransform.x = currentCenterX - (startCenterX - initX) * scaleChange;
            topoTransform.y = currentCenterY - (startCenterY - initY) * scaleChange;
            topoTransform.scale = newScale;

            applyTopoTransform();
        }
    }, {passive: false});

    wrap.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            isDragging = false;
            isPinching = false;
        } else if (e.touches.length === 1) {
            isDragging = true;
            isPinching = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            initX = topoTransform.x;
            initY = topoTransform.y;
        }
    });
}