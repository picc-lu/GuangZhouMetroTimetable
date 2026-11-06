// ========== 站点坐标归一化 ==========
STATION_COORDS = normalizeStationCoords(GZ_COORDS_RAW);

function normalizeStationCoords(raw) {
    const coords = {};

    for (const [key, val] of Object.entries(raw)) {
        let name;
        if (key.startsWith('地铁|')) {
            name = key.slice(3);
            // 地铁侧：坐标键 → 显示名（与 LINE_STATIONS 的键一致）
            name = toDisplayName(name);
        } else if (key.startsWith('有轨电车|')) {
            name = key.slice(5);
            // 有轨侧：坐标键 → 项目站名（带「（有轨）」后缀）
            name = normalizeTramStation(name);
        } else {
            continue;
        }
        coords[name] = val;
    }

    return coords;
}