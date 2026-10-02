// ========== 11 号线解析相关常量 ==========
const LINE11_NAME = '11号线';

// 11 号线"全程"记录跨批次累计计数器，用于区分 up/down
// 必须挂在模块级，否则增量解析时会丢状态
let _line11FullCounter = {};

// 11 号线的两种数据格式：
//   格式 A（新）：带 remark 字段，如 "外环全程"、"内环终点"，
//                或 toStationName 中带括号说明如 "XX(外环全程)"。
//   格式 B（旧）：toStationName 形如 "本站(null-全程)" 表示全程，
//                或 "龙潭(...)"、"赤沙(...)" 表示区间。
// 本解析器先尝试格式 A，若无法确定方向/类型再退回格式 B。
const LINE11_KEYWORD_OUTER = '外环';    // 外环 → up
const LINE11_KEYWORD_INNER = '内环';    // 内环 → down
const LINE11_KEYWORD_FULL = '全程';     // 全程 → full
const LINE11_KEYWORD_TERMINAL = ['终点', '区间']; // 终点/区间 → terminal
const LINE11_TERMINAL_STATIONS = ['龙潭', '赤沙']; // 两个区间终点

function initTimeSelectors() {
    const hourSel = document.getElementById('hour-select');
    const minSel = document.getElementById('minute-select');

    // 生成小时顺序：05→23, 00, 01（00/01 移到末尾）
    const hourOrder = [];
    for (let i = 5; i <= 23; i++) hourOrder.push(i);
    hourOrder.push(0, 1);

    for (const h of hourOrder) {
        const opt = document.createElement('option');
        opt.value = h.toString().padStart(2, '0');
        opt.textContent = h.toString().padStart(2, '0');
        hourSel.appendChild(opt);
    }

    for (let i = 0; i < 60; i += 5) {
        const opt = document.createElement('option');
        opt.value = i.toString().padStart(2, '0');
        opt.textContent = i.toString().padStart(2, '0');
        minSel.appendChild(opt);
    }

    hourSel.style.display = 'none';
    minSel.style.display = 'none';

    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = (Math.floor(now.getMinutes() / 5) * 5).toString().padStart(2, '0');
    hourSel.value = currentHour;
    minSel.value = currentMinute;

    // 小时触发器
    const hourWrapper = document.createElement('div');
    hourWrapper.className = 'hour-select-wrapper';
    hourWrapper.style.position = 'relative';
    hourWrapper.style.display = 'inline-block';

    const hourTrigger = document.createElement('div');
    hourTrigger.className = 'hour-trigger';
    hourTrigger.id = 'hour-trigger';
    hourTrigger.textContent = currentHour;
    hourTrigger.setAttribute('aria-haspopup', 'grid');
    hourTrigger.setAttribute('aria-expanded', 'false');

    const hourDropdown = document.createElement('div');
    hourDropdown.className = 'hour-dropdown';
    hourDropdown.id = 'hour-dropdown';
    hourDropdown.style.display = 'none';
    hourDropdown.setAttribute('role', 'grid');

    for (const h of hourOrder) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hour-btn';
        btn.dataset.hour = h.toString().padStart(2, '0');
        btn.textContent = h.toString().padStart(2, '0');
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const hour = this.dataset.hour;
            hourTrigger.textContent = hour;
            hourSel.value = hour;
            hourDropdown.style.display = 'none';
            hourTrigger.setAttribute('aria-expanded', 'false');
        });
        hourDropdown.appendChild(btn);
    }

    hourWrapper.appendChild(hourTrigger);
    hourWrapper.appendChild(hourDropdown);

    // 分钟触发器
    const minuteWrapper = document.createElement('div');
    minuteWrapper.className = 'minute-select-wrapper';
    minuteWrapper.style.position = 'relative';
    minuteWrapper.style.display = 'inline-block';

    const minuteTrigger = document.createElement('div');
    minuteTrigger.className = 'hour-trigger';
    minuteTrigger.id = 'minute-trigger';
    minuteTrigger.textContent = currentMinute;
    minuteTrigger.setAttribute('aria-haspopup', 'grid');
    minuteTrigger.setAttribute('aria-expanded', 'false');

    const minuteDropdown = document.createElement('div');
    minuteDropdown.className = 'hour-dropdown minute-dropdown';
    minuteDropdown.id = 'minute-dropdown';
    minuteDropdown.style.display = 'none';
    minuteDropdown.setAttribute('role', 'grid');

    for (let i = 0; i < 60; i += 5) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hour-btn';
        btn.dataset.minute = i.toString().padStart(2, '0');
        btn.textContent = i.toString().padStart(2, '0');
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const minute = this.dataset.minute;
            minuteTrigger.textContent = minute;
            minSel.value = minute;
            minuteDropdown.style.display = 'none';
            minuteTrigger.setAttribute('aria-expanded', 'false');
        });
        minuteDropdown.appendChild(btn);
    }

    minuteWrapper.appendChild(minuteTrigger);
    minuteWrapper.appendChild(minuteDropdown);

    const customPanel = document.getElementById('custom-time-panel');
    const minuteSpan = customPanel.querySelector('span');
    customPanel.insertBefore(hourWrapper, minuteSpan);
    customPanel.insertBefore(minuteWrapper, minuteSpan.nextSibling);

    hourTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const isHidden = hourDropdown.style.display === 'none';
        minuteDropdown.style.display = 'none';
        minuteTrigger.setAttribute('aria-expanded', 'false');
        if (isHidden) positionDropdownOnMobile(hourDropdown, hourTrigger, 'center');
        hourDropdown.style.display = isHidden ? 'grid' : 'none';
        this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    minuteTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const isHidden = minuteDropdown.style.display === 'none';
        hourDropdown.style.display = 'none';
        hourTrigger.setAttribute('aria-expanded', 'false');
        if (isHidden) positionDropdownOnMobile(minuteDropdown, minuteTrigger, 'right');
        minuteDropdown.style.display = isHidden ? 'grid' : 'none';
        this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    document.addEventListener('click', function(e) {
        if (!hourWrapper.contains(e.target) && !minuteWrapper.contains(e.target)) {
            hourDropdown.style.display = 'none';
            hourTrigger.setAttribute('aria-expanded', 'false');
            minuteDropdown.style.display = 'none';
            minuteTrigger.setAttribute('aria-expanded', 'false');
        }
    });
}

function updateRealTimeClock() {
    const clockSpan = document.getElementById('real-time-clock');
    if (!clockSpan) return;
    const now = new Date();
    const h = now.getHours().toString().padStart(2,'0');
    const m = now.getMinutes().toString().padStart(2,'0');
    clockSpan.textContent = `${h}:${m}`;
    if (currentCustomTime === null) updateLinesTime();
    scheduleNextMinuteTick();
}

function scheduleNextMinuteTick() {
    if (systemTimeoutId) clearTimeout(systemTimeoutId);
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(now.getMinutes() + 1, 0, 0);
    const delay = next - now;
    systemTimeoutId = setTimeout(() => {
        updateRealTimeClock();
    }, delay);
}

/** 移动端把下拉框定位到合适位置 */
function positionDropdownOnMobile(dropdown, trigger, align = 'center') {
    if (window.innerWidth > 768) {
        // 桌面端：恢复 CSS 默认定位
        dropdown.style.position = '';
        dropdown.style.top = '';
        dropdown.style.left = '';
        dropdown.style.right = '';
        dropdown.style.transform = '';
        dropdown.style.width = '';
        dropdown.style.maxWidth = '';
        return;
    }
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    // 分钟下拉框更窄，小时下拉框宽一些
    const maxW = dropdown.classList.contains('minute-dropdown') ? 240 : 400;
    const ddWidth = Math.min(vw - 32, maxW);

    let left;
    if (align === 'right') {
        // 右边缘对齐到触发框右边缘，但不超出屏幕
        left = Math.min(rect.right - ddWidth, vw - ddWidth - 16);
        left = Math.max(16, left);
    } else if (align === 'left') {
        left = Math.max(16, Math.min(rect.left, vw - ddWidth - 16));
    } else {
        // 居中
        left = (vw - ddWidth) / 2;
    }

    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 6) + 'px';
    dropdown.style.left = left + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.transform = 'none';
    dropdown.style.width = ddWidth + 'px';
    dropdown.style.maxWidth = 'none';
}

/**
 * 解析单条 11 号线的运营时间记录，直接写入 lineDirectionTime。
 * @param {Object} rec - 一条原始记录
 * @param {Object} fullCounter - 跨记录共享的全程计数器（用于区分上下行全程）
 */
function parseLine11Record(rec, fullCounter) {
    const station = rec.stationName;
    const to = rec.toStationName;
    const remark = rec.remark || '';
    const start = rec.startTime;
    const end = rec.endTime;

    if (!lineDirectionTime[LINE11_NAME]) lineDirectionTime[LINE11_NAME] = {};
    if (!lineDirectionTime[LINE11_NAME][station]) {
        lineDirectionTime[LINE11_NAME][station] = {
            upFull: null,
            upTerminal: null,
            downFull: null,
            downTerminal: null
        };
    }

    let dir = null;   // 'up' 或 'down'
    let type = null;  // 'full' 或 'terminal'

    // --- 第一步：从 remark 或 to 括号中提取方向 ---
    if (remark.includes(LINE11_KEYWORD_OUTER)) {
        dir = 'up';
    } else if (remark.includes(LINE11_KEYWORD_INNER)) {
        dir = 'down';
    } else {
        const match = to.match(/\(([^)]+)\)/);
        if (match) {
            const bracket = match[1];
            if (bracket.includes(LINE11_KEYWORD_OUTER)) dir = 'up';
            else if (bracket.includes(LINE11_KEYWORD_INNER)) dir = 'down';
        }
    }

    // --- 提取类型 ---
    if (dir) {
        if (remark.includes(LINE11_KEYWORD_FULL)) {
            type = 'full';
        } else if (LINE11_KEYWORD_TERMINAL.some(k => remark.includes(k))) {
            type = 'terminal';
        } else {
            const match = to.match(/\(([^)]+)\)/);
            if (match) {
                const bracket = match[1];
                if (bracket.includes(LINE11_KEYWORD_FULL)) type = 'full';
                else if (LINE11_KEYWORD_TERMINAL.some(k => bracket.includes(k))) type = 'terminal';
            }
        }
    }

    // --- 第二步：若第一步无法确定，改用旧格式规则 ---
    if (!dir || !type) {
        if (to.includes('null-全程') || (to.startsWith(station) && !to.includes('('))) {
            type = 'full';
        } else if (LINE11_TERMINAL_STATIONS.some(k => to.includes(k))) {
            type = 'terminal';
        } else {
            console.log(`[解析-11号线] 无法识别类型，忽略：`, { station, to, remark });
            return;
        }

        if (type === 'full') {
            if (!fullCounter[LINE11_NAME]) fullCounter[LINE11_NAME] = {};
            if (!fullCounter[LINE11_NAME][station]) fullCounter[LINE11_NAME][station] = 0;
            fullCounter[LINE11_NAME][station]++;
            const count = fullCounter[LINE11_NAME][station];
            if (count === 1) {
                dir = 'up';
            } else if (count === 2) {
                dir = 'down';
            } else {
                console.log(`[解析-11号线] 多余全程记录，忽略：`, { station, to });
                return;
            }
        } else {
            if (to.includes('龙潭')) dir = 'up';
            else if (to.includes('赤沙')) dir = 'down';
            else {
                console.log(`[解析-11号线] 无法确定区间方向，忽略：`, { station, to });
                return;
            }
        }
    }

    const startMin = timeStrToMinutes(start);
    const endMin = timeStrToMinutes(end);
    if (startMin === null || endMin === null) {
        console.warn(`[解析] 时间转换失败: start=${start}, end=${end}`);
        return;
    }

    const field = dir + (type === 'full' ? 'Full' : 'Terminal');
    const existing = lineDirectionTime[LINE11_NAME][station][field];
    if (!existing) {
        lineDirectionTime[LINE11_NAME][station][field] = { first: startMin, last: endMin };
    } else {
        existing.first = Math.min(existing.first, startMin);
        existing.last = Math.max(existing.last, endMin);
    }
}

function parseTimeRecords(records, options = {}) {
    const { skipRender = false, append = false } = options;
    console.log(`[解析] 开始解析运营时间记录，总数：${records.length}（${append ? '增量' : '全量'}）`);

    if (!append) {
        lineDirectionTime = {};
        _line11FullCounter = {};
    }
    const fullCounter = _line11FullCounter;

    records.forEach((rec) => {
        const line = rec.lineCn;
        const station = rec.stationName;
        const to = rec.toStationName;
        const start = rec.startTime;
        const end = rec.endTime;
        if (!line || !station || !start || !end || start === '——') return;

        const stations = LINE_STATIONS[line];
        if (!stations) {
            console.warn(`[解析] 线路 ${line} 不在线路数据中，忽略`);
            return;
        }

        // 11号线特殊处理：交给专用解析函数
        if (line === LINE11_NAME) {
            parseLine11Record(rec, fullCounter);
            return;
        }

        // 非11号线：多终点支持
        const idxCurrent = stations.indexOf(station);
        const idxTo = stations.indexOf(to);
        let direction = null;
        if (idxCurrent !== -1 && idxTo !== -1) {
            if (idxTo > idxCurrent) direction = 'up';
            else if (idxTo < idxCurrent) direction = 'down';
        }
        if (!direction) return;

        if (!lineDirectionTime[line]) lineDirectionTime[line] = {};
        if (!lineDirectionTime[line][station]) {
            lineDirectionTime[line][station] = { up: [], down: [] };
        }

        const startMin = timeStrToMinutes(start);
        const endMin = timeStrToMinutes(end);
        if (startMin === null || endMin === null) return;

        const dirArray = lineDirectionTime[line][station][direction];
        let existing = dirArray.find(item => item.to === to);
        if (existing) {
            existing.first = Math.min(existing.first, startMin);
            existing.last = Math.max(existing.last, endMin);
        } else {
            dirArray.push({ to: to, first: startMin, last: endMin });
        }
    });

    // 确保每条线路的每个站点都有默认值
    for (let line in LINE_STATIONS) {
        if (!lineDirectionTime[line]) lineDirectionTime[line] = {};
        LINE_STATIONS[line].forEach(st => {
            if (!lineDirectionTime[line][st]) {
                if (line === LINE11_NAME) {
                    lineDirectionTime[line][st] = {
                        upFull: null, upTerminal: null,
                        downFull: null, downTerminal: null
                    };
                } else {
                    lineDirectionTime[line][st] = { up: [], down: [] };
                }
            }
        });
    }

    // 修复：原来无条件先调一次 renderAllLines()，即使 skipRender=true 也会全量重绘
    if (!skipRender) {
        renderAllLines();
    }
}