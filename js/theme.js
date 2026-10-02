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
        if (btn) btn.title = theme === 'dark' ? '切换到日间模式' : '切换到夜间模式';
        // 主题变了，箭头颜色需要跟着变
        if (typeof scheduleRender === 'function') scheduleRender();
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