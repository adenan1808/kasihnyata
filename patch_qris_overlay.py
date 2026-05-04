import sys

with open('index.html', 'r') as f:
    content = f.read()

# Make sure overlay is properly injected inside pos-panel-right
qris_overlay = """
    <div id="posQrisOverlay" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999;flex-direction:column;align-items:center;justify-content:center;color:#fff;">
      <h3 style="margin-bottom:15px;text-align:center;font-size:24px;color:#facc15;">SCAN QRIS SEKARANG</h3>
      <img id="posQrisImg" src="" style="max-width:80%;max-height:50%;border-radius:10px;border:4px solid #fff;box-shadow:0 0 20px rgba(255,255,255,0.5);">
      <p style="margin-top:20px;text-align:center;font-size:16px;font-weight:bold;color:#f87171;">Harap tunggu validasi pembayaran...</p>
    </div>
"""

content = content.replace('<div class="pos-panel-right">', '<div class="pos-panel-right" style="position:relative;">\n' + qris_overlay)

# If it was already injected with the old style, update it
content = content.replace('<div id="posQrisOverlay" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999;flex-direction:column;align-items:center;justify-content:center;color:#fff;">\n      <h3 style="margin-bottom:10px;text-align:center;">SCAN QRIS</h3>\n      <img id="posQrisImg" src="" style="max-width:200px;border-radius:10px;">\n      <p style="margin-top:10px;text-align:center;font-size:12px;opacity:0.8;">Menunggu Pembayaran...</p>\n    </div>', qris_overlay)

with open('index.html', 'w') as f:
    f.write(content)

with open('app.js', 'r') as f:
    content = f.read()

# Make sure image src is set when popup shows
content = content.replace(
    'const qrisOverlay = document.getElementById("posQrisOverlay");',
    'const qrisOverlay = document.getElementById("posQrisOverlay");\n    const posQrisImg = document.getElementById("posQrisImg");\n    if(posQrisImg) posQrisImg.src = qrisSrc;'
)

with open('app.js', 'w') as f:
    f.write(content)
