const fs = require('fs');

// 伪装成浏览器，防止被官方 API 拦截
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.gzmtr.com/',
    'Origin': 'https://www.gzmtr.com'
};

async function fetchWithRetry(url, options = {}, retries = 3, timeout = 10000) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            const resp = await fetch(url, {
                ...options,
                headers: { ...HEADERS, ...options.headers },
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

function normalizeMetroText(str) {
    if (!str) return str;
    return str
        .replace(/^一号线/g, '1号线')
        .replace(/^二号线/g, '2号线')
        // ... (请把你前端 api.js 里的 normalizeMetroText 完整复制过来)
        .replace(/^海珠有轨$/g, '海珠有轨1号线');
}

async function main() {
    console.log('开始获取所有线路和站点...');
    const lineUrl = 'https://apis.gzmtr.com/app-map/metroweb/linestation';

    let linesData;
    try {
        linesData = await fetchWithRetry(lineUrl, { method: 'POST' });
    } catch (e) {
        console.error('获取线路站点失败，脚本终止：', e);
        process.exit(1);
    }

    const lines = linesData.businessObject;
    if (!lines || !Array.isArray(lines)) {
        console.error('线路数据格式错误');
        process.exit(1);
    }

    const allStations = new Set();
    lines.forEach(line => {
        if (line.stations) {
            line.stations.forEach(st => {
                const name = normalizeMetroText(st.stationName);
                if (name) allStations.add(name);
            });
        }
    });

    const uniqueStations = Array.from(allStations);
    console.log(`成功提取到 ${uniqueStations.length} 个独立站点。开始抓取运营时间...`);

    const result = {};
    const concurrency = 5;

    // 第一次抓取
    for (let i = 0; i < uniqueStations.length; i += concurrency) {
        const batch = uniqueStations.slice(i, i + concurrency);
        await Promise.all(batch.map(async (st) => {
            try {
                const timeUrl = `https://apis.gzmtr.com/app-map/serviceTime/list/${encodeURIComponent(st)}`;
                const data = await fetchWithRetry(timeUrl, { method: 'POST' }, 2);
                if (data.businessObject) {
                    result[st] = data.businessObject;
                }
            } catch (e) {
                console.error(`站点 ${st} 第一次抓取失败`);
            }
        }));
        await new Promise(r => setTimeout(r, 500));
    }

    // ====== 核心新增：检查遗漏并补抓 ======
    const missingStations = uniqueStations.filter(st => !result[st] || result[st].length === 0);
    if (missingStations.length > 0) {
        console.log(`⚠️ 发现有 ${missingStations.length} 个站点缺失，正在尝试补抓...`);
        for (let i = 0; i < missingStations.length; i += 2) { // 补抓时并发更低
            const batch = missingStations.slice(i, i + 2);
            await Promise.all(batch.map(async (st) => {
                try {
                    // 针对补抓，增加重试次数，延长超时时间
                    const timeUrl = `https://apis.gzmtr.com/app-map/serviceTime/list/${encodeURIComponent(st)}`;
                    const data = await fetchWithRetry(timeUrl, { method: 'POST' }, 5, 15000);
                    if (data.businessObject) {
                        result[st] = data.businessObject;
                        console.log(`✅ 补抓成功: ${st}`);
                    }
                } catch (e) {
                    console.error(`❌ 补抓依然失败: ${st}`);
                }
            }));
            await new Promise(r => setTimeout(r, 1000)); // 补抓间隔久一点
        }
    }

    // 最终缺失统计
    const finalMissing = uniqueStations.filter(st => !result[st]);
    if (finalMissing.length > 0) {
        console.warn(`🚨 最终仍有 ${finalMissing.length} 个站点缺失数据:`, finalMissing.join(', '));
    } else {
        console.log('🎉 完美！所有站点数据均已抓取成功。');
    }

    // 写入数据包（强制北京时间）
    const now = new Date();
    const bjTime = new Date(now.getTime() + 8 * 3600 * 1000);
    let year = bjTime.getUTCFullYear();
    let month = String(bjTime.getUTCMonth() + 1).padStart(2, '0');
    let day = String(bjTime.getUTCDate()).padStart(2, '0');
    let hours = bjTime.getUTCHours();
    if (hours < 5) {
        bjTime.setUTCDate(bjTime.getUTCDate() - 1);
        year = bjTime.getUTCFullYear();
        month = String(bjTime.getUTCMonth() + 1).padStart(2, '0');
        day = String(bjTime.getUTCDate()).padStart(2, '0');
    }
    const serviceDate = `${year}-${month}-${day}`;

    const outData = { serviceDate: serviceDate, records: result };
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync('./data/daily-times.json', JSON.stringify(outData));
    console.log(`抓取完成！已成功保存 ${Object.keys(result).length} 个站点的数据。`);
}

main();