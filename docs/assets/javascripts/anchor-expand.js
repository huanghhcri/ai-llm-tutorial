// 面试题锚点跳转：自动展开对应的折叠区块
document.addEventListener('DOMContentLoaded', function() {
    // 页面加载时，如果 URL 带 #anchor，展开对应的 details
    function expandTargetDetails() {
        var hash = window.location.hash;
        if (!hash) return;
        
        // 解码 URL 编码的锚点
        var targetId = decodeURIComponent(hash.substring(1));
        
        // 查找锚点元素
        var target = document.getElementById(targetId);
        if (!target) return;
        
        // 向上查找最近的 <details> 父元素并展开
        var parent = target.closest('details');
        if (parent && !parent.open) {
            parent.open = true;
        }
        
        // 滚动到锚点位置（延迟一下等展开动画完成）
        setTimeout(function() {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
    
    // 页面加载时执行
    expandTargetDetails();
    
    // 点击页面内锚点链接时执行
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href^="#"]');
        if (link) {
            setTimeout(expandTargetDetails, 50);
        }
    });
});
