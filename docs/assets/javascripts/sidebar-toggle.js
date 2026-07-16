/**
 * 侧边栏收起/展开切换
 * - 左下角：左栏（导航）切换
 * - 右下角：右栏（目录）切换
 * - 状态持久化到 localStorage
 * - 快捷键 [ 切换左栏，] 切换右栏
 */
(function () {
  "use strict";

  const KEYS = {
    sidebar: "md-sidebar-collapsed",
    toc: "md-toc-collapsed",
  };

  function isCollapsed(key) {
    return localStorage.getItem(key) === "true";
  }

  function setCollapsed(key, collapsed) {
    localStorage.setItem(key, collapsed);
    if (key === KEYS.sidebar) {
      document.body.classList.toggle("sidebar-collapsed", collapsed);
    } else {
      document.body.classList.toggle("toc-collapsed", collapsed);
    }
  }

  function createButton(className, title, arrowDir) {
    const btn = document.createElement("button");
    btn.className = className;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    // arrowDir: "left" = chevron-left, "right" = chevron-right
    const points =
      arrowDir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6";
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${points}"/></svg>`;
    return btn;
  }

  function init() {
    // 恢复状态
    if (isCollapsed(KEYS.sidebar)) {
      document.body.classList.add("sidebar-collapsed");
    }
    if (isCollapsed(KEYS.toc)) {
      document.body.classList.add("toc-collapsed");
    }

    // 创建左栏切换按钮
    const leftBtn = createButton(
      "sidebar-toggle",
      "收起/展开导航栏 (快捷键 [)",
      "left"
    );
    leftBtn.addEventListener("click", function () {
      setCollapsed(KEYS.sidebar, !isCollapsed(KEYS.sidebar));
    });
    document.body.appendChild(leftBtn);

    // 创建右栏切换按钮
    const rightBtn = createButton(
      "toc-toggle",
      "收起/展开目录 (快捷键 ])",
      "right"
    );
    rightBtn.addEventListener("click", function () {
      setCollapsed(KEYS.toc, !isCollapsed(KEYS.toc));
    });
    document.body.appendChild(rightBtn);

    // 快捷键
    document.addEventListener("keydown", function (e) {
      if (
        (e.key === "[" || e.key === "]") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.target.tagName !== "INPUT" &&
        e.target.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        const key = e.key === "[" ? KEYS.sidebar : KEYS.toc;
        setCollapsed(key, !isCollapsed(key));
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
