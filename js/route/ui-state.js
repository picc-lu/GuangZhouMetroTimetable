// ========== 路径规划 UI · 全局状态与通用工具 ==========

// ---- 规划模式状态 ----
let _routeArriveMode = false;         // false = 出发模式；true = 到达模式
let _routeLastArrivedAt = null;       // 反向规划：最晚出发时刻（分钟）
let _routeActiveDepartMin = null;     // 当前规划所用的出发时刻（供 getSegmentDirection 使用）

// ---- 弹窗实例 ----
let _routeOverlay = null;
let _routeDepartMin = null;

// ---- 事件绑定标记 ----
let _routeTimeDocClickBound = false;

// ---- 设备识别 ----
const _isIOSDevice = (() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
})();

// ---- 视口辅助 ----
/**
 * 当前可视区尺寸（键盘弹出时 visualViewport 更准确）。
 *  - width / height: 可视区尺寸
 *  - offsetTop: iOS 上键盘弹出时 visualViewport 相对 layout viewport 上推的量
 */
function getVisualViewport() {
    const vv = window.visualViewport;
    if (vv) {
        return {
            width: vv.width,
            height: vv.height,
            offsetTop: vv.offsetTop || 0,
        };
    }
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetTop: 0,
    };
}

// ---- 输入框点击自动全选 ----
function enableSelectAllOnFocus(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('focus', () => {
        setTimeout(() => {
            if (document.activeElement !== inputEl) return;
            try { inputEl.select(); } catch (_) {}
        }, 0);
    });
}