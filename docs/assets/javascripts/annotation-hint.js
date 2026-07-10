/**
 * Hypothesis 批注工具增强
 * - 右下角浮动入口按钮
 * - 高亮文字右上角显示批注图标
 * - 删除批注后自动移除图标
 * - 缓存版本: v2
 */
(function() {
    'use strict';

    // 统一图标：带笔的文档（蓝色调）
    var ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><rect x="3" y="2" width="14" height="20" rx="2" fill="#e8eaf6" stroke="#3f51b5" stroke-width="1.5"/><line x1="6" y1="7" x2="14" y2="7" stroke="#9fa8da" stroke-width="1.2"/><line x1="6" y1="10" x2="14" y2="10" stroke="#9fa8da" stroke-width="1.2"/><line x1="6" y1="13" x2="11" y2="13" stroke="#9fa8da" stroke-width="1.2"/><path d="M15 12l-1 7 3.5-3.5L21 12l-2.5-2.5z" fill="#e53935" stroke="#c62828" stroke-width="0.8"/></svg>';

    // 大号图标（用于浮动按钮）
    var ICON_SVG_LG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect x="3" y="2" width="14" height="20" rx="2" fill="#e8eaf6" stroke="#fff" stroke-width="1.2"/><line x1="6" y1="7" x2="14" y2="7" stroke="#c5cae9" stroke-width="1.2"/><line x1="6" y1="10" x2="14" y2="10" stroke="#c5cae9" stroke-width="1.2"/><line x1="6" y1="13" x2="11" y2="13" stroke="#c5cae9" stroke-width="1.2"/><path d="M15 12l-1 7 3.5-3.5L21 12l-2.5-2.5z" fill="#ef5350" stroke="#c62828" stroke-width="0.6"/></svg>';

    window.addEventListener('load', function() {
        setTimeout(initAnnotationHint, 2000);
        setTimeout(initHighlightObserver, 3000);
    });

    // ========== 浮动入口按钮 ==========
    function initAnnotationHint() {
        var btn = document.createElement('div');
        btn.id = 'annotation-hint';
        btn.innerHTML = ICON_SVG_LG;
        btn.title = '选中文字即可添加批注笔记';
        btn.style.cssText = 'position:fixed;bottom:80px;right:20px;width:48px;height:48px;background:#3f51b5;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25);z-index:100;transition:all 0.2s;user-select:none;';
        btn.onmouseenter = function() { this.style.transform = 'scale(1.15)'; };
        btn.onmouseleave = function() { this.style.transform = 'scale(1)'; };

        var tooltip = null;
        btn.onclick = function() {
            if (tooltip) { tooltip.remove(); tooltip = null; return; }
            tooltip = document.createElement('div');
            tooltip.style.cssText = 'position:fixed;bottom:140px;right:20px;background:white;color:#333;padding:16px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:101;font-size:14px;line-height:1.8;max-width:300px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
            tooltip.innerHTML = '<div style="font-weight:600;font-size:15px;margin-bottom:8px;color:#3f51b5;">' + ICON_SVG + ' 批注笔记功能</div><div style="margin-bottom:6px"><b>使用方法：</b></div><div>1. <b>选中</b>页面中的一段文字</div><div>2. 点击弹出的 <b>「Annotate」</b> 按钮</div><div>3. 在右侧输入框写笔记，点 <b>「Post」</b> 保存</div><div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;color:#666;font-size:12px;">💡 需先点击右上角 <b>Log in</b> 注册免费账号<br>📌 笔记仅自己可见，支持跨设备同步<br>🔍 有批注的文字右上角有图标标记</div>';
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
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    if (isHighlight(node)) addIcon(node);
                    if (node.querySelectorAll) {
                        node.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight').forEach(addIcon);
                    }
                });
                m.removedNodes.forEach(function(node) {
                    if (node.nodeType === 1) cleanupOrphanIcons();
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        document.querySelectorAll('.hypothesis-highlight, .hypothesis-svg-highlight').forEach(addIcon);
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
        wrapper.innerHTML = ICON_SVG;

        // 判断结尾字符：中文标点/汉字不需要额外间距，英文/数字需要
        var textBefore = '';
        for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 3) textBefore += el.childNodes[i].textContent;
        }
        var lastChar = textBefore.trim().slice(-1);
        var isChinese = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(lastChar);
        wrapper.style.marginLeft = isChinese ? '0' : '3px';

        wrapper.onclick = function(e) { e.stopPropagation(); el.click(); };
        el.appendChild(wrapper);
    }

    function cleanupOrphanIcons() {
        document.querySelectorAll('.annotation-icon').forEach(function(icon) {
            var parent = icon.parentElement;
            if (!parent || !isHighlight(parent)) icon.remove();
        });
        document.querySelectorAll('[data-icon-added]').forEach(function(el) {
            if (!document.body.contains(el)) return;
            if (!el.querySelector('.annotation-icon')) {
                delete el.dataset.iconAdded;
                addIcon(el);
            }
        });
    }
})();
