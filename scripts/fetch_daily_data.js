const fs = require('fs');

// 封装一个带重试的 fetch（防止单次网络波动导致整个脚本失败）
async function fetchWithRetry(url, options = {}, retries = 3, timeout = 10000) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            const resp = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

/** 地铁名称规范化：线路名与站点名通用 */
function normalizeMetroText(str) {
    if (!str) return str;
    return str
        .replace(/^一号线/g, '1号线')
        .replace(/^二号线/g, '2号线')
        .replace(/^三北线/g, '3号线北')
        .replace(/^三号线/g, '3号线')
        .replace(/^四号线/g, '4号线')
        .replace(/^五号线/g, '5号线')
        .replace(/^六号线/g, '6号线')
        .replace(/^七号线/g, '7号线')
        .replace(/^八号线/g, '8号线')
        .replace(/^九号线/g, '9号线')
        .replace(/^十号线/g, '10号线')
        .replace(/^十一号线/g, '11号线')
        .replace(/^十二号线（二沙岛-大学城南）/g, '12号线东')
        .replace(/^十二号线$/g, '12号线西')
        .replace(/^十三号线/g, '13号线')
        .replace(/^十四号线/g, '14号线')
        .replace(/^十八号线/g, '18号线')
        .replace(/二十一号线/g, '21号线')
        .replace(/二十二号线/g, '22号线')
        .replace(/佛山地铁二号线|佛山地铁2号线/g, '佛山2号线')
        .replace(/佛山地铁三号线|佛山地铁3号线/g, '佛山3号线')
        .replace(/\(联和-佛山大学\)/g, '北')
        .replace(/^海珠有轨$/g, '海珠有轨1号线');
}

async function main() {
    console.log('开始获取所有线路和站点...');
    const lineUrl = 'https://apis.gzmtr.com/app-map/metroweb/linestation';

    // 1. 动态获取所有站点
    let linesData;
    try {
        linesData = await fetchWithRetry(lineUrl, { method: 'POST' });
    } catch (e) {
        console.error('获取线路站点失败，脚本终止：', e);
        process.exit(1); // 如果线路获取失败，退出脚本，让 GitHub Action 报警
    }

    const lines = linesData.businessObject;
    if (!lines || !Array.isArray(lines)) {
        console.error('线路数据格式错误');
        process.exit(1);
    }

    // 提取所有站名并去重
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

    // 2. 并发请求每个站点的运营时间
    const result = {};
    const concurrency = 5; // 并发数，不要设太高以免被风控
    let completed = 0;

    for (let i = 0; i < uniqueStations.length; i += concurrency) {
        const batch = uniqueStations.slice(i, i + concurrency);
        await Promise.all(batch.map(async (st) => {
            try {
                const timeUrl = `https://apis.gzmtr.com/app-map/serviceTime/list/${encodeURIComponent(st)}`;
                const data = await fetchWithRetry(timeUrl, { method: 'POST' }, 2); // 单站重试 2 次
                if (data.businessObject) {
                    result[st] = data.businessObject;
                }
            } catch (e) {
                console.error(`站点 ${st} 获取失败:`, e.message);
            } finally {
                completed++;
                if (completed % 50 === 0) {
                    console.log(`进度: ${completed}/${uniqueStations.length}`);
                }
            }
        }));
        // 每批之间停顿 50 毫秒，模拟真实网络请求，防止被封 IP
        await new Promise(r => setTimeout(r, 50));
    }

    // 3. 写入数据包（强制使用北京时间）
    const now = new Date();
    // 将 UTC 时间戳加上 8 小时的毫秒数
    const bjTime = new Date(now.getTime() + 8 * 3600 * 1000);

    // 用 getUTC* 方法读取偏移后的北京时间
    let year = bjTime.getUTCFullYear();
    let month = String(bjTime.getUTCMonth() + 1).padStart(2, '0');
    let day = String(bjTime.getUTCDate()).padStart(2, '0');
    let hours = bjTime.getUTCHours();

    // 如果是北京时间凌晨 5 点之前，日期算作前一天（运营日逻辑）
    if (hours < 5) {
        bjTime.setUTCDate(bjTime.getUTCDate() - 1);
        year = bjTime.getUTCFullYear();
        month = String(bjTime.getUTCMonth() + 1).padStart(2, '0');
        day = String(bjTime.getUTCDate()).padStart(2, '0');
    }

    const serviceDate = `${year}-${month}-${day}`;
    console.log(`当前计算出的服务日期 (北京时间): ${serviceDate}`);

    const outData = {
        serviceDate: serviceDate,
        records: result
    };

    // 确保 data 目录存在
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync('./data/daily-times.json', JSON.stringify(outData));
    console.log(`抓取完成！已成功保存 ${Object.keys(result).length} 个站点的数据到 data/daily-times.json`);
}

main();