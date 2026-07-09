// 面试题锚点跳转：自动展开对应的折叠区块并滚动到正确位置
document.addEventListener('DOMContentLoaded', function() {
    function expandAndScroll() {
        var hash = window.location.hash;
        if (!hash) return;
        
        var targetId = decodeURIComponent(hash.substring(1));
        var target = document.getElementById(targetId);
        if (!target) return;
        
        // 向上查找最近的 <details> 父元素并展开
        var parent = target.closest('details');
        if (parent && !parent.open) {
            parent.open = true;
        }
        
        // 等待展开动画完成后再滚动（多次重试确保定位准确）
        var attempts = [100, 300, 600];
        attempts.forEach(function(delay) {
            setTimeout(function() {
                target.scrollIntoView({ behavior: 'auto', block: 'start' });
            }, delay);
        });
    }
    
    // 页面加载时执行
    expandAndScroll();
    
    // 点击页面内锚点链接时执行
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href^="#"]');
        if (link) {
            setTimeout(expandAndScroll, 50);
        }
    });
    
    // 浏览器前进/后退时执行
    window.addEventListener('hashchange', expandAndScroll);
});
