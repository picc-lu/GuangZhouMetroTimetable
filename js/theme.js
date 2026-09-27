// ========== 主题（夜间模式）==========
(function() {
    const THEME_KEY = 'gz_metro_theme';

    function getPreferredTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
        // 尊重系统偏好
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.textContent = theme === 'dark' ? '☀️' : '🌙';
            btn.title = theme === 'dark' ? '切换到日间模式' : '切换到夜间模式';
        }
        // 若弹窗正开着，重新渲染以更新 --up-color / --down-color
        if (typeof currentModalLine !== 'undefined' && currentModalLine) {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay && overlay.style.display === 'flex') {
                const line = currentModalLine;
                const contentDiv = overlay.querySelector('.modal-content');
                const scrollTop = contentDiv ? contentDiv.scrollTop : 0;
                if (typeof showLineDetails === 'function') {
                    showLineDetails(line, true);
                    requestAnimationFrame(() => {
                        if (contentDiv) contentDiv.scrollTop = scrollTop;
                    });
                }
            }
        }
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
    }

    // 尽早应用主题，避免白屏闪烁
    applyTheme(getPreferredTheme());

    // DOM 就绪后绑定按钮
    function bindButton() {
        const btn = document.getElementById('theme-toggle');
        if (btn && !btn.dataset.bound) {
            btn.addEventListener('click', toggleTheme);
            btn.dataset.bound = '1';
            applyTheme(getPreferredTheme()); // 刷新按钮图标
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButton);
    } else {
        bindButton();
    }

    // 监听系统主题变化（用户未手动设置时跟随）
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(THEME_KEY)) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
})();