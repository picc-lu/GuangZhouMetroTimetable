// ========== 路线地图模块 ==========
// ========== 地图瓦片本地缓存 (IndexedDB) ==========
const TileCache = {
    dbName: 'MetroMapTileCache',
    storeName: 'tiles',
    db: null,

    init() {
        if (this.db) return Promise.resolve();
        return new Promise((resolve) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            req.onsuccess = e => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = () => resolve(); // 即使失败也不阻断地图
        });
    },

    get(url) {
        if (!this.db) return Promise.resolve(null);
        return new Promise(resolve => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(url);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    },

    set(url, blob) {
        if (!this.db) return;
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(blob, url);
    }
};

// 自定义支持缓存的 TileLayer
let CachedTileLayer = null;

function initCachedTileLayer() {
    if (CachedTileLayer) return;

    CachedTileLayer = L.TileLayer.extend({
        createTile: function (coords, done) {
            const tile = document.createElement('img');
            const url = this.getTileUrl(coords);

            // 1. 尝试读取缓存
            TileCache.get(url).then(blob => {
                if (blob) {
                    const objectUrl = URL.createObjectURL(blob);
                    tile.onload = () => {
                        done(null, tile);
                        setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
                    };
                    tile.onerror = (e) => done(e, tile);
                    tile.src = objectUrl;
                } else {
                    // 2. 无缓存，使用 fetch 下载（避开 img.crossOrigin 的兼容性问题）
                    fetch(url).then(res => {
                        if (!res.ok) throw new Error('Network error');
                        return res.blob();
                    }).then(b => {
                        TileCache.set(url, b); // 存入 IndexedDB
                        const objectUrl = URL.createObjectURL(b);
                        tile.onload = () => {
                            done(null, tile);
                            setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
                        };
                        tile.onerror = (e) => done(e, tile);
                        tile.src = objectUrl;
                    }).catch(() => {
                        // 3. fetch 失败兜底，直接让 img 加载
                        tile.onload = () => done(null, tile);
                        tile.onerror = (e) => done(e, tile);
                        tile.src = url;
                    });
                }
            }).catch(() => {
                // 4. IndexedDB 读取异常兜底
                tile.onload = () => done(null, tile);
                tile.onerror = (e) => done(e, tile);
                tile.src = url;
            });

            return tile;
        }
    });
}

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
        {
            css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
            js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        },
        {
            css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
            js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
        },
        {
            css: 'https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.min.css',
            js: 'https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.min.js'
        }
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
                const timer = setTimeout(() => {
                    script.remove();
                    rej(new Error('Timeout'));
                }, timeoutMs);
                script.onload = () => {
                    clearTimeout(timer);
                    if (typeof L !== 'undefined') res();
                    else rej(new Error('L not defined'));
                };
                script.onerror = () => {
                    clearTimeout(timer);
                    script.remove();
                    rej(new Error('Network Error'));
                };
                document.head.appendChild(script);
            });
        };

        for (const cdn of CDN_LIST) {
            try {
                await loadScript(cdn.js);
                _leafletLoaded = true;
                resolve();
                return;
            } catch (err) {
            }
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
                <div class="route-map-actions">
                    <button class="route-map-close" type="button">✕</button>
                </div>
            </div>
            <div class="route-map-canvas" id="route-map-canvas"></div>
        </div>
    `;

    const canvas = ov.querySelector('#route-map-canvas');
    if (canvas) {
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) e.preventDefault();
        }, {passive: false});
    }

    document.body.appendChild(ov);
    _mapOverlay = ov;
    ov.querySelector('.route-map-close').addEventListener('click', closeRouteMap);
    ov.addEventListener('click', (e) => {
        if (e.target === ov) closeRouteMap();
    });

    return ov;
}

function closeRouteMap() {
    if (_mapOverlay) _mapOverlay.classList.remove('show');
    if (_currentMap) {
        _currentMap.remove();
        _currentMap = null;
    }
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
    if (lineName === '3号线') filesToTry = ['3号线北.geojson', '3号线.geojson'];
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
        } catch (e) {
        }
    }

    if (mergedFeatures.length > 0) {
        const mergedData = {type: 'FeatureCollection', features: mergedFeatures};
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
                    if (dA < minDA) {
                        minDA = dA;
                        idxA = j;
                    }
                    const dB = getDistSq(coords[j], cB);
                    if (dB < minDB) {
                        minDB = dB;
                        idxB = j;
                    }
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
        if (i === 0 || fullPath[i][0] !== fullPath[i - 1][0] || fullPath[i][1] !== fullPath[i - 1][1]) {
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
    if (_currentMap) {
        _currentMap.remove();
        _currentMap = null;
    }
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;">正在加载地图和线路数据...</div>';

    try {
        await loadLeaflet();
        initCachedTileLayer();
        canvas.innerHTML = '';

        await TileCache.init();

        _currentMap = L.map('route-map-canvas', {
            zoomControl: false,
            attributionControl: false,
            minZoom: 9,
            maxZoom: 16,
            zoomSnap: 0.1,
            zoomDelta: 0.25,
            wheelPxPerZoomLevel: 15
        });
        const map = _currentMap;

        // 根据当前主题动态选择底图
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        const baseTileUrl = isDark
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
            : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';

        new CachedTileLayer(baseTileUrl, {
            maxZoom: 16,
            maxNativeZoom: 16
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
                curSeg = {line: lineName, stations: [stName]};
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
        const routeSegmentsUI = [];

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
                    if (seg.line.includes('有轨') || seg.line === 'TNH1') {
                        if (lineColor === '#60b4e3') lineColor = '#3a8fb7';
                    }
                }

                // 白色粗底描边
                L.polyline(latlngs, {color: '#ffffff', weight: 8, opacity: 1, lineJoin: 'round'}).addTo(map);
                // 彩色主线路
                L.polyline(latlngs, {
                    color: lineColor,
                    weight: 5,
                    opacity: 1,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(map);

                routeSegmentsUI.push({
                    line: seg.line,
                    color: lineColor,
                    latlngs: latlngs
                });

                if (latlngs.length >= 2) {
                    // 1. 计算线段总长度和中点位置
                    let totalDist = 0;
                    const segDists = [];
                    for (let i = 0; i < latlngs.length - 1; i++) {
                        const p1 = L.latLng(latlngs[i]);
                        const p2 = L.latLng(latlngs[i + 1]);
                        const dist = p1.distanceTo(p2);
                        segDists.push(dist);
                        totalDist += dist;
                    }

                    // 如果路段太短（比如相邻两站极近），就不放箭头以免重叠
                    if (totalDist > 200) {
                        const halfDist = totalDist / 2;
                        let accumDist = 0;
                        let midLatLng = latlngs[0];
                        let angle = 0;

                        for (let i = 0; i < segDists.length; i++) {
                            if (accumDist + segDists[i] >= halfDist) {
                                const ratio = (halfDist - accumDist) / segDists[i];
                                const p1 = latlngs[i];
                                const p2 = latlngs[i + 1];

                                // 线性插值计算中点坐标
                                midLatLng = [
                                    p1[0] + (p2[0] - p1[0]) * ratio,
                                    p1[1] + (p2[1] - p1[1]) * ratio
                                ];

                                // 计算角度：纬度差为 dy，经度差为 dx
                                const dy = p2[0] - p1[0];
                                const dx = p2[1] - p1[1];
                                // 屏幕坐标 Y 轴向下，需将 dy 取反，算出的角度对应 CSS rotate
                                angle = Math.atan2(-dy, dx) * 180 / Math.PI;
                                break;
                            }
                            accumDist += segDists[i];
                        }

                        // 2. 插入箭头图标 (模仿 topo.js 的 SVG)
                        const arrowIcon = L.divIcon({
                            className: 'route-map-arrow-icon',
                            html: `<div style="transform: rotate(${angle}deg); display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                                      <svg viewBox="0 0 1024 1024" style="width: 24px; height: 24px;">
                                          <path d="M941.34 466.656a63.508 63.508 0 0 0-2.914-2.719L685.134 210.656c-24.882-24.881-65.599-24.881-90.482 0-24.885 24.883-24.885 65.602 0 90.485l146.861 146.855H127.996c-35.2 0-64 28.8-64 64s28.8 64 64 64h613.517l-146.86 146.855c-24.885 24.883-24.885 65.602 0 90.485 24.882 24.881 65.599 24.881 90.482 0l253.292-253.281a64.641 64.641 0 0 0 2.914-2.719c12.467-12.466 18.686-28.907 18.661-45.34 0.024-16.433-6.195-32.873-18.662-45.34z" 
                                                fill="#ffffff" stroke="${lineColor}" stroke-width="150" stroke-linejoin="round" fill-opacity="1" paint-order="stroke fill"/>
                                      </svg>
                                   </div>`,
                            iconSize: [32, 32],
                            iconAnchor: [16, 16]
                        });
                        L.marker(midLatLng, {icon: arrowIcon, interactive: false}).addTo(map);
                    }
                }
            }
        });

        // 【新增】生成右侧线路悬浮面板
        const oldPanel = document.getElementById('route-map-line-panel');
        if (oldPanel) oldPanel.remove();

        if (routeSegmentsUI.length > 0) {
            const panel = document.createElement('div');
            panel.id = 'route-map-line-panel';
            panel.className = 'route-map-line-panel';

            L.DomEvent.disableClickPropagation(panel);
            L.DomEvent.disableScrollPropagation(panel);

            let panelHtml = '';
            routeSegmentsUI.forEach((seg, idx) => {
                const shortName = seg.line
                    .replace(/号线/g, '')
                    .replace(/佛山/g, '佛')
                    .replace(/线$/, '')
                    .replace(/\(.*\)/g, '支');

                const textColor = (typeof getContrastColor === 'function')
                    ? getContrastColor(seg.color)
                    : '#ffffff';

                // 【新增】根据文字长度动态缩小字体
                let fontSize = 16;
                if (shortName.length === 2) fontSize = 13;
                else if (shortName.length >= 3) fontSize = 10;

                panelHtml += `<button class="route-map-line-btn" data-idx="${idx}" 
                    style="background: ${seg.color}; color: ${textColor}; font-size: ${fontSize}px;">
                    ${shortName}
                </button>`;
            });

            // 【新增】在列表最后加上复位按钮
            panelHtml += `
                <button class="route-map-line-btn route-map-reset-btn" type="button" title="复位视野">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                        <path d="M3 3v5h5"></path>
                    </svg>
                </button>
            `;

            panel.innerHTML = panelHtml;

            const mapContainer = map.getContainer();
            mapContainer.appendChild(panel);

            let activeLineIdx = null;
            // 注意这里只取线路按钮，不要取到复位按钮
            const buttons = panel.querySelectorAll('.route-map-line-btn:not(.route-map-reset-btn)');

            // 绑定线路聚焦事件
            buttons.forEach((btn, idx) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (activeLineIdx === idx) return;

                    activeLineIdx = idx;
                    buttons.forEach((b, i) => {
                        b.classList.toggle('active', i === idx);
                    });

                    const latlngs = routeSegmentsUI[idx].latlngs;
                    if (latlngs.length > 0) {
                        const bounds = L.latLngBounds(latlngs);
                        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
                            map.flyTo(bounds.getCenter(), 15, {duration: 0.5});
                        } else {
                            map.flyToBounds(bounds, {
                                paddingTopLeft: [40, 40],
                                paddingBottomRight: [80, 40],
                                maxZoom: 15,
                                duration: 0.6
                            });
                        }
                    }
                });
            });

            // 【新增】绑定面板内的复位按钮事件
            panel.querySelector('.route-map-reset-btn').addEventListener('click', () => {
                // 清除线路的选中状态
                activeLineIdx = null;
                buttons.forEach(b => b.classList.remove('active'));

                // 复位地图视野
                if (window._lastRouteBounds) {
                    if (window._lastRouteBounds.getNorthEast().equals(window._lastRouteBounds.getSouthWest())) {
                        map.flyTo(window._lastRouteBounds.getCenter(), 15, {duration: 0.6});
                    } else {
                        map.flyToBounds(window._lastRouteBounds, {
                            paddingTopLeft: [40, 40],
                            paddingBottomRight: [80, 40],
                            maxZoom: 15,
                            duration: 0.6
                        });
                    }
                }
            });
        }

        // 4. 绘制站点标记与文本
        const allStations = [realStart, ...item.stationRoute, realEnd];
        const uniqueStations = [...new Set(allStations)];

        uniqueStations.forEach(st => {
            // 【新增】判断是否是换乘站
            const isTransfer = interchanges.some(o => o.key.split('|')[0] === st);

            // 【新增】如果是普通中间站点（不是起点、终点、也不是换乘站），直接跳过不渲染
            if (st !== realStart && st !== realEnd && !isTransfer) {
                return;
            }

            const coord = getStationCoordWithFallback(st);
            if (!coord) return;
            const [wgsLng, wgsLat] = gcj02ToWgs84(coord[0], coord[1]);

            let markerColor = '#3b82f6';
            let radius = 4;
            let isHighlight = false;

            if (st === realStart) {
                markerColor = '#10b981';
                radius = 7;
                isHighlight = true;
            } else if (st === realEnd) {
                markerColor = '#ef4444';
                radius = 7;
                isHighlight = true;
            } else if (interchanges.some(o => o.key.split('|')[0] === st)) {
                markerColor = '#f59e0b';
                radius = 6;
                isHighlight = true;
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
                marker.bindTooltip(st, {direction: 'top', offset: [0, -5]});
            }
        });

        if (allLatLngs.length > 0) {
            const bounds = L.latLngBounds(allLatLngs);
            window._lastRouteBounds = bounds;

            if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
                map.setView(bounds.getCenter(), 15);
            } else {
                map.fitBounds(bounds, {
                    paddingTopLeft: [40, 40],
                    paddingBottomRight: [80, 40], // 【核心修复】默认就留出右侧空间
                    maxZoom: 15
                });
            }
        } else {
            map.setView([23.1291, 113.2644], 12);
            window._lastRouteBounds = null;
        }

        setTimeout(() => map.invalidateSize(), 350);
    } catch (e) {
        canvas.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;">地图加载失败: ${e.message}</div>`;
    }
}

window.showRouteMap = showRouteMap;