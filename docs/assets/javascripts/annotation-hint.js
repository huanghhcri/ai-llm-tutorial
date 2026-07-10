/**
 * Hypothesis 批注工具增强
 * - 添加可见的批注入口按钮
 * - 配置中文界面
 */
(function() {
    'use strict';

    // 等待页面加载完成
    window.addEventListener('load', function() {
        // 延迟执行，确保 Hypothesis 脚本已加载
        setTimeout(initAnnotationHint, 2000);
    });

    function initAnnotationHint() {
        // 创建浮动批注按钮
        var btn = document.createElement('div');
        btn.id = 'annotation-hint';
        btn.innerHTML = '📝';
        btn.title = '选中文字即可添加批注笔记';
        btn.style.cssText = [
            'position: fixed',
            'bottom: 80px',
            'right: 20px',
            'width: 48px',
            'height: 48px',
            'background: #3f51b5',
            'color: white',
            'border-radius: 50%',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'font-size: 22px',
            'cursor: pointer',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.25)',
            'z-index: 100',
            'transition: all 0.2s',
            'user-select: none'
        ].join(';');

        // hover 效果
        btn.onmouseenter = function() {
            this.style.transform = 'scale(1.15)';
            this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
        };
        btn.onmouseleave = function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        };

        // 点击展开提示
        var tooltip = null;
        btn.onclick = function() {
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
                return;
            }
            tooltip = document.createElement('div');
            tooltip.style.cssText = [
                'position: fixed',
                'bottom: 140px',
                'right: 20px',
                'background: white',
                'color: #333',
                'padding: 16px 20px',
                'border-radius: 10px',
                'box-shadow: 0 4px 20px rgba(0,0,0,0.2)',
                'z-index: 101',
                'font-size: 14px',
                'line-height: 1.8',
                'max-width: 300px',
                'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            ].join(';');
            tooltip.innerHTML = [
                '<div style="font-weight:600;font-size:15px;margin-bottom:8px;color:#3f51b5;">📝 批注笔记功能</div>',
                '<div style="margin-bottom:6px;"><b>使用方法：</b></div>',
                '<div>1. <b>选中</b>页面中的一段文字</div>',
                '<div>2. 点击弹出的 <b>「Annotate」</b> 按钮</div>',
                '<div>3. 在右侧输入框写笔记，点 <b>「Post」</b> 保存</div>',
                '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;color:#666;font-size:12px;">',
                '💡 需先点击右上角 <b>Log in</b> 注册免费账号<br>',
                '📌 笔记仅自己可见，支持跨设备同步',
                '</div>'
            ].join('');
            document.body.appendChild(tooltip);

            // 点击其他地方关闭
            setTimeout(function() {
                document.addEventListener('click', function closeTip(e) {
                    if (!tooltip.contains(e.target) && e.target !== btn) {
                        tooltip.remove();
                        tooltip = null;
                        document.removeEventListener('click', closeTip);
                    }
                });
            }, 100);
        };

        document.body.appendChild(btn);
    }
})();
