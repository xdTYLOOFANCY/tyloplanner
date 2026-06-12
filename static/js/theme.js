// TyloPlanner — theme (dark/light) toggle.

export function applyTheme() {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("tylo-theme") || "dark");
}

export function toggleTheme() {
  localStorage.setItem("tylo-theme", (localStorage.getItem("tylo-theme") || "dark") === "dark" ? "light" : "dark");
  applyTheme();
}
