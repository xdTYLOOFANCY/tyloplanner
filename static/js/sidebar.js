document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const tabsNav = document.getElementById("tabs");
  if (!sidebar || !tabsNav) return;

  // Forward sidebar nav clicks to the existing top-bar tab buttons (reuses the
  // one tab-switch handler in app.js — no forked logic).
  sidebar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    const targetBtn = tabsNav.querySelector(`button[data-tab="${btn.dataset.tab}"]`);
    if (targetBtn) targetBtn.click();
  });

  // Mirror the top-tab active state onto the sidebar.
  const syncActive = (tabName) => {
    sidebar.querySelectorAll("button[data-tab]").forEach((b) => {
      b.classList.remove("active");
      b.removeAttribute("aria-current");
    });
    const el = sidebar.querySelector(`button[data-tab="${tabName}"]`);
    if (el) {
      el.classList.add("active");
      el.setAttribute("aria-current", "page");
    }
  };
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type === "attributes" && m.attributeName === "class" && m.target.classList.contains("active")) {
        syncActive(m.target.dataset.tab);
      }
    });
  });
  tabsNav.querySelectorAll("button").forEach((btn) => {
    observer.observe(btn, { attributes: true });
    if (btn.classList.contains("active")) syncActive(btn.dataset.tab);
  });

  // Collapse toggle — client-only UI preference, like the theme key in theme.js.
  // The boot script in index.html applies the cached class before first paint.
  const KEY = "tylo-sidebar-collapsed";
  const collapseBtn = document.getElementById("sidebarCollapse");
  const setCollapsed = (c) => {
    document.body.classList.toggle("sidebar-collapsed", c);
    if (collapseBtn) {
      collapseBtn.setAttribute("aria-expanded", String(!c));
      collapseBtn.title = collapseBtn.ariaLabel = c ? "Expand sidebar (⌘\\)" : "Collapse sidebar (⌘\\)";
    }
    // Collapsed rail is icon-only: native title tooltips stand in for labels.
    sidebar.querySelectorAll("button[data-tab], .sidebar-action").forEach((b) => {
      const label = b.querySelector(".sidebar-label");
      if (!label) return;
      if (c) b.title = label.textContent;
      else b.removeAttribute("title");
    });
  };
  // Per-device choice wins; otherwise fall back to the server default mirror
  // (matches the pre-paint boot script in index.html).
  var stored = localStorage.getItem(KEY);
  if (stored === null) stored = localStorage.getItem("tylo-sidebar-collapsed-default");
  setCollapsed(stored === "1");
  const toggle = () => {
    const c = !document.body.classList.contains("sidebar-collapsed");
    setCollapsed(c);
    try { localStorage.setItem(KEY, c ? "1" : "0"); } catch (e) {}
  };
  if (collapseBtn) collapseBtn.addEventListener("click", toggle);

  // Cmd/Ctrl+\ toggles the sidebar, like Notion. Only when the sidebar is the
  // active desktop layout — never steals the shortcut in top-bar or mobile view.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "\\" || (!e.metaKey && !e.ctrlKey) || e.altKey || e.shiftKey) return;
    if (document.body.getAttribute("data-nav-layout") !== "sidebar" || window.innerWidth <= 900) return;
    e.preventDefault();
    toggle();
  });

  // ---------- Mobile drawer (≤900px) ----------
  // The same #sidebar, shown as an off-canvas panel. Opened by the header
  // hamburger or a swipe from the left edge; closed by scrim tap, swipe left,
  // Escape, or navigating. Purely additive: none of it runs on desktop widths.
  const drawerBtn = document.getElementById("drawerBtn");
  const scrim = document.getElementById("drawerScrim");
  const isMobile = () => window.innerWidth <= 900;
  const drawerOpen = () => document.body.classList.contains("drawer-open");
  const openDrawer = () => {
    document.body.classList.add("drawer-open");
    if (drawerBtn) drawerBtn.setAttribute("aria-expanded", "true");
  };
  const closeDrawer = () => {
    document.body.classList.remove("drawer-open");
    if (drawerBtn) drawerBtn.setAttribute("aria-expanded", "false");
  };
  // Ignore re-toggles inside the 250ms slide so double-taps don't cancel out
  let lastDrawerToggle = 0;
  if (drawerBtn) drawerBtn.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastDrawerToggle < 300) return;
    lastDrawerToggle = now;
    drawerOpen() ? closeDrawer() : openDrawer();
  });
  if (scrim) scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawerOpen()) closeDrawer(); });
  // Navigating from the drawer dismisses it
  sidebar.addEventListener("click", (e) => {
    if (isMobile() && e.target.closest("button[data-tab], .sidebar-action, a")) closeDrawer();
  });
  // Leaving mobile widths clears the open state so desktop never inherits it.
  // Re-checked after a settle delay: transient resize blips (screenshot tools,
  // browser chrome show/hide) must not dismiss the drawer mid-use.
  let resizeCloseTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeCloseTimer);
    resizeCloseTimer = setTimeout(() => { if (!isMobile()) closeDrawer(); }, 250);
  });

  // Edge-swipe to open / swipe-left to close, tracking the finger like a
  // native drawer. transform is driven directly during the drag; the CSS
  // transition takes over on release.
  const EDGE = 28;           // px from the left edge that starts an open-drag
  let dragging = false, dragStartX = 0, dragStartY = 0, dragDX = 0, openedAtStart = false, axisLocked = false;
  document.addEventListener("touchstart", (e) => {
    if (!isMobile()) return;
    const t = e.touches[0];
    openedAtStart = drawerOpen();
    if (!openedAtStart && t.clientX > EDGE) return;
    if (openedAtStart && t.clientX > sidebar.offsetWidth) return; // touch outside panel = scrim tap
    dragging = true; axisLocked = false;
    dragStartX = t.clientX; dragStartY = t.clientY; dragDX = 0;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - dragStartX, dy = t.clientY - dragStartY;
    if (!axisLocked) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; } // vertical scroll wins
      axisLocked = true;
      sidebar.classList.add("dragging");
    }
    dragDX = dx;
    const w = sidebar.offsetWidth;
    const base = openedAtStart ? 0 : -w;
    const x = Math.min(0, Math.max(-w, base + dx));
    sidebar.style.transform = "translateX(" + x + "px)";
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    sidebar.classList.remove("dragging");
    sidebar.style.transform = "";
    if (!axisLocked) return;
    const w = sidebar.offsetWidth;
    // Commit if dragged past 35% of the panel width (or a decisive 60px flick)
    if (!openedAtStart && (dragDX > w * 0.35 || dragDX > 60)) openDrawer();
    else if (openedAtStart && (-dragDX > w * 0.35 || -dragDX > 60)) closeDrawer();
  };
  document.addEventListener("touchend", endDrag, { passive: true });
  document.addEventListener("touchcancel", endDrag, { passive: true });

  // Quick-add menu (top-right +): four shortcuts into existing global actions.
  const quickBtn = document.getElementById("quickAddBtn");
  const quickMenu = document.getElementById("quickAddMenu");
  const closeQuick = () => {
    if (quickMenu) quickMenu.classList.remove("open");
    if (quickBtn) quickBtn.setAttribute("aria-expanded", "false");
  };
  if (quickBtn && quickMenu) {
    quickBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = quickMenu.classList.toggle("open");
      quickBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#quickAddMenu")) closeQuick();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeQuick(); });
  }
  window.quickAddGo = function (what) {
    closeQuick();
    const goTab = (tab) => {
      const btn = tabsNav.querySelector('button[data-tab="' + tab + '"]');
      if (btn) btn.click();
    };
    if (what === "event") { goTab("planner"); if (typeof window.openAdd === "function") window.openAdd(); }
    else if (what === "task") { goTab("tasks"); if (typeof window.openTaskModal === "function") window.openTaskModal(); }
    else if (what === "note") { goTab("notes"); if (typeof window.newNote === "function") window.newNote(); }
    else if (what === "calendar") { goTab("planner"); }
  };
});
