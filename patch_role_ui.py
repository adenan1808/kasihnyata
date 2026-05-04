import sys

with open('index.html', 'r') as f:
    content = f.read()

dev_toggles = """
        <div class="panel-box-header" style="margin-top:20px"><span class="panel-icon">🛠️</span><div><div class="panel-title">Developer Toggles</div><div class="panel-desc">Sembunyikan menu</div></div></div>

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
        </div>
"""

content = content.replace(
    '<label class="field-label">Waktu Tunggu "WAIT" (Menit)</label>',
    dev_toggles + '\n        <label class="field-label">Waktu Tunggu "WAIT" (Menit)</label>'
)

with open('index.html', 'w') as f:
    f.write(content)

with open('admin.js', 'r') as f:
    content = f.read()

# initialization of developer toggles
init_dev = """
  const devToggles = [
    {id: "devAkuntansiToggle", key: "dev_show_akuntansi"},
    {id: "devTableToggle", key: "dev_hide_table"},
    {id: "devHistoryToggle", key: "dev_hide_history"}
  ];
  devToggles.forEach(t => {
    const el = document.getElementById(t.id);
    if(el) el.checked = (localStorage.getItem(t.key) === "true");
  });
"""

content = content.replace('const waitEl = document.getElementById("waitTimerInput");', init_dev + '\n  const waitEl = document.getElementById("waitTimerInput");')

# Save developer toggles
save_dev = """
  const devTogglesSave = [
    {id: "devAkuntansiToggle", key: "dev_show_akuntansi"},
    {id: "devTableToggle", key: "dev_hide_table"},
    {id: "devHistoryToggle", key: "dev_hide_history"}
  ];
  devTogglesSave.forEach(t => {
    const el = document.getElementById(t.id);
    if(el) localStorage.setItem(t.key, el.checked ? "true" : "");
  });
  checkTierAndMenus();
"""

content = content.replace('updateAllTitles();', save_dev + '\n  updateAllTitles();')

with open('admin.js', 'w') as f:
    f.write(content)
