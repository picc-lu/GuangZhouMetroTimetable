# 广州地铁·运营时间展示

> 实时查询广州地铁、佛山地铁及有轨电车的首末班车时间，支持自定义时间模拟、站点搜索、附近站点、路径规划等功能。

<p align="center">
  <img src="icons/icon-384.png" alt="图标" width="96" height="96">
</p>

<p align="left">
  <a href="https://picc-lu.github.io/GuangZhouMetroTimetable/"><img alt="在线访问" src="https://img.shields.io/badge/在线访问-picc--lu.github.io-c5192d?style=flat-square"></a>
  <img alt="PWA" src="https://img.shields.io/badge/PWA-可安装-5a0fc8?style=flat-square">
  <img alt="无构建" src="https://img.shields.io/badge/构建-无需构建-2e7d32?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
</p>

---

## ✨ 功能

### 🚇 运营时间查询
- 展示广州地铁、佛山地铁、APM、有轨电车各线路各站首末班车时间
- 支持自定义时间模拟（早于/晚于当前时刻查看运营状态）
- 支持应用系统实时时间，整分自动刷新
- 每日 **5:00** 自动拉取当日最新运营数据，凌晨时段提示"昨日数据"

### 🔍 站点搜索与附近站点
- 支持中文站名、拼音全拼、拼音首字母搜索（`datang` / `dt` → 大塘）
- 附近站点：GPS 定位 + WGS84→GCJ02 坐标转换，直线距离展示前 5 个最近站点
- 一键跳转线路详情并高亮目标站点

### 📋 线路详情弹窗
- 竖向线路图，双向运营状态一目了然
- 换乘线路徽章、有轨电车"出闸换乘"标识
- 自动识别早/晚时段的首末班车显示逻辑
- 剩余时间 ≤ 60 分钟时展示"剩 X 分钟"气泡徽章

### 🧭 路径规划
- 基于 Dijkstra + Yen K 短路的 K 条最短路径推荐
- 末班车可达性检查：到达站点时若已无末班车，路径自动排除
- 反向规划：输入目标到达时刻，二分查找最晚出发时刻
- 换乘指引：站台门号、步行时长、候车时刻、剩余分钟
- 高级设置：
  - 最快优先 / 保守优先（末班车时间充裕）
  - 单次换乘步行时长上限
  - 不走站外换乘（琶洲 8↔11、五羊邨 5↔10）
  - 步行速度（悠闲 1.2 / 中等 1.5 / 快走 1.8 m/s）
- 手工维护的**短线车**（折返车）与 **3 号线贯通车**数据

### 🎨 交互与体验
- 夜间模式（跟随系统偏好，可手动切换）
- 搜索结果、附近站点、路径规划三处一键跳转
- 站点/线路自动补全、起终点一键交换
- 站点列表智能折叠，长路径默认收起
- iOS 键盘弹出时下拉列表自动避让
- PWA 离线可用，Service Worker 自动更新

---

## 🛠 技术栈

**纯前端项目**，无需构建工具、无需依赖安装，双击 `index.html` 即可运行（推荐用本地静态服务器以获得 PWA 完整体验）。

| 分类 | 说明 |
|---|---|
| 前端 | 原生 HTML / CSS / JavaScript（ES6+），无框架、无打包 |
| PWA | `manifest.json` + Service Worker（Cache First） |
| 缓存 | IndexedDB（运营数据，按"运营日"命中）+ localStorage（用户偏好） |
| 布局 | CSS Grid / Flexbox / 媒体查询响应式 |
| 算法 | Dijkstra（二叉最小堆）+ Yen K 短路 |
| iOS 适配 | `VisualViewport` API、`position: fixed` 坐标系补偿 |
| 主题 | CSS 变量 + `[data-theme="dark"]` 属性切换 |

---

## 🚀 本地运行

因为使用了 Service Worker 和 `fetch` 加载 JSON 数据，**需要通过 HTTP 协议访问**（直接 `file://` 打开会导致跨域和 SW 注册失败）。

```bash
# 方式一：Python 自带静态服务器
python -m http.server 8080

# 方式二：Node.js（需 npm）
npx serve -p 8080

# 方式三：VS Code 的 Live Server 插件 → 右键 index.html → Open with Live Server
```

然后访问 `http://localhost:8080`。

### 部署到 GitHub Pages

本项目已适配 GitHub Pages，直接推送仓库并在仓库设置中开启 Pages（指向 `main` 分支根目录）即可。`manifest.json` 中的 `start_url` 与 `scope` 均为相对路径，无需额外配置。

---

## 🌐 数据来源

- **运营时间数据**：广州地铁官方 API（`apis.gzmtr.com`）
- **线路结构**：`data/metro-graph.json`（路径规划图，由维护者根据官方线网生成）
- **站点坐标**：`data/GZCoords.js`（GCJ02 坐标系）
- **短线车（折返车）**：`data/short-services.json`（手工维护，官方 API 未暴露）
- **3 号线贯通车**：`data/line3-through-train.json`（手工推算，仅覆盖海傍→机场北方向）

---

## 📖 免责声明

- 本项目为个人开源项目，**与广州地铁集团无关**。
- 所有运营数据来源于广州地铁官方 API，**仅供参考**。实际乘车请以车站现场公告与官方 APP 为准。
- 路径规划算法基于静态线路图与运营时间推算，不包含突发故障、临时调整、大客流管控等动态因素。
- 短线车、贯通车数据为手工整理，可能存在遗漏或滞后。

---

## 👤 作者

**B站 [AB君小子](https://space.bilibili.com/586431)**

如果本项目对你有帮助，欢迎在 B 站关注支持～

---

## 📄 许可证

本项目代码仅供学习与个人使用，未经许可不得用于商业用途。

地铁运营数据版权归广州地铁所有。
```