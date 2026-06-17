document.addEventListener("DOMContentLoaded", () => {
  const bottomNav = document.getElementById("bottomNav");
  const tabsNav = document.getElementById("tabs");
  if (!bottomNav || !tabsNav) return;

  // Handle clicks on bottom navigation buttons
  bottomNav.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const tab = btn.dataset.tab;
    const targetBtn = tabsNav.querySelector(`button[data-tab="${tab}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
  });

  // Observe active states on desktop tabs to keep bottom-nav in sync
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        const target = mutation.target;
        if (target.classList.contains("active")) {
          const tabName = target.dataset.tab;
          const bottomBtn = bottomNav.querySelector(`button[data-tab="${tabName}"]`);
          bottomNav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
          if (bottomBtn) {
            bottomBtn.classList.add("active");
          }
        }
      }
    });
  });

  // Setup observer for each desktop tab button and sync initial state
  tabsNav.querySelectorAll("button").forEach((btn) => {
    observer.observe(btn, { attributes: true });
    if (btn.classList.contains("active")) {
      const tabName = btn.dataset.tab;
      const bottomBtn = bottomNav.querySelector(`button[data-tab="${tabName}"]`);
      if (bottomBtn) {
        bottomBtn.classList.add("active");
      }
    }
  });
});
