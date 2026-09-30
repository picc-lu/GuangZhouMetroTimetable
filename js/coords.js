// ========== 站点坐标归一化 ==========
STATION_COORDS = normalizeStationCoords(GZ_COORDS_RAW);

function normalizeStationCoords(raw) {
    const coords = {};

    // 地铁侧别名：坐标里的键 → 项目里的实际站名
    const METRO_ALIAS = {
        '庆盛': '庆盛（南沙北站）',
        '清布': '清㘵',
        '礌岗': '虫雷 岗'
    };

    // 有轨电车侧别名
    const TRAM_ALIAS = {
        '广州塔站': '广州塔（有轨）',
        '万胜围': '万胜围（有轨）',
        '地铁长平站': '地铁长平',
        '水西': '水西（有轨）',
        '礌岗': '虫雷 岗（有轨）',
        '林岳东': '林岳东（有轨）'
    };

    for (const [key, val] of Object.entries(raw)) {
        let name;
        if (key.startsWith('地铁|')) {
            name = key.slice(3);
            if (METRO_ALIAS[name]) name = METRO_ALIAS[name];
        } else if (key.startsWith('有轨电车|')) {
            name = key.slice(5);
            if (TRAM_ALIAS[name]) name = TRAM_ALIAS[name];
        } else {
            continue;
        }
        coords[name] = val;
    }

    return coords;
}