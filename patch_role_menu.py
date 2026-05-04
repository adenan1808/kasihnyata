import sys

with open('admin.js', 'r') as f:
    content = f.read()

# Implement feature toggles based on Free tier vs Premium
# For now, we'll implement the toggle logic inside initStore / initAdmin to hide tabs
patch = """
/* ================= ROLE & FEATURE TOGGLE ================= */
function checkTierAndMenus(){
  const tier = (window.Core && Core.getLicenseTier) ? Core.getLicenseTier() : "free";
  // In FREE mode, hide certain advanced menus (e.g. Akuntansi)
  const tabAkuntansiBtn = document.querySelector(".tab-btn[onclick*='tabAkuntansi']");
  if(tabAkuntansiBtn) {
     if(tier === "free" && !localStorage.getItem("dev_show_akuntansi")) {
         tabAkuntansiBtn.style.display = "none";
     } else {
         tabAkuntansiBtn.style.display = "inline-block";
     }
  }

  // Developer Toggles override
  const tabTableBtn = document.querySelector(".tab-btn[onclick*='tabTable']");
  const tabHistoryBtn = document.querySelector(".tab-btn[onclick*='tabHistory']");

  if(tabTableBtn) tabTableBtn.style.display = localStorage.getItem("dev_hide_table") ? "none" : "inline-block";
  if(tabHistoryBtn) tabHistoryBtn.style.display = localStorage.getItem("dev_hide_history") ? "none" : "inline-block";
}
"""

content = content.replace("function initAdmin(){", patch + "\nfunction initAdmin(){\n  checkTierAndMenus();")

with open('admin.js', 'w') as f:
    f.write(content)
