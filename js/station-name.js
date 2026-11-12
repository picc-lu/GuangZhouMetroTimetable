// js/station-name.js
// @requires 无（不依赖 constants.js，可最早加载）
// ============================================================
// 站名/线路名规范化 —— 全项目唯一真源
// 修改映射只改这里
// ============================================================

// ---------- 1. 线路名规范化 ----------
// 保持与 api.js 原 normalizeMetroText 相同的替换顺序（顺序敏感）
const LINE_NAME_RULES = [
    [/^一号线/, '1号线'],
    [/^二号线/, '2号线'],
    [/^三北线/, '3号线北'],
    [/^三号线/, '3号线'],
    [/^四号线/, '4号线'],
    [/^五号线/, '5号线'],
    [/^六号线/, '6号线'],
    [/^七号线/, '7号线'],
    [/^八号线/, '8号线'],
    [/^九号线/, '9号线'],
    [/^十号线/, '10号线'],
    [/^十一号线/, '11号线'],
    [/^十二号线（二沙岛-大学城南）/, '12号线东'],
    [/^十二号线$/, '12号线西'],
    [/^十三号线/, '13号线'],
    [/^十四号线/, '14号线'],
    [/^十八号线/, '18号线'],
    [/^二十一号线/, '21号线'],
    [/^二十二号线/, '22号线'],
    [/佛山地铁二号线|佛山地铁2号线/, '佛山2号线'],
    [/佛山地铁三号线|佛山地铁3号线/, '佛山3号线'],
    [/\(联和-佛山大学\)/, '北'],
    [/^海珠有轨$/, '海珠有轨1号线'],
];

function normalizeLineName(raw) {
    if (!raw) return raw;
    let s = String(raw);
    for (const [re, to] of LINE_NAME_RULES) {
        if (re.test(s)) {
            s = s.replace(re, to);
            break;
        }
    }
    return s;
}

// ---------- 2. 站名别名（canonical 是多向映射的“目标规范名”） ----------
// canonical 本身也要能匹配到自己
const STATION_ALIASES = {
    '机场北':         ['机场北（T2）', '机场北（2号航站楼）'],
    '机场北（T2）':   ['机场北', '机场北（2号航站楼）'],
    '机场南':         ['机场南（1号航站楼）'],
    '礌岗':           ['虫雷 岗', '虫雷岗'],
    '虫雷 岗':        ['礌岗', '虫雷岗'],
    '虫雷岗':         ['礌岗', '虫雷 岗'],
    '庆盛':           ['庆盛（南沙北站）'],
    '庆盛（南沙北站）': ['庆盛'],
    '清布':           ['清㘵'],
    '清㘵':           ['清布'],
};

const _ALIAS_TO_CANON = (() => {
    const m = new Map();
    for (const [canon, aliases] of Object.entries(STATION_ALIASES)) {
        m.set(canon, canon);
    }
    // 再做一次遍历，把非规范名的映射指过去，并且避免互相覆盖
    for (const [canon, aliases] of Object.entries(STATION_ALIASES)) {
        for (const a of aliases) {
            if (!m.has(a) || m.get(a) === a) {
                m.set(a, canon);
            }
        }
    }
    return m;
})();

/** 把任意别名统一成规范名（图节点名） */
function canonicalStation(name) {
    if (!name) return name;
    return _ALIAS_TO_CANON.get(String(name).trim()) || String(name).trim();
}

// ---------- 3. 有轨电车 ↔ 地铁 ----------
const TRAM_STATION_ALIAS = {
    '广州塔站': '广州塔（有轨）',
    '万胜围': '万胜围（有轨）',
    '地铁长平站': '地铁长平',
    '水西': '水西（有轨）',
    '礌岗': '虫雷 岗（有轨）',
    '林岳东': '林岳东（有轨）',
};

function normalizeTramStation(name) {
    return TRAM_STATION_ALIAS[name] || name;
}

// ---------- 4. 显示层格式化 ----------
function formatStationForDisplay(name) {
    return String(name).replace(/礌岗/g, '虫雷 岗').replace(/虫雷岗/g, '虫雷 岗');
}

// ---------- 5. 票价别名（降级匹配用，双向） ----------
const FARE_ALIAS_MAP = {
    '虫雷岗': '礌岗',
    '礌岗': '虫雷 岗',
    '虫雷 岗': '虫雷 岗',
    '庆盛': '庆盛（南沙北站）',
    '庆盛（南沙北站）': '庆盛',
    '机场北': '机场北（T2）',
    '机场北（T2）': '机场北',
    '清㘵': '清布',
    '清布': '清㘵',
};

function fareAlias(name) {
    return FARE_ALIAS_MAP[name] || name;
}

function toDisplayName(name) {
    return formatStationForDisplay(canonicalStation(name));
}