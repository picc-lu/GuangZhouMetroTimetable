// ========== 路线地图模块 ==========
let _mapOverlay = null;
let _leafletLoaded = false;
let _leafletLoadingPromise = null;
let _currentMap = null;

const _geojsonCache = {};

async function loadLeaflet() {
    if (typeof L !== 'undefined') {
        _leafletLoaded = true;
        return;
    }
    if (_leafletLoadingPromise) return _leafletLoadingPromise;

    const CDN_LIST = [
        { css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' },
        { css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' },
        { css: 'https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.min.css', js: 'https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.min.js' }
    ];

    _leafletLoadingPromise = new Promise(async (resolve, reject) => {
        if (!document.querySelector('link[href*="leaflet"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = CDN_LIST[0].css;
            document.head.appendChild(link);
        }

        const loadScript = (url, timeoutMs = 5000) => {
            return new Promise((res, rej) => {
                const script = document.createElement('script');
                script.src = url;
                script.async = true;
                const timer = setTimeout(() => { script.remove(); rej(new Error('Timeout')); }, timeoutMs);
                script.onload = () => {
                    clearTimeout(timer);
                    if (typeof L !== 'undefined') res();
                    else rej(new Error('L not defined'));
                };
                script.onerror = () => { clearTimeout(timer); script.remove(); rej(new Error('Network Error')); };
                document.head.appendChild(script);
            });
        };

        for (const cdn of CDN_LIST) {
            try {
                await loadScript(cdn.js);
                _leafletLoaded = true;
                resolve();
                return;
            } catch (err) {}
        }
        reject(new Error('所有地图 CDN 源均加载失败，请检查网络连接。'));
    });
    return _leafletLoadingPromise;
}

function ensureMapOverlay() {
    if (_mapOverlay) return _mapOverlay;
    const ov = document.createElement('div');
    ov.className = 'route-map-overlay';
    ov.innerHTML = `
        <div class="route-map-container">
            <div class="route-map-header">
                <span class="route-map-title">路线地图</span>
                <button class="route-map-close" type="button">✕</button>
            </div>
            <div class="route-map-canvas" id="route-map-canvas"></div>
        </div>
    `;
    document.body.appendChild(ov);
    _mapOverlay = ov;
    ov.querySelector('.route-map-close').addEventListener('click', closeRouteMap);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeRouteMap(); });
    return ov;
}

function closeRouteMap() {
    if (_mapOverlay) _mapOverlay.classList.remove('show');
    if (_currentMap) { _currentMap.remove(); _currentMap = null; }
}

// ========== 坐标匹配辅助函数 ==========
function getStationCoordWithFallback(stName) {
    if (typeof STATION_COORDS === 'undefined') return null;
    let coord = STATION_COORDS[stName];
    if (!coord) {
        const normName = typeof canonicalStation === 'function' ? canonicalStation(stName) : stName;
        coord = STATION_COORDS[normName];
        if (!coord) {
            coord = STATION_COORDS[stName + '（有轨）'] || STATION_COORDS[normName + '（有轨）'];
        }
    }
    return coord;
}

async function fetchLineGeoJSON(lineName) {
    if (_geojsonCache[lineName] !== undefined) return _geojsonCache[lineName];

    let filesToTry = [`${lineName}.geojson`];

    // 兼容 12 号线东西段拆分
    if (lineName === '12号线') filesToTry = ['12号线西.geojson', '12号线东.geojson'];

    // 【核心修复】合并 3号线 与 3号线北 的数据，防止北段渲染成直线
    if (lineName === '3号线') filesToTry = ['3号线.geojson', '3号线北.geojson'];
    if (lineName === '3号线北') filesToTry = ['3号线北.geojson', '3号线.geojson'];

    // 兼容有轨电车的各种命名
    if (lineName === 'TNH1') filesToTry = ['TNH1.geojson', '南海有轨1号线.geojson'];
    if (lineName === '南海有轨1号线') filesToTry = ['南海有轨1号线.geojson', 'TNH1.geojson'];
    if (lineName === '海珠有轨1号线') filesToTry = ['海珠有轨1号线.geojson', '海珠有轨.geojson'];

    let mergedFeatures = [];
    for (const file of filesToTry) {
        try {
            const resp = await fetch(`./data/polyline/${file}`);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.features) mergedFeatures.push(...data.features);
            }
        } catch (e) {}
    }

    if (mergedFeatures.length > 0) {
        const mergedData = { type: 'FeatureCollection', features: mergedFeatures };
        _geojsonCache[lineName] = mergedData;
        return mergedData;
    }

    _geojsonCache[lineName] = null;
    return null;
}

function getDistSq(c1, c2) {
    return Math.pow(c1[0] - c2[0], 2) + Math.pow(c1[1] - c2[1], 2);
}

// 核心：从 GeoJSON 中逐站拼接路径
function extractPathCoords(geojson, stations) {
    const lineSegments = [];
    const stationCoordsMap = {};

    // 【核心修复】即使没有 geojson，也继续往下走，强行兜底连直线
    if (geojson && geojson.features) {
        geojson.features.forEach(f => {
            if (f.geometry.type === 'LineString') {
                lineSegments.push(f.geometry.coordinates);
            } else if (f.geometry.type === 'Point' && f.properties.name) {
                const rawName = f.properties.name;
                const normName = typeof canonicalStation === 'function' ? canonicalStation(rawName) : rawName;
                stationCoordsMap[normName] = f.geometry.coordinates;
                stationCoordsMap[rawName] = f.geometry.coordinates;
                const clean = rawName.replace(/[（(].*[）)]/g, '').trim();
                if (!stationCoordsMap[clean]) stationCoordsMap[clean] = f.geometry.coordinates;
            }
        });
    }

    const findCoordInGeoJSON = (stName) => {
        if (!geojson) return null;
        const normName = typeof canonicalStation === 'function' ? canonicalStation(stName) : stName;
        if (stationCoordsMap[normName]) return stationCoordsMap[normName];
        if (stationCoordsMap[stName]) return stationCoordsMap[stName];
        const clean = stName.replace(/[（(].*[）)]/g, '').trim();
        for (const k in stationCoordsMap) {
            if (k.replace(/[（(].*[）)]/g, '').trim() === clean) return stationCoordsMap[k];
        }
        return null;
    };

    const fullPath = [];

    for (let i = 0; i < stations.length - 1; i++) {
        const stA = stations[i];
        const stB = stations[i + 1];

        let cA = findCoordInGeoJSON(stA);
        let cB = findCoordInGeoJSON(stB);
        let sliceFound = false;

        if (cA && cB) {
            for (const coords of lineSegments) {
                let idxA = -1, minDA = Infinity;
                let idxB = -1, minDB = Infinity;

                for (let j = 0; j < coords.length; j++) {
                    const dA = getDistSq(coords[j], cA);
                    if (dA < minDA) { minDA = dA; idxA = j; }
                    const dB = getDistSq(coords[j], cB);
                    if (dB < minDB) { minDB = dB; idxB = j; }
                }

                if (minDA < 0.0001 && minDB < 0.0001) {
                    let tempSlice = [];

                    // 【核心修复】判断是否为闭合环线（如 11 号线）
                    const isClosedLoop = coords.length > 10 &&
                        (Math.abs(coords[0][0] - coords[coords.length - 1][0]) < 0.0001) &&
                        (Math.abs(coords[0][1] - coords[coords.length - 1][1]) < 0.0001);

                    if (isClosedLoop) {
                        const len = coords.length;
                        const forwardSteps = (idxB - idxA + len) % len;
                        const backwardSteps = (idxA - idxB + len) % len;

                        let curr = idxA;
                        if (forwardSteps <= backwardSteps) {
                            // 正向走更近（含跨越数组末尾的情况）
                            for (let s = 0; s <= forwardSteps; s++) {
                                tempSlice.push(coords[curr]);
                                curr = (curr + 1) % len;
                            }
                        } else {
                            // 反向走更近
                            for (let s = 0; s <= backwardSteps; s++) {
                                tempSlice.push(coords[curr]);
                                curr = (curr - 1 + len) % len;
                            }
                        }
                    } else {
                        // 普通线性线路（如 22 号线），直接按索引截取
                        if (idxA <= idxB) {
                            tempSlice = coords.slice(idxA, idxB + 1);
                        } else {
                            tempSlice = coords.slice(idxB, idxA + 1).reverse();
                        }
                    }

                    if (fullPath.length > 0) {
                        fullPath.push(...tempSlice.slice(1));
                    } else {
                        fullPath.push(...tempSlice);
                    }
                    sliceFound = true;
                    break;
                }
            }
        }

        // 【核心修复】如果这段路在 GeoJSON 里找不到，强制用 STATION_COORDS 连直线
        if (!sliceFound) {
            const stCA = getStationCoordWithFallback(stA);
            const stCB = getStationCoordWithFallback(stB);
            if (stCA && stCB) {
                const [wgsLng1, wgsLat1] = gcj02ToWgs84(stCA[0], stCA[1]);
                const [wgsLng2, wgsLat2] = gcj02ToWgs84(stCB[0], stCB[1]);

                if (fullPath.length === 0) {
                    fullPath.push([wgsLng1, wgsLat1]);
                }
                fullPath.push([wgsLng2, wgsLat2]);
            }
        }
    }

    // 去重
    const uniquePath = [];
    for (let i = 0; i < fullPath.length; i++) {
        if (i === 0 || fullPath[i][0] !== fullPath[i-1][0] || fullPath[i][1] !== fullPath[i-1][1]) {
            uniquePath.push(fullPath[i]);
        }
    }
    return uniquePath.length > 0 ? uniquePath : null;
}

// ========== 主入口 ==========
async function showRouteMap(item) {
    ensureMapOverlay();
    _mapOverlay.classList.add('show');

    const canvas = document.getElementById('route-map-canvas');
    if (_currentMap) { _currentMap.remove(); _currentMap = null; }
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;">正在加载地图和线路数据...</div>';

    try {
        await loadLeaflet();
        canvas.innerHTML = '';

        _currentMap = L.map('route-map-canvas', { zoomControl: false, attributionControl: false });
        const map = _currentMap;

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        }).addTo(map);

        const realStart = item._realStart || (item.stationRoute.length > 0 ? item.stationRoute[0] : '');
        const realEnd = item._realEnd || (item.stationRoute.length > 0 ? item.stationRoute[item.stationRoute.length - 1] : '');
        const interchanges = item.interchanges || [];

        // 1. 提取途经站点序列
        const segments = [];
        let curSeg = null;
        for (const node of item.path.nodes) {
            const parts = node.split('|');
            if (parts.length < 2) continue;
            if (parts[1] === '开始' || parts[1] === '结束') continue;

            let lineName = parts[0];
            const stName = parts[1];

            if (!curSeg || curSeg.line !== lineName) {
                curSeg = { line: lineName, stations: [stName] };
                segments.push(curSeg);
            } else {
                if (curSeg.stations[curSeg.stations.length - 1] !== stName) {
                    curSeg.stations.push(stName);
                }
            }
        }

        // 2. 预加载 GeoJSON
        const uniqueLines = [...new Set(segments.map(s => s.line))];
        await Promise.all(uniqueLines.map(line => fetchLineGeoJSON(line)));

        const allLatLngs = [];

        // 3. 绘制分段
        segments.forEach(seg => {
            const geojson = _geojsonCache[seg.line];
            const coords = extractPathCoords(geojson, seg.stations);

            let latlngs = [];
            if (coords && coords.length > 0) {
                latlngs = coords.map(c => [c[1], c[0]]);
            }

            if (latlngs.length > 0) {
                allLatLngs.push(...latlngs);

                let lineColor = '#888';
                if (typeof LINE_COLORS !== 'undefined') {
                    lineColor = LINE_COLORS[seg.line] || LINE_COLORS[seg.line.replace('北', '')] || '#888';
                    // 如果是有轨电车，稍微加深颜色以适配白色底图
                    if (seg.line.includes('有轨') || seg.line === 'TNH1') {
                        if (lineColor === '#60b4e3') lineColor = '#3a8fb7'; // 针对浅蓝色加深一点
                    }
                }

                // 白色粗底描边
                L.polyline(latlngs, { color: '#ffffff', weight: 8, opacity: 1, lineJoin: 'round' }).addTo(map);
                // 彩色主线路
                L.polyline(latlngs, { color: lineColor, weight: 5, opacity: 1, lineJoin: 'round', lineCap: 'round' }).addTo(map);
            }
        });

        // 4. 绘制站点标记与文本
        const allStations = [realStart, ...item.stationRoute, realEnd];
        const uniqueStations = [...new Set(allStations)];

        uniqueStations.forEach(st => {
            const coord = getStationCoordWithFallback(st);
            if (!coord) return;
            const [wgsLng, wgsLat] = gcj02ToWgs84(coord[0], coord[1]);

            let markerColor = '#3b82f6';
            let radius = 4;
            let isHighlight = false;

            if (st === realStart) {
                markerColor = '#10b981'; radius = 7; isHighlight = true;
            } else if (st === realEnd) {
                markerColor = '#ef4444'; radius = 7; isHighlight = true;
            } else if (interchanges.some(o => o.key.split('|')[0] === st)) {
                markerColor = '#f59e0b'; radius = 6; isHighlight = true;
            }

            const marker = L.circleMarker([wgsLat, wgsLng], {
                radius: radius,
                fillColor: markerColor,
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1
            }).addTo(map);

            if (isHighlight) {
                marker.bindTooltip(st, {
                    permanent: true, direction: 'right', className: 'route-map-station-label', offset: [6, 0]
                });
            } else {
                marker.bindTooltip(st, { direction: 'top', offset: [0, -5] });
            }
        });

        if (allLatLngs.length > 0) {
            map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
        }

        setTimeout(() => map.invalidateSize(), 350);
    } catch (e) {
        canvas.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;">地图加载失败: ${e.message}</div>`;
    }
}

window.showRouteMap = showRouteMap;