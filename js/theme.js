// ========== 主题（夜间模式）==========
(function() {
    const THEME_KEY = 'gz_metro_theme';
    let isAnimating = false; // 防止动画期间重复点击

    function getPreferredTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.title = theme === 'dark' ? '切换到日间模式' : '切换到夜间模式';
        if (typeof scheduleRender === 'function') scheduleRender();
    }

    // 核心切换逻辑
    function toggleTheme(e) {
        if (isAnimating) return;

        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';

        // 保存设置
        localStorage.setItem(THEME_KEY, next);

        // 获取点击坐标（如果是不带事件的调用，默认取右上角按钮位置）
        let x = e && e.clientX ? e.clientX : window.innerWidth - 40;
        let y = e && e.clientY ? e.clientY : 40;

        // 计算最大半径：点击位置到屏幕四个角的距离的最大值
        const maxRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        // 检查浏览器是否支持 View Transitions API
        if (!document.startViewTransition) {
            // 降级处理：直接瞬间切换
            applyTheme(next);
            return;
        }

        isAnimating = true;

        // 启动视图过渡
        const transition = document.startViewTransition(() => {
            applyTheme(next);
        });

        // 待浏览器准备好截图和新状态时，执行扩散动画
        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${maxRadius}px at ${x}px ${y}px)`
                    ]
                },
                {
                    duration: 600, // 动画时长
                    easing: 'ease-out', // 缓动函数，水波扩散感更强
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        });

        // 动画结束后解锁
        transition.finished.finally(() => {
            isAnimating = false;
        });
    }

    function bindButton() {
        const btn = document.getElementById('theme-toggle');
        if (btn && !btn.dataset.bound) {
            // 传参 e 给 toggleTheme，用于获取点击坐标
            btn.addEventListener('click', (e) => toggleTheme(e));
            btn.dataset.bound = '1';
            applyTheme(getPreferredTheme());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButton);
    } else {
        bindButton();
    }

    // 监听系统主题变化（跟随系统时）
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(THEME_KEY)) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
})();