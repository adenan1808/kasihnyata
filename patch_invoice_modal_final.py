import sys

with open('index.html', 'r') as f:
    content = f.read()

if 'invoiceDetailModal' not in content:
    modal_html = """
  <!-- INVOICE DETAIL MODAL -->
  <div id="invoiceDetailModal" class="modal-overlay" style="display:none;z-index:9999;">
    <div class="modal-content" style="max-width:400px;">
      <h3 id="invDetailTitle" style="margin-top:0">Detail Transaksi</h3>
      <div id="invDetailBody" style="font-size:13px;line-height:1.5;margin-bottom:15px;max-height:400px;overflow-y:auto;text-align:left;"></div>
      <button onclick="document.getElementById('invoiceDetailModal').style.display='none'" class="btn-save" style="width:100%">Tutup</button>
    </div>
  </div>
"""
    content = content.replace('</body>', modal_html + '\n</body>')

with open('index.html', 'w') as f:
    f.write(content)


with open('admin.js', 'r') as f:
    content = f.read()

# Make Invoice column clickable
content = content.replace('<td>${tx.inv}</td>', r'<td><a href="#" onclick="showInvoiceDetail(\'${tx.inv}\'); return false;" style="color:var(--accent);text-decoration:underline;cursor:pointer;">${tx.inv}</a></td>')


show_invoice_fn = """
/* ================= INVOICE DETAIL MODAL ================= */
function showInvoiceDetail(inv) {
  const txList = typeof _txCache !== 'undefined' && _txCache ? _txCache : JSON.parse(localStorage.getItem("transaksi")||"[]");
  const tx = txList.find(t => t.inv === inv);
  if(!tx) {
     showToast("Invoice tidak ditemukan");
     return;
  }

  const d = new Date(tx.tgl);
  const tglStr = typeof formatDate === "function" ? formatDate(d) : d.toLocaleString("id");
  const modal = document.getElementById("invoiceDetailModal");
  const title = document.getElementById("invDetailTitle");
  const body = document.getElementById("invDetailBody");

  if(!modal || !title || !body) return;

  title.innerHTML = `Invoice: <span style="color:var(--accent)">${tx.inv}</span>`;

  let html = `
    <div style="margin-bottom:10px;">
      <b>Tanggal:</b> ${tglStr}<br>
      <b>Metode:</b> ${tx.paymentMethod || "Tunai"}<br>
      <b>Status:</b> ${tx.status.toUpperCase()}<br>
      <b>Pelanggan:</b> ${tx.nama || "-"} (${tx.hp || "-"})
    </div>
    <div style="border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:10px 0;margin-bottom:10px;">
      <b style="display:block;margin-bottom:5px;">Item:</b>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
  `;

  (tx.items || []).forEach(i => {
      const sub = i.qty * i.harga;
      html += `<tr>
        <td style="padding:2px 0;">${i.nama} x${i.qty}</td>
        <td style="text-align:right;">Rp ${sub.toLocaleString("id")}</td>
      </tr>`;
  });

  html += `</table></div>`;

  const total = tx.total || 0;
  const grand = tx.grand || total;
  const ongkir = tx.ongkir || 0;
  const diskon = (total + ongkir) - grand;

  html += `<table style="width:100%;font-size:13px;font-weight:bold;">`;
  html += `<tr><td>Total Item</td><td style="text-align:right;">Rp ${total.toLocaleString("id")}</td></tr>`;
  if(diskon > 0) {
      html += `<tr><td style="color:var(--accent2)">Diskon</td><td style="text-align:right;color:var(--accent2)">-Rp ${diskon.toLocaleString("id")}</td></tr>`;
  }
  if(ongkir > 0) {
      html += `<tr><td>Ongkir</td><td style="text-align:right;">Rp ${ongkir.toLocaleString("id")}</td></tr>`;
  }
  html += `<tr style="font-size:15px;color:var(--accent);border-top:1px solid var(--border)">
             <td style="padding-top:5px;">Grand Total</td>
             <td style="text-align:right;padding-top:5px;">Rp ${grand.toLocaleString("id")}</td>
           </tr>`;
  html += `</table>`;

  body.innerHTML = html;
  modal.style.display = "flex";
}
window.showInvoiceDetail = showInvoiceDetail;
"""

if "function showInvoiceDetail" not in content:
    content = content.replace("window.showTab       = showTab;", "window.showTab       = showTab;\n" + show_invoice_fn)

with open('admin.js', 'w') as f:
    f.write(content)
