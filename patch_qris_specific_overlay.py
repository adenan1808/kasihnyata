import sys

with open('index.html', 'r') as f:
    content = f.read()

# First remove the overlay from pos-cart-scroll-zone
qris_overlay = """
    <div id="posQrisOverlay" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999;flex-direction:column;align-items:center;justify-content:center;color:#fff;">
      <h3 style="margin-bottom:15px;text-align:center;font-size:24px;color:#facc15;">SCAN QRIS SEKARANG</h3>
      <img id="posQrisImg" src="" style="max-width:80%;max-height:50%;border-radius:10px;border:4px solid #fff;box-shadow:0 0 20px rgba(255,255,255,0.5);">
      <p style="margin-top:20px;text-align:center;font-size:16px;font-weight:bold;color:#f87171;">Harap tunggu validasi pembayaran...</p>
    </div>
"""

content = content.replace(qris_overlay, '')
content = content.replace('<div class="pos-cart-scroll-zone" style="position:relative;">\n\n\n', '<div class="pos-cart-scroll-zone">\n')
content = content.replace('<div class="pos-cart-scroll-zone" style="position:relative;">\n\n', '<div class="pos-cart-scroll-zone">\n')
content = content.replace('<div class="pos-cart-scroll-zone" style="position:relative;">', '<div class="pos-cart-scroll-zone">')

# Inject it tightly over posCheckoutFields
qris_overlay_tight = """
          <!-- QRIS OVERLAY (Hanya nutup data pelanggan) -->
          <div id="posQrisOverlay" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:100;flex-direction:column;align-items:center;justify-content:center;color:#fff;border-radius:10px;">
            <h4 style="margin:0 0 10px 0;text-align:center;color:#facc15;">📱 SCAN QRIS</h4>
            <img id="posQrisImg" src="" style="max-width:120px;border-radius:8px;border:2px solid #fff;">
            <p style="margin:10px 0 0 0;text-align:center;font-size:12px;font-weight:bold;color:#f87171;">Menunggu validasi...</p>
          </div>
"""

content = content.replace(
    '<div class="pos-checkout-fields" id="posCheckoutFields" style="display:none">',
    '<div class="pos-checkout-fields" id="posCheckoutFields" style="display:none;position:relative;">\n' + qris_overlay_tight
)

with open('index.html', 'w') as f:
    f.write(content)
