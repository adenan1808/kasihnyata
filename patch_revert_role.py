import sys

with open('index.html', 'r') as f:
    content = f.read()

# Remove Developer Toggles UI
dev_toggles_ui = """        <div class="panel-box-header" style="margin-top:20px"><span class="panel-icon">🛠️</span><div><div class="panel-title">Developer Toggles</div><div class="panel-desc">Sembunyikan menu</div></div></div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div><div class="field-label" style="margin-top:0">Tampilkan Akuntansi (Bypass Free)</div></div>
          <label class="toggle-switch"><input type="checkbox" id="devAkuntansiToggle"><span class="toggle-slider"></span></label>
        </div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div><div class="field-label" style="margin-top:0">Sembunyikan Table</div></div>
          <label class="toggle-switch"><input type="checkbox" id="devTableToggle"><span class="toggle-slider"></span></label>
        </div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div><div class="field-label" style="margin-top:0">Sembunyikan History</div></div>
          <label class="toggle-switch"><input type="checkbox" id="devHistoryToggle"><span class="toggle-slider"></span></label>
        </div>"""

content = content.replace(dev_toggles_ui, '')

with open('index.html', 'w') as f:
    f.write(content)


with open('admin.js', 'r') as f:
    content = f.read()

# Remove initialization and saving of developer toggles from admin.js
init_dev = """  const devToggles = [
    {id: "devAkuntansiToggle", key: "dev_show_akuntansi"},
    {id: "devTableToggle", key: "dev_hide_table"},
    {id: "devHistoryToggle", key: "dev_hide_history"}
  ];
  devToggles.forEach(t => {
    const el = document.getElementById(t.id);
    if(el) el.checked = (localStorage.getItem(t.key) === "true");
  });"""

save_dev = """  const devTogglesSave = [
    {id: "devAkuntansiToggle", key: "dev_show_akuntansi"},
    {id: "devTableToggle", key: "dev_hide_table"},
    {id: "devHistoryToggle", key: "dev_hide_history"}
  ];
  devTogglesSave.forEach(t => {
    const el = document.getElementById(t.id);
    if(el) localStorage.setItem(t.key, el.checked ? "true" : "");
  });
  checkTierAndMenus();"""

content = content.replace(init_dev, '')
content = content.replace(save_dev, '')

# Update checkTierAndMenus to only rely on local storage flags directly, completely decoupled from "Free" tier
updated_check = """
/* ================= ROLE & FEATURE TOGGLE ================= */
function checkTierAndMenus(){
  // Developer Toggles override via localStorage only
  const tabAkuntansiBtn = document.querySelector(".tab-btn[onclick*='tabAkuntansi']");
  const tabTableBtn = document.querySelector(".tab-btn[onclick*='tabTable']");
  const tabHistoryBtn = document.querySelector(".tab-btn[onclick*='tabHistory']");
  const tabPelangganBtn = document.querySelector(".tab-btn[onclick*='tabPelanggan']");

  if(tabAkuntansiBtn) tabAkuntansiBtn.style.display = localStorage.getItem("dev_hide_akuntansi") === "true" ? "none" : "inline-block";
  if(tabTableBtn) tabTableBtn.style.display = localStorage.getItem("dev_hide_table") === "true" ? "none" : "inline-block";
  if(tabHistoryBtn) tabHistoryBtn.style.display = localStorage.getItem("dev_hide_history") === "true" ? "none" : "inline-block";
  if(tabPelangganBtn) tabPelangganBtn.style.display = localStorage.getItem("dev_hide_pelanggan") === "true" ? "none" : "inline-block";
}
"""

content = content.replace("""/* ================= ROLE & FEATURE TOGGLE ================= */
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
}""", updated_check)

with open('admin.js', 'w') as f:
    f.write(content)
