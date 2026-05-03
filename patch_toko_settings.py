import sys

def insert_after(content, search, insert):
    return content.replace(search, search + "\n" + insert)

def insert_before(content, search, insert):
    return content.replace(search, insert + "\n" + search)

with open('index.html', 'r') as f:
    content = f.read()

toggles_html = """
        <div class="panel-box-header" style="margin-top:20px"><span class="panel-icon">⚙️</span><div><div class="panel-title">Pengaturan Fitur & Tampilan</div><div class="panel-desc">Aktifkan atau nonaktifkan fitur toko</div></div></div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div><div class="field-label" style="margin-top:0">Banner Toko (Tampil)</div></div>
          <label class="toggle-switch"><input type="checkbox" id="heroEnabledToggle"><span class="toggle-slider"></span></label>
        </div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div><div class="field-label" style="margin-top:0">Promo Kiri (Tampil)</div></div>
          <label class="toggle-switch"><input type="checkbox" id="promoLeftEnabledToggle"><span class="toggle-slider"></span></label>
        </div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div><div class="field-label" style="margin-top:0">Sponsor Kanan (Tampil)</div></div>
          <label class="toggle-switch"><input type="checkbox" id="promoRightEnabledToggle"><span class="toggle-slider"></span></label>
        </div>

        <div class="acc-toggle-row" style="margin-bottom:10px;">
          <div>
            <div class="field-label" style="margin-top:0">Pembayaran QRIS</div>
            <div class="field-hint">Jika OFF, tombol QRIS akan dianggap sebagai pembayaran TUNAI</div>
          </div>
          <label class="toggle-switch"><input type="checkbox" id="qrisEnabledToggle"><span class="toggle-slider"></span></label>
        </div>

        <label class="field-label">Waktu Tunggu "WAIT" (Menit)</label>
        <input type="number" id="waitTimerInput" placeholder="5" min="0" value="5">
        <div class="field-hint">Jika diset 0, pesanan harus dikonfirmasi manual. Jika lebih dari 0, otomatis batal dan stok kembali jika belum di approve.</div>
"""

content = insert_before(content, '<button onclick="Admin.saveToko()" class="btn-save">💾 Simpan Info Toko</button>', toggles_html)

with open('index.html', 'w') as f:
    f.write(content)
