// ========== 附近站点 ==========

function initNearbyButton() {
    const btn = document.getElementById('nearby-btn');
    if (!btn) return;
    btn.addEventListener('click', findNearbyStations);
}

function findNearbyStations() {
    if (!navigator.geolocation) {
        showNearbyPanel('error', '您的浏览器不支持定位功能');
        return;
    }
    const btn = document.getElementById('nearby-btn');
    btn.disabled = true;

    showNearbyPanel('loading');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            // WGS84 → GCJ02，与站点坐标统一
            const [gcjLat, gcjLng] = wgs84ToGcj02(latitude, longitude);
            const results = calculateNearby(gcjLat, gcjLng, 5);
            showNearbyPanel('results', results);
            btn.disabled = false;
        },
        (err) => {
            console.error('[定位] 失败:', err);
            let msg = '定位失败';
            if (err.code === 1) msg = '定位权限被拒绝，请在浏览器设置中允许访问位置';
            else if (err.code === 2) msg = '无法获取位置信息，请检查设备定位功能';
            else if (err.code === 3) msg = '定位超时，请重试';
            showNearbyPanel('error', msg);
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function calculateNearby(lat, lng, limit) {
    if (typeof STATION_COORDS === 'undefined') {
        console.warn('[附近] STATION_COORDS 未定义');
        return [];
    }
    const results = [];
    for (const [name, coord] of Object.entries(STATION_COORDS)) {
        const [sLng, sLat] = coord;
        const dist = haversineDistance(lat, lng, sLat, sLng);
        results.push({ name, dist });
    }
    results.sort((a, b) => a.dist - b.dist);
    return results.slice(0, limit);
}

// ========== WGS84 → GCJ02 坐标转换 ==========
// 浏览器 geolocation 返回 WGS84，站点坐标是 GCJ02，需要统一后再比较

const GCJ_A = 6378245.0;              // 克拉索夫斯基椭球长半轴
const GCJ_EE = 0.006693421622965943;  // 偏心率平方

/** 判断是否在中国境外（境外不做偏移） */
function outOfChina(lat, lng) {
    return (lng < 72.004 || lng > 137.8347) || (lat < 0.8293 || lat > 55.8271);
}

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

/** WGS84 → GCJ02 */
function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) {
        return [lat, lng];
    }
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
}

/** 两点经纬度之间的距离（米），Haversine 公式 */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function showNearbyPanel(state, data) {
    let panel = document.getElementById('nearby-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'nearby-panel';
        panel.className = 'nearby-panel';
        panel.innerHTML = `<div class="nearby-container">
            <div class="nearby-header">
                <span>📍 附近站点</span>
                <div class="nearby-header-actions">
                    <button class="nearby-refresh" type="button" aria-label="重新定位" title="重新定位">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </button>
                    <button class="nearby-close" type="button" aria-label="关闭">✕</button>
                </div>
            </div>
            <div class="nearby-body"></div>
        </div>`;
        document.body.appendChild(panel);

        // 关闭
        panel.querySelector('.nearby-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });
        // 点击遮罩关闭
        panel.addEventListener('click', (e) => {
            if (e.target === panel) panel.style.display = 'none';
        });
        // 刷新
        panel.querySelector('.nearby-refresh').addEventListener('click', () => {
            findNearbyStations();
        });
    }

    const body = panel.querySelector('.nearby-body');
    const refreshBtn = panel.querySelector('.nearby-refresh');

    // ---- 刷新按钮：加载中禁用并旋转 ----
    if (refreshBtn) {
        const isLoading = (state === 'loading');
        refreshBtn.disabled = isLoading;
        refreshBtn.classList.toggle('spinning', isLoading);
    }

    if (state === 'loading') {
        body.innerHTML = `<div class="nearby-loading">正在定位...</div>`;
    } else if (state === 'error') {
        body.innerHTML = `
            <div class="nearby-error">
                <p>${data}</p>
                <button class="nearby-retry-btn" type="button">重试</button>
            </div>
        `;
        const retryBtn = body.querySelector('.nearby-retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                findNearbyStations();
            });
        }
    } else if (state === 'results') {
        // 懒构建兜底（同 search.js 逻辑）
        if (Object.keys(STATION_INDEX).length === 0 && Object.keys(LINE_STATIONS).length > 0) {
            buildStationIndex();
        }
        if (!data || data.length === 0) {
            body.innerHTML = `<div class="nearby-error">未找到附近站点</div>`;
        } else {
            body.innerHTML = data.map(r => {
                const lines = (typeof STATION_INDEX !== 'undefined' && STATION_INDEX[r.name]) || [];
                const distStr = r.dist < 1000
                    ? `${Math.round(r.dist)} m`
                    : `${(r.dist / 1000).toFixed(2)} km`;
                const isTransfer = lines.length > 1;
                const badges = lines.map(l => {
                    const color = LINE_COLORS[l] || '#888';
                    const textColor = getContrastColor(color);
                    return `<span class="nearby-badge" data-line="${l}" data-station="${r.name}" style="background:${color}; color:${textColor};">${shortLineName(l)}</span>`;
                }).join('');
                return `<div class="nearby-item${isTransfer ? ' is-transfer' : ''}"
                             data-station="${r.name}"
                             data-lines='${JSON.stringify(lines)}'>
                    <div class="nearby-info">
                        <div class="nearby-name">${r.name}</div>
                        <div class="nearby-dist">直线距离约 ${distStr}</div>
                    </div>
                    <div class="nearby-badges">${badges}</div>
                </div>`;
            }).join('');

            // 整行点击：单线路直接跳，多线路展开线路选择
            body.querySelectorAll('.nearby-item').forEach(item => {
                item.addEventListener('click', () => {
                    const lines = JSON.parse(item.dataset.lines);
                    const station = item.dataset.station;
                    if (lines.length === 1) {
                        panel.style.display = 'none';
                        doSearchJump(lines[0], station);
                    } else {
                        toggleNearbyLinePicker(item, station, lines);
                    }
                });
            });

            // 徽章点击：独立跳转（阻止冒泡以免触发整行）
            body.querySelectorAll('.nearby-badge').forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    panel.style.display = 'none';
                    doSearchJump(badge.dataset.line, badge.dataset.station);
                });
            });
        }
    }

    panel.style.display = 'flex';
}

/** 展开/收起多线路站点的线路选择列表 */
function toggleNearbyLinePicker(item, station, lines) {
    const existing = item.querySelector('.nearby-line-picker');
    if (existing) {
        collapsePicker(existing, item);
        return;
    }

    // 收起所有其他展开项
    document.querySelectorAll('.nearby-line-picker').forEach(p => {
        const parent = p.closest('.nearby-item');
        collapsePicker(p, parent);
    });

    const picker = document.createElement('div');
    picker.className = 'nearby-line-picker';
    picker.innerHTML = `<div class="nearby-picker-inner">` + lines.map(l => {
        const color = LINE_COLORS[l] || '#888';
        const textColor = getContrastColor(color);
        return `<button class="nearby-picker-btn"
                        data-line="${l}"
                        data-station="${station}"
                        style="background:${color}; color:${textColor};">
            <span class="nearby-picker-name">${l}</span>
            <span class="nearby-picker-arrow">→</span>
        </button>`;
    }).join('') + `</div>`;

    item.appendChild(picker);
    item.classList.add('expanded');

    // 两次 rAF 让 grid-template-rows 从 0fr 平滑过渡到 1fr
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            picker.classList.add('open');
        });
    });

    picker.querySelectorAll('.nearby-picker-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('nearby-panel').style.display = 'none';
            doSearchJump(btn.dataset.line, btn.dataset.station);
        });
    });
}

function collapsePicker(picker, item) {
    if (!picker || picker.dataset.collapsing === '1') return;
    picker.dataset.collapsing = '1';

    picker.classList.remove('open');

    // 时长与 CSS 一致，留 50ms 余量后移除
    setTimeout(() => {
        picker.remove();
        if (item) item.classList.remove('expanded');
    }, 400);
}