/**
 * Hypothesis 批注工具增强
 * - 添加可见的批注入口按钮
 * - 高亮文字添加侧边指示器
 * - 中文使用说明
 */
(function() {
    'use strict';

    // 等待页面加载完成
    window.addEventListener('load', function() {
        setTimeout(initAnnotationHint, 2000);
        setTimeout(initHighlightObserver, 3000);
    });

    // ========== 批注入口按钮 ==========
    function initAnnotationHint() {
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

        btn.onmouseenter = function() {
            this.style.transform = 'scale(1.15)';
            this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
        };
        btn.onmouseleave = function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        };

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
                '📌 笔记仅自己可见，支持跨设备同步<br>',
                '🔍 有批注的文字下方有黄色标记，点击可查看笔记',
                '</div>'
            ].join('');
            document.body.appendChild(tooltip);

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

    // ========== 高亮文字指示器 ==========
    function initHighlightObserver() {
        // 监听 DOM 变化，为新增的高亮元素添加指示器
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        // 检查是否是 Hypothesis 高亮元素
                        if (node.classList && (
                            node.classList.contains('hypothesis-highlight') ||
                            node.classList.contains('hypothesis-svg-highlight')
                        )) {
                            addHighlightIndicator(node);
                        }
                        // 检查子元素
                        var highlights = node.querySelectorAll ? 
                            node.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight') : [];
                        highlights.forEach(addHighlightIndicator);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 处理已存在的高亮
        var existing = document.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight');
        existing.forEach(addHighlightIndicator);
    }

    function addHighlightIndicator(element) {
        // 避免重复添加
        if (element.dataset.hintAdded) return;
        element.dataset.hintAdded = 'true';

        // 添加标题提示
        element.title = '📝 点击查看批注';
    }
})();
