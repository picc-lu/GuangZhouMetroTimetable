// ========== PWA & Service Worker 注册 ==========
let _swUpdating = false;
let _swDidReload = false;

function safeReload() {
    if (_swDidReload) return;
    _swDidReload = true;
    window.location.reload();
}

function startSwUpdateAnimation(reg) {
    if (_swUpdating) return;
    _swUpdating = true;

    const toast = document.getElementById('sw-update-toast');
    const btn      = toast ? toast.querySelector('.sw-update-btn') : null;
    const closeBtn = toast ? toast.querySelector('.sw-update-btn-cancel') : null;

    if (btn) {
        btn.disabled = true;
        btn.textContent = '更新中…';
    }
    if (closeBtn) closeBtn.disabled = true;

    if (toast) toast.classList.add('sw-toast-fading');

    setTimeout(() => {
        if (toast) toast.remove();

        const overlay = document.createElement('div');
        overlay.id = 'sw-update-overlay';
        overlay.className = 'sw-update-overlay';
        overlay.innerHTML = `
            <div class="sw-update-spinner"></div>
            <div class="sw-update-text">正在更新…</div>
        `;
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('show'));
        });

        setTimeout(() => {
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                setTimeout(safeReload, 3000);
            } else {
                safeReload();
            }
        }, 500);

    }, 200);
}

async function showSwUpdateToast(reg) {
    if (document.getElementById('sw-update-toast')) return;

    let latest = null;
    try {
        const resp = await fetch('./data/changelog.json', { cache: 'no-store' });
        if (resp.ok) {
            const data = await resp.json();
            latest = (data.entries && data.entries[0]) || null;
        }
    } catch (_) { /* 忽略 */ }

    const toast = document.createElement('div');
    toast.id = 'sw-update-toast';
    toast.className = 'sw-update-toast';

    const renderItems = (items) => {
        return (items || []).map(item => {
            if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
            const typeStr = item.type || '更新';
            let typeClass = 'sw-tag-default';
            if (typeStr.includes('新增')) typeClass = 'sw-tag-feat';
            else if (typeStr.includes('修复')) typeClass = 'sw-tag-fix';
            else if (typeStr.includes('优化')) typeClass = 'sw-tag-opt';
            else if (typeStr.includes('调整') || typeStr.includes('改')) typeClass = 'sw-tag-update';

            return `<li><span class="sw-update-type ${typeClass}">${escapeHtml(typeStr)}</span>${escapeHtml(item.text)}</li>`;
        }).join('');
    };

    const bodyHtml = latest
        ? `<div class="sw-update-version">
               <span class="sw-update-tag">v${escapeHtml(latest.version)}</span>
               ${latest.date ? `<span class="sw-update-date">${escapeHtml(latest.date)}</span>` : ''}
           </div>
           <ul class="sw-update-list">
               ${renderItems(latest.items)}
           </ul>`
        : `<div class="sw-update-empty">新版本已就绪，点击下方按钮立即体验</div>`;

    toast.innerHTML = `
        <div class="sw-update-panel">
            <div class="sw-update-title">🎉 发现新版本</div>
            <div class="sw-update-body">${bodyHtml}</div>
            <div class="sw-update-actions">
                <button type="button" class="sw-update-btn-cancel">稍后</button>
                <button type="button" class="sw-update-btn">立即刷新</button>
            </div>
        </div>
    `;
    document.body.appendChild(toast);

    toast.querySelector('.sw-update-btn-cancel').addEventListener('click', () => toast.remove());
    toast.querySelector('.sw-update-btn').addEventListener('click', () => {
        startSwUpdateAnimation(reg);
    });
}

// 注册 SW
if ('serviceWorker' in navigator && !IS_TOY_ENV) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            if (navigator.serviceWorker.controller) {
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed') {
                            showSwUpdateToast(reg);
                        }
                    });
                });
            }
        }).catch(err => {
            console.warn('[SW] 注册失败:', err);
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            safeReload();
        });
    });
}