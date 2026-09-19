function initTimeSelectors() {
    const hourSel = document.getElementById('hour-select');
    const minSel = document.getElementById('minute-select');

    for (let i = 0; i < 24; i++) {
        const opt = document.createElement('option');
        opt.value = i.toString().padStart(2, '0');
        opt.textContent = i.toString().padStart(2, '0');
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

    for (let i = 0; i < 24; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hour-btn';
        btn.dataset.hour = i.toString().padStart(2, '0');
        btn.textContent = i.toString().padStart(2, '0');
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
        hourDropdown.style.display = isHidden ? 'grid' : 'none';
        this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    minuteTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const isHidden = minuteDropdown.style.display === 'none';
        hourDropdown.style.display = 'none';
        hourTrigger.setAttribute('aria-expanded', 'false');
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
    if (currentCustomTime === null) renderAllLines();
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

function parseTimeRecords(records) {
    console.log('[解析] 开始解析运营时间记录，总数：', records.length);
    lineDirectionTime = {};
    const fullCounter = {}; // 用于11号线全程计数器

    records.forEach((rec) => {
        const line = rec.lineCn;
        const station = rec.stationName;
        const to = rec.toStationName;
        const remark = rec.remark || '';
        const start = rec.startTime;
        const end = rec.endTime;
        if (!line || !station || !start || !end || start === '——') return;

        const stations = LINE_STATIONS[line];
        if (!stations) {
            console.warn(`[解析] 线路 ${line} 不在线路数据中，忽略`);
            return;
        }

        // 11号线特殊处理
        if (line === '11号线') {
            if (!lineDirectionTime[line]) lineDirectionTime[line] = {};
            if (!lineDirectionTime[line][station]) {
                lineDirectionTime[line][station] = {
                    upFull: null,
                    upTerminal: null,
                    downFull: null,
                    downTerminal: null
                };
            }

            let dir = null;   // 'up' 或 'down'
            let type = null;  // 'full' 或 'terminal'

            // --- 第一步：尝试从 remark 或 to 括号中提取（第一种数据）---
            if (remark.includes('外环')) {
                dir = 'up';
            } else if (remark.includes('内环')) {
                dir = 'down';
            } else {
                const match = to.match(/\(([^)]+)\)/);
                if (match) {
                    const bracket = match[1];
                    if (bracket.includes('外环')) dir = 'up';
                    else if (bracket.includes('内环')) dir = 'down';
                }
            }

            if (dir) {
                if (remark.includes('全程')) {
                    type = 'full';
                } else if (remark.includes('终点') || remark.includes('区间')) {
                    type = 'terminal';
                } else {
                    const match = to.match(/\(([^)]+)\)/);
                    if (match) {
                        const bracket = match[1];
                        if (bracket.includes('全程')) type = 'full';
                        else if (bracket.includes('终点') || bracket.includes('区间')) type = 'terminal';
                    }
                }
            }

            // --- 第二步：如果未通过第一种确定，则使用第二种数据规则（null-全程格式）---
            if (!dir || !type) {
                if (to.includes('null-全程') || (to.startsWith(station) && !to.includes('('))) {
                    type = 'full';
                } else if (to.includes('龙潭') || to.includes('赤沙')) {
                    type = 'terminal';
                } else {
                    console.log(`[解析-11号线] 无法识别类型，忽略：`, {line, station, to, remark});
                    return;
                }

                if (type === 'full') {
                    if (!fullCounter[line]) fullCounter[line] = {};
                    if (!fullCounter[line][station]) fullCounter[line][station] = 0;
                    fullCounter[line][station]++;
                    if (fullCounter[line][station] === 1) {
                        dir = 'up';
                    } else if (fullCounter[line][station] === 2) {
                        dir = 'down';
                    } else {
                        console.log(`[解析-11号线] 多余全程记录，忽略：`, {line, station, to});
                        return;
                    }
                } else {
                    if (to.includes('龙潭')) dir = 'up';
                    else if (to.includes('赤沙')) dir = 'down';
                    else {
                        console.log(`[解析-11号线] 无法确定区间方向，忽略：`, {line, station, to});
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
            const existing = lineDirectionTime[line][station][field];
            if (!existing) {
                lineDirectionTime[line][station][field] = { first: startMin, last: endMin };
            } else {
                existing.first = Math.min(existing.first, startMin);
                existing.last = Math.max(existing.last, endMin);
            }
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
                if (line === '11号线') {
                    lineDirectionTime[line][st] = {
                        upFull: null,
                        upTerminal: null,
                        downFull: null,
                        downTerminal: null
                    };
                } else {
                    lineDirectionTime[line][st] = { up: [], down: [] };
                }
            }
        });
    }
    renderAllLines();
}