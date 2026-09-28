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
            const results = calculateNearby(latitude, longitude, 5);
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
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
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
                <button class="nearby-close" type="button" aria-label="关闭">✕</button>
            </div>
            <div class="nearby-body"></div>
        </div>`;
        document.body.appendChild(panel);
        panel.querySelector('.nearby-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });
        panel.addEventListener('click', (e) => {
            if (e.target === panel) panel.style.display = 'none';
        });
    }

    const body = panel.querySelector('.nearby-body');

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
    // 已展开则收起
    const existing = item.querySelector('.nearby-line-picker');
    if (existing) {
        existing.remove();
        item.classList.remove('expanded');
        return;
    }
    // 先收起所有其他展开项
    document.querySelectorAll('.nearby-line-picker').forEach(p => p.remove());
    document.querySelectorAll('.nearby-item.expanded').forEach(i => i.classList.remove('expanded'));

    const picker = document.createElement('div');
    picker.className = 'nearby-line-picker';
    picker.innerHTML = lines.map(l => {
        const color = LINE_COLORS[l] || '#888';
        const textColor = getContrastColor(color);
        return `<button class="nearby-picker-btn"
                        data-line="${l}"
                        data-station="${station}"
                        style="background:${color}; color:${textColor};">
            <span class="nearby-picker-name">${l}</span>
            <span class="nearby-picker-arrow">→</span>
        </button>`;
    }).join('');

    item.appendChild(picker);
    item.classList.add('expanded');

    picker.querySelectorAll('.nearby-picker-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('nearby-panel').style.display = 'none';
            doSearchJump(btn.dataset.line, btn.dataset.station);
        });
    });
}