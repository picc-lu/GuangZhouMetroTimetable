// ========== 界面辅助函数 ==========

function populateLineFilter() {
    console.log('[筛选] 开始 populateLineFilter');
    const select = document.getElementById('line-filter');
    select.innerHTML = '';
    const allLines = Object.keys(LINE_STATIONS).filter(line => LINE_COLORS[line]);
    console.log('[筛选] 所有有颜色的线路：', allLines);
    allLines.forEach(line => {
        const option = document.createElement('option');
        option.value = line;
        option.textContent = line;
        option.selected = true;
        select.appendChild(option);
    });
    selectedLines.clear();
    allLines.forEach(line => selectedLines.add(line));
    console.log('[筛选] 最终 selectedLines：', Array.from(selectedLines));
}

function applyFilter() {
    const select = document.getElementById('line-filter');
    selectedLines.clear();
    for (let option of select.options) {
        if (option.selected) selectedLines.add(option.value);
    }
    renderAllLines();
    populateLineButtons();
}

function populateLineButtons() {
    console.log('[按钮] 开始 populateLineButtons');
    const container = document.getElementById('line-buttons-row');
    if (!container) return;
    container.innerHTML = '';

    const lines = Object.entries(LINE_STATIONS)
        .filter(([line]) => LINE_COLORS[line] && selectedLines.has(line))
        .map(([line]) => line);
    console.log('[按钮] 生成的线路按钮：', lines);

    lines.forEach(line => {
        const btn = document.createElement('button');
        btn.className = 'line-button';
        btn.textContent = line;
        btn.style.backgroundColor = LINE_COLORS[line];
        btn.style.color = getContrastColor(LINE_COLORS[line]);
        btn.addEventListener('click', () => {
            const lineContainers = document.querySelectorAll('.line-container');
            for (let container of lineContainers) {
                const meta = container.querySelector('.line-meta .line-name');
                if (meta && meta.textContent.includes(line)) {
                    const controls = document.querySelector('.controls');
                    const controlsHeight = controls ? controls.offsetHeight : 0;
                    const targetPosition = container.offsetTop - controlsHeight;
                    window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                    break;
                }
            }
        });
        container.appendChild(btn);
    });
}

function showLoadingMessage(text) {
    const wrapper = document.getElementById('map-wrapper');
    wrapper.innerHTML = `<div class="loading-message">${text}</div>`;
}

function updateLoadingMessage(text) {
    const wrapper = document.getElementById('map-wrapper');
    const loadingDiv = wrapper.querySelector('.loading-message');
    if (loadingDiv) {
        loadingDiv.textContent = text;
    } else {
        wrapper.innerHTML = `<div class="loading-message">${text}</div>`;
    }
}

// ========== 模态框相关 ==========

let modalOverlay = null;

function ensureModal() {
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>线路详情</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-content"></div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // 关闭事件
        const closeBtn = modalOverlay.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        });
    }
}

function showLineDetails(line) {
    ensureModal();

    const stations = LINE_STATIONS[line];
    if (!stations) return;

    const contentDiv = modalOverlay.querySelector('.modal-content');
    const title = modalOverlay.querySelector('.modal-header h3');
    title.textContent = `${line} 运营时间详情`;

    // 生成表格
    let html = '<table class="detail-table"><thead><tr><th>站点</th><th>上行方向 (往终点)</th><th>下行方向 (往终点)</th></tr></thead><tbody>';

    for (const station of stations) {
        const times = lineDirectionTime[line]?.[station] || (line === '11号线' ? {
            upFull: null, upTerminal: null,
            downFull: null, downTerminal: null
        } : { up: [], down: [] });

        let upHtml = '';
        let downHtml = '';

        if (line === '11号线') {
            // 上行（外环）
            const upFull = times.upFull;
            const upTerminal = times.upTerminal;
            if (upFull) {
                upHtml += `<div class="time-item">全程 首 ${minutesToDisplayStr(upFull.first)} / 末 ${minutesToDisplayStr(upFull.last)}</div>`;
            }
            if (upTerminal) {
                upHtml += `<div class="time-item">龙潭 首 ${minutesToDisplayStr(upTerminal.first)} / 末 ${minutesToDisplayStr(upTerminal.last)}</div>`;
            }
            // 下行（内环）
            const downFull = times.downFull;
            const downTerminal = times.downTerminal;
            if (downFull) {
                downHtml += `<div class="time-item">全程 首 ${minutesToDisplayStr(downFull.first)} / 末 ${minutesToDisplayStr(downFull.last)}</div>`;
            }
            if (downTerminal) {
                downHtml += `<div class="time-item">赤沙 首 ${minutesToDisplayStr(downTerminal.first)} / 末 ${minutesToDisplayStr(downTerminal.last)}</div>`;
            }
        } else {
            // 非11号线：处理 up/down 数组
            const upTimes = times.up || [];
            const downTimes = times.down || [];

            if (upTimes.length === 0) {
                upHtml = '<span style="color:#aaa;">无数据</span>';
            } else {
                upHtml = '<div class="time-detail">';
                upTimes.forEach(t => {
                    let toName = t.to;
                    if (toName.includes('（') && toName.includes('）')) {
                        toName = toName.split('（')[0];
                    }
                    upHtml += `<div class="time-item">${toName} 首 ${minutesToDisplayStr(t.first)} / 末 ${minutesToDisplayStr(t.last)}</div>`;
                });
                upHtml += '</div>';
            }

            if (downTimes.length === 0) {
                downHtml = '<span style="color:#aaa;">无数据</span>';
            } else {
                downHtml = '<div class="time-detail">';
                downTimes.forEach(t => {
                    let toName = t.to;
                    if (toName.includes('（') && toName.includes('）')) {
                        toName = toName.split('（')[0];
                    }
                    downHtml += `<div class="time-item">${toName} 首 ${minutesToDisplayStr(t.first)} / 末 ${minutesToDisplayStr(t.last)}</div>`;
                });
                downHtml += '</div>';
            }
        }

        html += `<tr><td>${station}</td><td>${upHtml || '--:--'}</td><td>${downHtml || '--:--'}</td></tr>`;
    }

    html += '</tbody></table>';

    // 3号线特殊说明（如果需要）
    if (line === "3号线") {
        html += `<div class="line-note-modal">⚠️ 在一日较晚时候，<strong>海傍~珠江新城</strong>无直达<strong>机场北</strong>的列车时，可乘坐<strong>天河客运站</strong>方向的列车，并在<strong>体育西路</strong>换乘<strong>机场北</strong>方向的列车。</div>`;
    }

    contentDiv.innerHTML = html;
    modalOverlay.style.display = 'flex';
}