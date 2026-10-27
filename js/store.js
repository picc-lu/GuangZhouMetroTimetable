// ========== 全局状态仓库 ==========
// 所有跨模块共享的可变状态集中在此，其他文件只读取/赋值，不再各自 let 声明。
// 加载顺序：constants.js → store.js → 其余所有 js

// ========== 运行环境检测 ==========
// B站 Toy 是嵌入在 iframe 中的，且通常包含 bilibili 域名特征
const IS_TOY_ENV = window.self !== window.top ||
    location.hostname.includes('bilibili') ||
    location.href.includes('/toy/');

// ---- 数据层 ----
let rawServiceRecords = [];
let LINE_STATIONS = {};
let LINE_COLORS = { ...HARDCODED_COLORS };
let lineDirectionTime = {};
let STATION_INDEX = {};
let STATION_COORDS = null;   // 由 coords.js 赋值

// ---- 主界面状态 ----
let currentCustomTime = null;
let systemTimeoutId = null;
let scrollPositions = {};
let selectedLines = new Set();
let rowHeight = 45;
let isFetchingData = false;

// ---- 模态框状态 ----
let modalOverlay = null;
let modalRefreshTimer = null;
let modalClockTimer = null;
let currentModalLine = null;
const modalHistory = [];
const modalScrollPositions = {};
let bodyScrollY = 0;

// ---- API 进度状态 ----
let failedStations = [];
let _gzCompletedStations = new Set();   // 替代原 window._gzCompletedStations

// ---- 渲染调度状态 ----
let _renderScheduled = false;