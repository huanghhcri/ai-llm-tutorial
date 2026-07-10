/**
 * Hypothesis 批注工具增强
 * - 右下角 📝 入口按钮
 * - 高亮文字添加 📝 图标
 * - 右侧边距伸出笔记本标签
 */
(function() {
    'use strict';

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
        };
        btn.onmouseleave = function() {
            this.style.transform = 'scale(1)';
        };

        var tooltip = null;
        btn.onclick = function() {
            if (tooltip) { tooltip.remove(); tooltip = null; return; }
            tooltip = document.createElement('div');
            tooltip.style.cssText = 'position:fixed;bottom:140px;right:20px;background:white;color:#333;padding:16px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:101;font-size:14px;line-height:1.8;max-width:300px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
            tooltip.innerHTML = '<div style="font-weight:600;font-size:15px;margin-bottom:8px;color:#3f51b5;">📝 批注笔记功能</div><div style="margin-bottom:6px"><b>使用方法：</b></div><div>1. <b>选中</b>页面中的一段文字</div><div>2. 点击弹出的 <b>「Annotate」</b> 按钮</div><div>3. 在右侧输入框写笔记，点 <b>「Post」</b> 保存</div><div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;color:#666;font-size:12px;">💡 需先点击右上角 <b>Log in</b> 注册免费账号<br>📌 笔记仅自己可见，支持跨设备同步<br>🔍 有批注的文字旁有 📋 标签，点击可查看</div>';
            document.body.appendChild(tooltip);
            setTimeout(function() {
                document.addEventListener('click', function close(e) {
                    if (!tooltip.contains(e.target) && e.target !== btn) {
                        tooltip.remove(); tooltip = null;
                        document.removeEventListener('click', close);
                    }
                });
            }, 100);
        };
        document.body.appendChild(btn);
    }

    // ========== 高亮文字 → 右侧边距标签 ==========
    function initHighlightObserver() {
        // 样式注入（只做一次）
        if (!document.getElementById('annotation-tab-style')) {
            var style = document.createElement('style');
            style.id = 'annotation-tab-style';
            style.textContent = [
                /* 标签容器：固定在正文右边距 */
                '.annotation-margin-tab {',
                '  position: absolute;',
                '  right: -36px;',
                '  top: 50%;',
                '  transform: translateY(-50%);',
                '  width: 28px;',
                '  height: 28px;',
                '  background: #3f51b5;',
                '  border-radius: 4px 8px 8px 4px;',
                '  display: flex;',
                '  align-items: center;',
                '  justify-content: center;',
                '  font-size: 14px;',
                '  cursor: pointer;',
                '  box-shadow: -1px 1px 4px rgba(0,0,0,0.2);',
                '  transition: all 0.15s;',
                '  z-index: 10;',
                '  pointer-events: auto;',
                '}',
                '.annotation-margin-tab:hover {',
                '  background: #1a237e;',
                '  width: 32px;',
                '  right: -40px;',
                '  box-shadow: -2px 2px 8px rgba(0,0,0,0.3);',
                '}',
                /* 高亮文字的父元素需要 relative 定位 */
                '.hypothesis-highlight, .hypothesis-svg-highlight {',
                '  position: relative !important;',
                '}',
                /* 高亮样式 */
                '.hypothesis-highlight, .hypothesis-svg-highlight {',
                '  background-color: rgba(255, 235, 59, 0.25) !important;',
                '  border-bottom: 2px solid #ffc107 !important;',
                '  cursor: pointer !important;',
                '  padding: 1px 0 !important;',
                '}',
                '.hypothesis-highlight:hover, .hypothesis-svg-highlight:hover {',
                '  background-color: rgba(255, 235, 59, 0.45) !important;',
                '}',
                '.hypothesis-highlight::after, .hypothesis-svg-highlight::after {',
                '  content: "📝";',
                '  font-size: 11px;',
                '  vertical-align: super;',
                '  margin-left: 2px;',
                '  opacity: 0.6;',
                '}'
            ].join('\n');
            document.head.appendChild(style);
        }

        // 监听 DOM 变化
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    if (node.classList && (node.classList.contains('hypothesis-highlight') || node.classList.contains('hypothesis-svg-highlight'))) {
                        addMarginTab(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight').forEach(addMarginTab);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 处理已存在的高亮
        document.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight').forEach(addMarginTab);
    }

    function addMarginTab(el) {
        if (el.dataset.tabAdded) return;
        el.dataset.tabAdded = 'true';

        // 创建右侧边距标签
        var tab = document.createElement('div');
        tab.className = 'annotation-margin-tab';
        tab.innerHTML = '📋';
        tab.title = '点击查看批注';

        // 点击标签 → 触发 Hypothesis 侧边栏
        tab.onclick = function(e) {
            e.stopPropagation();
            // 模拟点击高亮文字，触发 Hypothesis
            el.click();
            // 也直接触发 Hypothesis sidebar 的 open
            var sidebar = document.querySelector('.hypothesis-sidebar');
            if (sidebar) {
                sidebar.style.display = 'block';
            }
        };

        el.style.position = 'relative';
        el.appendChild(tab);
    }
})();
