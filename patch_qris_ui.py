import sys

with open('index.html', 'r') as f:
    content = f.read()

# Add QRIS Delay configuration
qris_delay = """        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div>
            <div class="field-label" style="margin-top:0">Delay Validasi QRIS (Detik)</div>
            <div class="field-hint">Berapa lama tombol tertahan saat bayar QRIS (0 = Cash)</div>
          </div>
          <input type="number" id="qrisDelayInput" placeholder="3" min="0" value="3" style="width: 80px;">
        </div>"""

content = content.replace(
    '<label class="toggle-switch"><input type="checkbox" id="qrisEnabledToggle"><span class="toggle-slider"></span></label>\n        </div>',
    '<label class="toggle-switch"><input type="checkbox" id="qrisEnabledToggle"><span class="toggle-slider"></span></label>\n        </div>\n' + qris_delay
)

# Move QRIS overlay inside pos-panel-right
qris_overlay = """
    <div id="posQrisOverlay" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999;flex-direction:column;align-items:center;justify-content:center;color:#fff;">
      <h3 style="margin-bottom:10px;text-align:center;">SCAN QRIS</h3>
      <img id="posQrisImg" src="" style="max-width:200px;border-radius:10px;">
      <p style="margin-top:10px;text-align:center;font-size:12px;opacity:0.8;">Menunggu Pembayaran...</p>
    </div>
"""

# Find pos-panel-right and inject it inside
content = content.replace('<div id="posQrisOverlay"', '<!-- qris overlay moved -->\n<div id="posQrisOverlayOLD"') # Remove old
content = content.replace('<div class="pos-panel-right">', '<div class="pos-panel-right" style="position:relative;">\n' + qris_overlay)


with open('index.html', 'w') as f:
    f.write(content)


with open('admin.js', 'r') as f:
    content = f.read()

# Add qrisDelay to Admin initialization and save
init_qris_delay = """  const qrisDelayEl = document.getElementById("qrisDelayInput");
  if(qrisDelayEl) qrisDelayEl.value = localStorage.getItem("qrisDelay") || "3";
"""
content = content.replace('if(waitEl) waitEl.value = localStorage.getItem("waitTimer") || "5";', 'if(waitEl) waitEl.value = localStorage.getItem("waitTimer") || "10";\n' + init_qris_delay)

save_qris_delay = """  const qrisDelayEl = document.getElementById("qrisDelayInput");
  if(qrisDelayEl) localStorage.setItem("qrisDelay", qrisDelayEl.value);
"""
content = content.replace('updateAllTitles();\n  showToast("✅ Info toko tersimpan");', save_qris_delay + '  updateAllTitles();\n  showToast("✅ Info toko tersimpan");')

with open('admin.js', 'w') as f:
    f.write(content)


with open('app.js', 'r') as f:
    content = f.read()

# Update posBayar logic for dynamic delay
pos_bayar_logic = """  const qrisDelayStr = localStorage.getItem("qrisDelay") || "3";
  const qrisDelay = parseInt(qrisDelayStr, 10);

  if(payMethod === "QRIS" && qrisDelay === 0){
      payMethod = "Tunai"; // Dianggap cash
  }

  // QRIS: timer dinamis sebelum proses otomatis
  if(payMethod === "QRIS" && !posBayar._qrisValidated){"""

content = content.replace("""  // QRIS: timer 3 detik sebelum proses otomatis
  if(payMethod === "QRIS" && !posBayar._qrisValidated){""", pos_bayar_logic)

content = content.replace('Tunggu 3 Detik...', 'Menunggu Pembayaran...')
content = content.replace('Tunggu 3 detik untuk QRIS...', 'Menunggu Pembayaran QRIS...')
content = content.replace('setTimeout(()=>{', f'setTimeout(()=>{{', 1)

content = content.replace('}, 3000);', '}, qrisDelay * 1000);', 2)

with open('app.js', 'w') as f:
    f.write(content)
