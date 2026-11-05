// ========== 路径规划 UI · 偏好设置与历史记录 ==========

const ROUTE_PREFS_KEY   = 'route_prefs';
const ROUTE_HISTORY_KEY = 'route_history';
const ROUTE_HISTORY_MAX = 5;

function loadRoutePrefs() {
    try {
        const raw = localStorage.getItem(ROUTE_PREFS_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;
        // 兼容旧版本：丢弃已废弃的 advancedOpen 字段
        delete obj.advancedOpen;
        return obj;
    } catch (_) { return null; }
}

function saveRoutePrefs(prefs) {
    try { localStorage.setItem(ROUTE_PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
}

function loadRouteHistory() {
    try {
        const raw = localStorage.getItem(ROUTE_HISTORY_KEY);
        if (!raw) return { starts: [], ends: [] };
        const obj = JSON.parse(raw);
        return {
            starts: Array.isArray(obj.starts) ? obj.starts : [],
            ends:   Array.isArray(obj.ends)   ? obj.ends   : [],
        };
    } catch (_) {
        return { starts: [], ends: [] };
    }
}

function saveRouteHistory(history) {
    try { localStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
}

function pushRouteHistory(kind, station) {
    if (!station) return;
    const history = loadRouteHistory();
    const arr = kind === 'start' ? history.starts : history.ends;
    const idx = arr.indexOf(station);
    if (idx >= 0) arr.splice(idx, 1);
    arr.unshift(station);
    if (arr.length > ROUTE_HISTORY_MAX) arr.length = ROUTE_HISTORY_MAX;
    saveRouteHistory(history);
}

function getRouteHistoryArr(kind) {
    const history = loadRouteHistory();
    return kind === 'start' ? history.starts : history.ends;
}

function routeHistoryKind(inputEl) {
    if (!inputEl) return null;
    if (inputEl.id === 'route-start') return 'start';
    if (inputEl.id === 'route-end')   return 'end';
    return null;
}

/** 把保存的偏好应用到弹窗 UI */
function applyRoutePrefs(ov) {
    if (!ov) return;
    const prefs = loadRoutePrefs();
    if (!prefs) return;

    // 排序模式
    if (['conservative', 'fastest', 'fewer-transfers'].includes(prefs.sortMode)) {
        const radio = ov.querySelector(`input[name="route-sort"][value="${prefs.sortMode}"]`);
        if (radio) radio.checked = true;
    }

    // 时间模式
    if (typeof prefs.arriveMode === 'boolean') {
        _routeArriveMode = prefs.arriveMode;
        const wrap = ov.querySelector('#route-time-mode');
        if (wrap) {
            wrap.querySelectorAll('.route-time-mode-btn').forEach(b => {
                b.classList.toggle('active',
                    (b.dataset.mode === 'arrive') === _routeArriveMode);
            });
            // 滑块动画：同步容器类
            wrap.classList.toggle('mode-arrive', _routeArriveMode);
        }
        const nowBtn = ov.querySelector('#route-now');
        if (nowBtn) nowBtn.style.display = _routeArriveMode ? 'none' : '';
    }

    // 单次换乘上限
    const mtc = ov.querySelector('#route-max-transfer-check');
    const mti = ov.querySelector('#route-max-transfer-min');
    if (mtc && mti) {
        if (prefs.maxTransferChecked) {
            mtc.checked = true;
            mti.disabled = false;
            if (typeof prefs.maxTransferMin === 'number' &&
                prefs.maxTransferMin >= 0 && prefs.maxTransferMin <= 60) {
                mti.value = String(prefs.maxTransferMin);
            }
        } else {
            mtc.checked = false;
            mti.disabled = true;
        }
    }

    // 步行速度
    if (prefs.walkSpeed) {
        const walkRadio = ov.querySelector(`input[name="route-walk-speed"][value="${prefs.walkSpeed}"]`);
        if (walkRadio) walkRadio.checked = true;
    }

    // 不走站外换乘
    const aoc = ov.querySelector('#route-avoid-outdoor-check');
    if (aoc) aoc.checked = !!prefs.avoidOutOfStation;

    // 尽量不走客控中的换乘站
    const acc = ov.querySelector('#route-avoid-ctrl-check');
    if (acc) acc.checked = !!prefs.avoidCtrlTransfer;

    // 不再恢复 advancedOpen：每次打开弹窗都默认收起
}

// ========== 会话恢复机制 ==========
const ROUTE_SESSION_KEY = 'gz_route_session_state';

// 保存当前查询状态
function saveRouteSession() {
    if (!_routeOverlay) return;

    // 判断弹窗是否打开且有起终点
    const startInput = _routeOverlay.querySelector('#route-start');
    const endInput = _routeOverlay.querySelector('#route-end');
    if (!startInput || !endInput || !startInput.value.trim() || !endInput.value.trim()) return;

    const state = {
        start: startInput.value.trim(),
        end: endInput.value.trim(),
        // 时间设置
        departMin: _routeDepartMin,
        arriveMode: _routeArriveMode,
        // 排序
        sortMode: _routeOverlay.querySelector('input[name="route-sort"]:checked')?.value || 'fastest',
        // 高级设置
        maxTransferChecked: _routeOverlay.querySelector('#route-max-transfer-check')?.checked,
        maxTransferMin: _routeOverlay.querySelector('#route-max-transfer-min')?.value,
        avoidOutdoor: _routeOverlay.querySelector('#route-avoid-outdoor-check')?.checked,
        avoidCtrl: _routeOverlay.querySelector('#route-avoid-ctrl-check')?.checked,
        walkSpeed: _routeOverlay.querySelector('input[name="route-walk-speed"]:checked')?.value,
        // 展开的卡片（用路径节点拼接作为唯一ID）
        expandedCard: _routeOverlay.querySelector('.route-card.expanded')?.dataset.pathKey || null
    };

    try {
        localStorage.setItem(ROUTE_SESSION_KEY, JSON.stringify(state));
    } catch (_) {}
}

// 读取并清空状态
function popRouteSession() {
    try {
        const raw = localStorage.getItem(ROUTE_SESSION_KEY);
        if (!raw) return null;
        localStorage.removeItem(ROUTE_SESSION_KEY); // 读取后即焚，防止反复提示
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

// 清除状态（用户主动关闭弹窗时调用）
function clearRouteSession() {
    localStorage.removeItem(ROUTE_SESSION_KEY);
}