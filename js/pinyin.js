// ========== 广州地铁站名拼音字典 ==========
// 重点收录：多音字、难读字、易错字
// 未收录的普通汉字请按需补充，未收录时保留原字符（不崩溃）

const PINYIN_DICT = {
    // ===== 多音字 / 易错字（必须收录） =====
    '区': 'ou',      // 区庄 → ōu zhuāng（非 qū）
    '员': 'yuan',    // 员村、员岗 → yuán（非 yùn）
    '长': 'chang',   // 长湴、长寿路 → cháng（非 zhǎng）
    '湴': 'ban',     // 长湴 → bàn
    '塱': 'lang',    // 柯木塱、西塱 → lǎng
    '陂': 'bei',     // 车陂 → bēi（非 pí）
    '滘': 'jiao',    // 沥滘、厦滘、滘口 → jiào
    '碁': 'qi',      // 石碁 → qí
    '番': 'pan',     // 番禺 → pān（非 fān）
    '琶': 'pa',      // 琶洲 → pá
    '箕': 'ji',      // 杨箕 → jī
    '冼': 'xian',    // 冼村 → xiǎn
    '邨': 'cun',     // 五羊邨 → cūn
    '涌': 'chong',   // 东涌、上涌、低涌、湖涌 → chōng
    '圃': 'pu',      // 东圃 → pǔ
    '厦': 'xia',     // 厦滘 → xià
    '槎': 'cha',     // 张槎 → chá
    '驹': 'ju',      // 驹荣北路 → jū
    '暹': 'xian',    // 暹岗 → xiān
    '荔': 'li',      // 荔村 → lì
    '猎': 'lie',     // 猎德 → liè
    '陂': 'bei',

    // ===== 常用字（普通读音，用于自动生成） =====
    '西': 'xi', '坑': 'keng', '口': 'kou', '花': 'hua', '地': 'di', '湾': 'wan',
    '芳': 'fang', '村': 'cun', '黄': 'huang', '沙': 'sha', '寿': 'shou', '路': 'lu',
    '陈': 'chen', '家': 'jia', '祠': 'ci', '门': 'men', '公': 'gong', '园': 'yuan',
    '前': 'qian', '农': 'nong', '讲': 'jiang', '所': 'suo', '烈': 'lie', '士': 'shi',
    '陵': 'ling', '东': 'dong', '山': 'shan', '杨': 'yang', '体': 'ti', '育': 'yu',
    '中': 'zhong', '心': 'xin', '广': 'guang', '州': 'zhou', '站': 'zhan',
    '火': 'huo', '车': 'che', '林': 'lin', '和': 'he', '石': 'shi', '牌': 'pai',
    '桥': 'qiao', '岗': 'gang', '顶': 'ding', '华': 'hua', '师': 'shi',
    '五': 'wu', '天': 'tian', '河': 'he', '客': 'ke', '运': 'yun',
    '植': 'zhi', '物': 'wu', '龙': 'long', '洞': 'dong', '柯': 'ke', '木': 'mu',
    '高': 'gao', '塘': 'tang', '金': 'jin', '峰': 'feng', '苏': 'su', '元': 'yuan',
    '萝': 'luo', '香': 'xiang', '雪': 'xue', '燕': 'yan', '梅': 'mei',
    '京': 'jing', '溪': 'xi', '南': 'nan', '方': 'fang', '医': 'yi', '院': 'yuan',
    '同': 'tong', '永': 'yong', '泰': 'tai', '白': 'bai', '云': 'yun',
    '道': 'dao', '北': 'bei', '嘉': 'jia', '禾': 'he', '望': 'wang',
    '归': 'gui', '人': 'ren', '增': 'zeng', '机': 'ji', '场': 'chang',
    '赤': 'chi', '沙': 'sha', '潭': 'tan', '岗': 'gang', '新': 'xin', '造': 'zao',
    '官': 'guan', '洲': 'zhou', '深': 'shen', '井': 'jing', '城': 'cheng',
    '大': 'da', '学': 'xue', '赤': 'chi', '鹭': 'lu', '江': 'jiang',
    '新': 'xin', '港': 'gang', '磨': 'mo', '碟': 'die', '万': 'wan', '胜': 'sheng',
    '围': 'wei', '琶': 'pa', '车': 'che', '陂': 'bei', '双': 'shuang',
    '海': 'hai', '神': 'shen', '庙': 'miao', '头': 'tou', '夏': 'xia', '园': 'yuan',
    '白': 'bai', '江': 'jiang', '官': 'guan', '湖': 'hu', '坦': 'tan', '尾': 'wei',
    '贝': 'bei', '横': 'heng', '浔': 'xun', '峰': 'feng', '小': 'xiao',
    '羊': 'yang', '邨': 'cun', '科': 'ke', '韵': 'yun', '石': 'shi', '壁': 'bi',
    '会': 'hui', '谢': 'xie', '钟': 'zhong', '汉': 'han', '长': 'chang',
    '隆': 'long', '万': 'wan', '博': 'bo', '蕉': 'jiao', '庆': 'qing',
    '盛': 'sheng', '傍': 'bang', '低': 'di', '市': 'shi', '桥': 'qiao',
    '大': 'da', '林': 'lin', '石': 'shi', '植': 'zhi', '物': 'wu',
    '龙': 'long', '京': 'jing', '医': 'yi', '院': 'yuan', '同': 'tong',
    '永': 'yong', '泰': 'tai', '嘉': 'jia', '禾': 'he', '望': 'wang',
    '龙': 'long', '归': 'gui', '人': 'ren', '和': 'he', '增': 'zeng',
    '机': 'ji', '场': 'chang', '白': 'bai', '东': 'dong', '平': 'ping',
    '太': 'tai', '和': 'he', '竹': 'zhu', '料': 'liao', '钟': 'zhong',
    '落': 'luo', '潭': 'tan', '马': 'ma', '沥': 'li', '新': 'xin',
    '太': 'tai', '平': 'ping', '神': 'shen', '岗': 'gang', '赤': 'chi',
    '草': 'cao', '从': 'cong', '化': 'hua', '客': 'ke', '运': 'yun',
    '东': 'dong', '风': 'feng', '红': 'hong', '卫': 'wei',
    '员': 'yuan', '棠': 'tang', '黄': 'huang', '大': 'da', '观': 'guan',
    '神': 'shen', '舟': 'zhou', '科': 'ke', '学': 'xue', '水': 'shui',
    '金': 'jin', '坑': 'keng', '镇': 'zhen', '中': 'zhong', '新': 'xin',
    '凤': 'feng', '朱': 'zhu', '山': 'shan', '田': 'tian', '广': 'guang',
    '增': 'zeng', '城': 'cheng', '新': 'xin', '东': 'dong', '平': 'ping',
    '世': 'shi', '纪': 'ji', '莲': 'lian', '澜': 'lan', '魁': 'kui',
    '奇': 'qi', '季': 'ji', '华': 'hua', '同': 'tong', '济': 'ji',
    '祖': 'zu', '庙': 'miao', '普': 'pu', '君': 'jun', '朝': 'chao',
    '安': 'an', '桂': 'gui', '千': 'qian', '灯': 'deng', '湖': 'hu',
    '菊': 'ju', '树': 'shu', '鹤': 'he', '洞': 'dong',
    '张': 'zhang', '槎': 'cha', '石': 'shi', '湾': 'wan', '梁': 'liang',
    '登': 'deng', '洲': 'zhou', '仙': 'xian', '陈': 'chen', '林': 'lin',
    '岳': 'yue', '南': 'nan', '浦': 'pu', '漖': 'jiao', '驹': 'ju',
    '荣': 'rong', '良': 'liang', '环': 'huan', '伦': 'lun', '教': 'jiao',
    '广': 'guang', '北': 'bei', '滘': 'jiao', '高': 'gao', '锦': 'jin',
    '龙': 'long', '岳': 'yue', '步': 'bu', '美': 'mei', '的': 'di',
    '一': 'yi', '三': 'san', '上': 'shang', '下': 'xia', '业': 'ye',
    '丰': 'feng', '乐': 'le', '书': 'shu', '二': 'er', '亚': 'ya',
    '亭': 'ting', '何': 'he', '佛': 'fo', '保': 'bao', '健': 'jian',
    '儿': 'er', '八': 'ba', '六': 'liu', '兴': 'xing', '冲': 'chong',
    '凰': 'huang', '剧': 'ju', '加': 'jia', '务': 'wu', '动': 'dong',
    '卉': 'hui', '厚': 'hou', '叠': 'die', '台': 'tai', '器': 'qi',
    '团': 'tuan', '图': 'tu', '坊': 'fang', '坪': 'ping', '埔': 'pu',
    '堂': 'tang', '塔': 'ta', '墟': 'xu', '墩': 'dun', '如': 'ru',
    '妇': 'fu', '姬': 'ji', '孝': 'xiao', '宝': 'bao', '实': 'shi',
    '室': 'shi', '宫': 'gong', '寺': 'si', '少': 'shao', '居': 'ju',
    '展': 'zhan', '岛': 'dao', '岩': 'yan', '岭': 'ling', '岸': 'an',
    '峻': 'jun', '工': 'gong', '干': 'gan', '年': 'nian', '庄': 'zhuang',
    '康': 'kang', '开': 'kai', '彩': 'cai', '彭': 'peng', '德': 'de',
    '念': 'nian', '怡': 'yi', '意': 'yi', '慧': 'hui', '掌': 'zhang',
    '敦': 'dun', '文': 'wen', '旺': 'wang', '昌': 'chang', '晓': 'xiao',
    '景': 'jing', '智': 'zhi', '有': 'you', '板': 'ban', '果': 'guo',
    '枫': 'feng', '架': 'jia', '校': 'xiao', '梓': 'zi', '棣': 'di',
    '楼': 'lou', '欢': 'huan', '民': 'min', '汤': 'tang', '汽': 'qi',
    '洛': 'luo', '流': 'liu', '淘': 'tao', '清': 'qing', '源': 'yuan',
    '滨': 'bin', '爱': 'ai', '玉': 'yu', '珠': 'zhu', '界': 'jie',
    '盈': 'ying', '知': 'zhi', '福': 'fu', '禺': 'yu', '秀': 'xiu',
    '约': 'yue', '线': 'xian', '绿': 'lv', '罗': 'luo', '羌': 'qiang',
    '翔': 'xiang', '翠': 'cui', '翰': 'han', '联': 'lian', '聚': 'ju',
    '艺': 'yi', '药': 'yao', '萧': 'xiao', '虫': 'chong', '虹': 'hong',
    '融': 'rong', '街': 'jie', '裕': 'yu', '角': 'jiao', '议': 'yi',
    '识': 'shi', '贤': 'xian', '越': 'yue', '轨': 'gui', '边': 'bian',
    '逸': 'yi', '部': 'bu', '都': 'du', '醍': 'ti', '里': 'li',
    '铁': 'tie', '阁': 'ge', '雷': 'lei', '霄': 'xiao', '鞍': 'an',
    '顷': 'qing', '顺': 'shun', '飞': 'fei', '馆': 'guan', '验': 'yan',
    '鱼': 'yu', '鹅': 'e', '㘵': 'bu'
};

// ========== 词组级多音字表（优先于单字字典匹配） ==========
// 格式：词组 → 每个字的读音数组（长度必须等于词组汉字数）
// 注意：只写汉字，不含括号/数字/字母
const PINYIN_PHRASE_DICT = {
    // 「区」：区庄读 ōu，其余读 qū
    '区庄': ['ou', 'zhuang'],
    '区少年宫': ['qu', 'shao', 'nian', 'gong'],
    '虫雷': ['lei'],

    // 以后遇到类似情况，一行一个词
    // 例：'番禺': ['pan', 'yu'],
    // 例：'长湴': ['chang', 'ban'],
};

// 站名 → { py: 'quanzhuang', abbr: 'qz' }
let STATION_PINYIN_INDEX = {};

function stationToPinyin(name) {
    const chars = [...name];
    let py = '';
    let abbr = '';
    let i = 0;
    const MAX_PHRASE_LEN = 6;  // 词组最长 6 个字，够用

    while (i < chars.length) {
        let matched = false;

        // 从最长开始尝试词组匹配（贪心最长匹配）
        for (let len = Math.min(MAX_PHRASE_LEN, chars.length - i); len >= 2; len--) {
            const sub = chars.slice(i, i + len).join('');
            const arr = PINYIN_PHRASE_DICT[sub];
            if (arr) {
                py += arr.join('');
                abbr += arr.map(s => s[0]).join('');
                i += len;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // 单字回退
        const ch = chars[i];
        if (PINYIN_DICT[ch]) {
            py += PINYIN_DICT[ch];
            abbr += PINYIN_DICT[ch][0];
        } else if (/[\u4e00-\u9fa5]/.test(ch)) {
            // 未收录汉字：保留原字，便于审计
            py += ch;
            abbr += ch;
        }
        // 非汉字（括号、数字、字母）直接跳过
        i++;
    }

    return {py: py.toLowerCase(), abbr: abbr.toLowerCase()};
}

function buildStationPinyinIndex() {
    STATION_PINYIN_INDEX = {};
    for (const st of Object.keys(STATION_INDEX)) {
        STATION_PINYIN_INDEX[st] = stationToPinyin(st);
    }
}

/**
 * 扫描当前所有站名，列出 PINYIN_DICT 未收录的汉字。
 * 用法：控制台执行 auditPinyinDict()，会打印出可直接粘贴补丁的字典片段。
 */
function auditPinyinDict() {
    if (Object.keys(STATION_INDEX).length === 0 && Object.keys(LINE_STATIONS).length > 0) {
        buildStationIndex();
    }
    const missing = new Set();
    for (const st of Object.keys(STATION_INDEX)) {
        for (const ch of st) {
            if (/[\u4e00-\u9fa5]/.test(ch) && !PINYIN_DICT[ch]) {
                missing.add(ch);
            }
        }
    }
    const arr = [...missing].sort();
    console.log(`[拼音] 未收录汉字 ${arr.length} 个：\n${arr.join('')}`);
    console.log('[拼音] 补丁模板（请自行填写拼音）：');
    console.log(arr.map(c => `'${c}': '',`).join(' '));
    return arr;
}