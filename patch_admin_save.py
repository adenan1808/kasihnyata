import sys

with open('admin.js', 'r') as f:
    content = f.read()

# Add new toggles to saveToko fields
content = content.replace('["storeName","ownerWa","ownerEmail","heroText","defaultMargin",',
                          '["storeName","ownerWa","ownerEmail","heroText","defaultMargin","waitTimer",')

save_toggles = """
  const toggles = ["heroEnabled","promoLeftEnabled","promoRightEnabled","qrisEnabled"];
  toggles.forEach(t => {
    const el = document.getElementById(t+"Toggle");
    if(el) localStorage.setItem(t, el.checked ? "true" : "false");
  });
"""

content = content.replace('  updateAllTitles();\n  showToast("✅ Info toko tersimpan");',
                          save_toggles + '  updateAllTitles();\n  showToast("✅ Info toko tersimpan");')

# Add initialization for toggles in initStore
init_toggles = """
  const toggles = ["heroEnabled","promoLeftEnabled","promoRightEnabled","qrisEnabled"];
  toggles.forEach(t => {
    const el = document.getElementById(t+"Toggle");
    if(el) el.checked = (localStorage.getItem(t) !== "false"); // Default true
  });
  const waitEl = document.getElementById("waitTimerInput");
  if(waitEl) waitEl.value = localStorage.getItem("waitTimer") || "5";
"""

content = content.replace('function initStore(){', 'function initStore(){\n' + init_toggles)

with open('admin.js', 'w') as f:
    f.write(content)
