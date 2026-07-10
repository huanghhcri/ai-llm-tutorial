/**
 * Hypothesis 批注工具增强
 * - 右下角 📝 入口按钮
 * - 高亮文字右上角插入文档图标
 * - 删除批注后自动移除图标
 */
(function() {
    'use strict';

    // 文档图标 SVG（和工具栏提示卡片里的图标风格一致）
    var DOC_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#3f51b5" stroke="none"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

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
        btn.style.cssText = 'position:fixed;bottom:80px;right:20px;width:48px;height:48px;background:#3f51b5;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25);z-index:100;transition:all 0.2s;user-select:none;';
        btn.onmouseenter = function() { this.style.transform = 'scale(1.15)'; };
        btn.onmouseleave = function() { this.style.transform = 'scale(1)'; };

        var tooltip = null;
        btn.onclick = function() {
            if (tooltip) { tooltip.remove(); tooltip = null; return; }
            tooltip = document.createElement('div');
            tooltip.style.cssText = 'position:fixed;bottom:140px;right:20px;background:white;color:#333;padding:16px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:101;font-size:14px;line-height:1.8;max-width:300px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
            tooltip.innerHTML = '<div style="font-weight:600;font-size:15px;margin-bottom:8px;color:#3f51b5;">📝 批注笔记功能</div><div style="margin-bottom:6px"><b>使用方法：</b></div><div>1. <b>选中</b>页面中的一段文字</div><div>2. 点击弹出的 <b>「Annotate」</b> 按钮</div><div>3. 在右侧输入框写笔记，点 <b>「Post」</b> 保存</div><div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;color:#666;font-size:12px;">💡 需先点击右上角 <b>Log in</b> 注册免费账号<br>📌 笔记仅自己可见，支持跨设备同步<br>🔍 有批注的文字右上角有 <span style="color:#5c6bc0">📄</span> 图标</div>';
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

    // ========== 高亮文字 ↔ 图标同步 ==========
    function initHighlightObserver() {
        // 监听 DOM 增删变化
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                // 新增节点 → 添加图标
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    if (isHighlight(node)) addIcon(node);
                    if (node.querySelectorAll) {
                        node.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight').forEach(addIcon);
                    }
                });
                // 删除节点 → 清理残留图标
                m.removedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    // 如果高亮元素被移除，检查同级是否有残留图标
                    cleanupOrphanIcons();
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 已存在的高亮
        document.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight').forEach(addIcon);

        // 定期清理（兜底，处理 observer 漏掉的情况）
        setInterval(cleanupOrphanIcons, 3000);
    }

    function isHighlight(el) {
        return el.classList && (el.classList.contains('hypothesis-highlight') || el.classList.contains('hypothesis-svg-highlight'));
    }

    function addIcon(el) {
        if (el.dataset.iconAdded) return;
        el.dataset.iconAdded = 'true';

        var wrapper = document.createElement('sup');
        wrapper.className = 'annotation-icon';
        wrapper.title = '点击查看批注';
        wrapper.innerHTML = DOC_ICON;
        wrapper.onclick = function(e) {
            e.stopPropagation();
            el.click();
        };
        el.appendChild(wrapper);
    }

    // 清理已没有父级高亮元素的孤儿图标
    function cleanupOrphanIcons() {
        document.querySelectorAll('.annotation-icon').forEach(function(icon) {
            // 如果父元素不再是 hypothesis-highlight，移除图标
            var parent = icon.parentElement;
            if (!parent || !isHighlight(parent)) {
                icon.remove();
            }
            // 如果父元素的 dataset.iconAdded 但元素已不在 DOM 中
            if (parent && parent.dataset.iconAdded && !document.body.contains(parent)) {
                icon.remove();
            }
        });

        // 重置已消失的高亮元素的标记
        document.querySelectorAll('[data-icon-added]').forEach(function(el) {
            if (!document.body.contains(el)) return;
            // 检查是否还有图标
            var hasIcon = el.querySelector('.annotation-icon');
            if (!hasIcon) {
                delete el.dataset.iconAdded;
                addIcon(el);
            }
        });
    }
})();
