/* ================= TOAST UI HELPER ================= */
const showToast = msg => {
  const el = document.getElementById("toast");
  if(!el) return;
  el.innerText = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2200);
};

// Global export to maintain backwards compatibility
window.showToast = showToast;
