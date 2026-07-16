/**
 * 侧边栏收起/展开切换
 * - 左下角浮动按钮控制
 * - 状态持久化到 localStorage
 * - 快捷键 [ 切换
 */
(function () {
  "use strict";

  const STORAGE_KEY = "md-sidebar-collapsed";

  function isCollapsed() {
    return localStorage.getItem(STORAGE_KEY) === "true";
  }

  function setCollapsed(collapsed) {
    localStorage.setItem(STORAGE_KEY, collapsed);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }

  function createToggleButton() {
    const btn = document.createElement("button");
    btn.className = "sidebar-toggle";
    btn.title = "收起/展开侧边栏 (快捷键 [)";
    btn.setAttribute("aria-label", "切换侧边栏");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    btn.addEventListener("click", function () {
      setCollapsed(!isCollapsed());
    });
    document.body.appendChild(btn);
  }

  function init() {
    // 恢复上次状态
    if (isCollapsed()) {
      document.body.classList.add("sidebar-collapsed");
    }
    createToggleButton();

    // 快捷键 [ 切换侧边栏
    document.addEventListener("keydown", function (e) {
      if (
        e.key === "[" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.target.tagName !== "INPUT" &&
        e.target.tagName !== "TEXTAREA"
      ) {
        setCollapsed(!isCollapsed());
      }
    });
  }

  // MkDocs Material 使用 instant loading，需要监听 DOM 变化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
