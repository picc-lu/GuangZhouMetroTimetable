// shrink-mapdata.js
const fs = require('fs');
const path = require('path');

// 读取原文件内容
const fullPath = path.join(__dirname, 'data', 'mapData.full.js');
const content = fs.readFileSync(fullPath, 'utf8');

// 提取出 MAPDATA 对象（原文件是 const MAPDATA = {...};）
// 简单做法：用 eval 在沙箱中执行，拿到 MAPDATA
let MAPDATA;
try {
    // 为了避免污染全局，用 Function 构造一个局部作用域
    const fn = new Function('return ' + content.replace(/^const MAPDATA\s*=\s*/, '').replace(/;\s*$/, ''));
    MAPDATA = fn();
} catch (e) {
    console.error('解析原文件失败，请确认文件格式为 const MAPDATA = {...};', e);
    process.exit(1);
}

// 只提取 stationName.ch 中的 name 字段
const slimStationNameCh = {};
if (MAPDATA.stationName && MAPDATA.stationName.ch) {
    for (const [stationNo, info] of Object.entries(MAPDATA.stationName.ch)) {
        if (info && info.name) {
            slimStationNameCh[stationNo] = { name: info.name };
        }
    }
}

// 构造精简后的对象
const slimMAPDATA = {
    stationName: {
        ch: slimStationNameCh
    }
};

// 生成新的 mapData.js 内容
const output = `// 精简版 mapData.js - 仅保留 stationName.ch 的 name 字段
const MAPDATA = ${JSON.stringify(slimMAPDATA, null, 2)};
`;

// 写入到 data/mapData.js（覆盖原文件，建议先备份）
const outPath = path.join(__dirname, 'data', 'mapData.js');
fs.writeFileSync(outPath, output, 'utf8');
console.log('✅ 精简完成，已写入', outPath);
console.log('   站点数量：', Object.keys(slimStationNameCh).length);