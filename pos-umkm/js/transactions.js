// transactions.js

let currentTx = null;

async function renderTransactionsPage() {
  const page = document.getElementById('transaksi-content');
  if (!page) return;

  page.innerHTML = `
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
          <i data-lucide="history" class="w-4 h-4 text-indigo-600"></i>
        </span>
        Riwayat Transaksi
      </h3>

      <div class="relative mb-4">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
        <input type="text" id="txSearchInput" placeholder="Cari invoice atau pelanggan..." class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all">
      </div>

      <div id="txList" class="space-y-3">
        <!-- populated by JS -->
      </div>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });

  document.getElementById('txSearchInput').addEventListener('input', (e) => {
    loadTransactions(e.target.value);
  });

  await loadTransactions();
}

async function loadTransactions(searchQuery = '') {
  const listContainer = document.getElementById('txList');
  if (!listContainer) return;

  let txs = await db.transactions.orderBy('date').reverse().toArray();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    txs = txs.filter(t =>
      t.invoiceNumber.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q)
    );
  }

  if (txs.length === 0) {
    listContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">Tidak ada transaksi ditemukan.</div>`;
    return;
  }

  listContainer.innerHTML = txs.map(t => {
    let badgeClass = 'bg-emerald-100 text-emerald-700';
    if (t.status === 'void') badgeClass = 'bg-red-100 text-red-600';
    if (t.status === 'pending') badgeClass = 'bg-amber-100 text-amber-700';

    return `
      <div onclick="showInvoiceDetail(${t.id})" class="bg-slate-50 rounded-2xl p-4 cursor-pointer hover:bg-slate-100 active:scale-[0.98] transition-all border border-transparent hover:border-indigo-100">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="text-xs font-bold font-mono text-slate-500">${t.invoiceNumber}</p>
            <p class="text-sm font-semibold text-slate-800 mt-0.5">${t.customerName}</p>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeClass}">${t.status}</span>
        </div>
        <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-200 border-dashed">
          <p class="text-xs text-slate-500">${formatTanggalSingkat(t.date)}</p>
          <p class="text-sm font-extrabold text-indigo-600">${formatRupiah(t.total)}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function showInvoiceDetail(txId) {
  const tx = await db.transactions.get(txId);
  if (!tx) return;
  currentTx = tx;

  let badgeClass = 'bg-emerald-100 text-emerald-700';
  if (tx.status === 'void') badgeClass = 'bg-red-100 text-red-600';
  if (tx.status === 'pending') badgeClass = 'bg-amber-100 text-amber-700';

  let voidRow = '';
  if (tx.status === 'void') {
    voidRow = `
      <div class="bg-red-50 border border-red-100 rounded-2xl p-3 mb-4">
        <p class="text-xs font-bold text-red-600 uppercase mb-1">Dibatalkan</p>
        <p class="text-xs text-red-500">Alasan: ${tx.voidReason}</p>
      </div>
    `;
  }

  const itemsHtml = tx.items.map(item => `
    <div class="py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
      <div>
        <p class="text-sm font-semibold text-slate-800">${item.name}</p>
        <p class="text-xs text-slate-400">${item.qty} x ${formatRupiah(item.price)}</p>
      </div>
      <p class="text-sm font-bold text-slate-800">${formatRupiah(item.price * item.qty)}</p>
    </div>
  `).join('');

  const html = `
    <div class="space-y-4">
      <!-- Header Invoice -->
      <div class="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-5 text-white shadow-glow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-indigo-200">No. Invoice</span>
          <span class="bg-white/20 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">${tx.invoiceNumber}</span>
        </div>
        <p class="text-3xl font-extrabold">${formatRupiah(tx.total)}</p>
        <div class="flex items-center justify-between mt-4">
          <span class="text-xs text-indigo-200">${formatTanggal(tx.date)}</span>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-white/20 text-white">${tx.status}</span>
        </div>
      </div>

      ${voidRow}

      <!-- Info Transaksi -->
      <div class="bg-slate-50 rounded-2xl p-4 space-y-2.5">
        <div class="flex justify-between">
          <span class="text-xs text-slate-500 font-medium">Kasir</span>
          <span class="text-xs font-semibold text-slate-800">${tx.cashierName}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-slate-500 font-medium">Pelanggan</span>
          <span class="text-xs font-semibold text-slate-800">${tx.customerName}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-xs text-slate-500 font-medium">Metode Bayar</span>
          <span class="text-xs font-semibold text-slate-800">${tx.paymentMethod}</span>
        </div>
        ${tx.paymentRef && tx.paymentRef !== '-' ? `
        <div class="flex justify-between">
          <span class="text-xs text-slate-500 font-medium">Ref Pembayaran</span>
          <span class="text-xs font-semibold text-slate-800 font-mono">${tx.paymentRef}</span>
        </div>` : ''}
      </div>

      <!-- Item List -->
      <div class="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        <div class="bg-slate-50 px-4 py-2 border-b border-slate-100">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Detail Item</p>
        </div>
        <div class="px-4">${itemsHtml}</div>
      </div>

      <!-- Summary -->
      <div class="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-slate-500">Subtotal</span>
          <span class="font-medium text-slate-800">${formatRupiah(tx.subtotal)}</span>
        </div>
        ${tx.discountAmount > 0 ? `
        <div class="flex justify-between text-sm">
          <span class="text-slate-500">Diskon</span>
          <span class="font-medium text-red-500">-${formatRupiah(tx.discountAmount)}</span>
        </div>` : ''}
        ${tx.taxAmount > 0 ? `
        <div class="flex justify-between text-sm">
          <span class="text-slate-500">PPN ${tx.taxRate}%</span>
          <span class="font-medium text-slate-800">${formatRupiah(tx.taxAmount)}</span>
        </div>` : ''}
        <div class="border-t border-dashed border-slate-200 pt-2.5 mt-1 flex justify-between">
          <span class="font-bold text-slate-800">Total</span>
          <span class="font-extrabold text-indigo-600 text-lg">${formatRupiah(tx.total)}</span>
        </div>
        ${tx.paymentMethod === 'Tunai' ? `
        <div class="flex justify-between text-sm mt-2">
          <span class="text-slate-500">Bayar Tunai</span>
          <span class="font-medium text-slate-800">${formatRupiah(tx.cashPaid)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-slate-500">Kembalian</span>
          <span class="font-semibold text-emerald-600">${formatRupiah(tx.changeAmount)}</span>
        </div>` : ''}
      </div>

      <!-- Action Buttons -->
      <div class="grid grid-cols-2 gap-3 mt-4">
        <button onclick="cetakStruk(currentTx)" class="bg-indigo-50 text-indigo-700 font-semibold py-3.5 rounded-2xl hover:bg-indigo-100 transition-all flex items-center justify-center gap-2">
          <i data-lucide="printer" class="w-4 h-4"></i> Cetak Struk
        </button>
        <button onclick="kirimStrukWA(currentTx)" class="bg-green-50 text-green-700 font-semibold py-3.5 rounded-2xl hover:bg-green-100 transition-all flex items-center justify-center gap-2">
          <i data-lucide="message-circle" class="w-4 h-4"></i> Kirim WA
        </button>
        ${tx.status !== 'void' ? `
        <button onclick="voidTransaksi(${tx.id})" class="col-span-2 bg-red-50 text-red-600 font-semibold py-3.5 rounded-2xl hover:bg-red-100 transition-all flex items-center justify-center gap-2">
          <i data-lucide="x-circle" class="w-4 h-4"></i> Batalkan Transaksi (Void)
        </button>
        ` : ''}
      </div>
    </div>
  `;

  showModal(html);
}

function voidTransaksi(txId) {
  showConfirmDialog(
    "Batalkan Transaksi?",
    "Transaksi yang dibatalkan tidak akan dihitung dalam laporan, dan stok akan dikembalikan.",
    async () => {
      const reason = prompt("Alasan pembatalan:");
      if (reason === null) return;

      const cleanReason = sanitizeText(reason || 'Dibatalkan admin');

      showLoading(true);
      try {
        const tx = await db.transactions.get(txId);
        if (!tx) throw new Error("Transaksi tidak ditemukan");

        // Restore stock
        for (let item of tx.items) {
          const product = await db.products.get(item.id);
          if (product) {
            await db.products.update(product.id, { stock: product.stock + item.qty });
          }
        }

        // Update tx status
        await db.transactions.update(txId, {
          status: 'void',
          voidReason: cleanReason
        });

        const updatedTx = await db.transactions.get(txId);

        // Send notif void
        const enabledSetting = await db.settings.get('fonnte_enabled');
        const adminNumber = (await db.settings.get('wa_admin_number'))?.value;
        if (enabledSetting?.value && adminNumber) {
          try {
            await sendWAMessage(adminNumber, templateVoidNotif(updatedTx));
          } catch(e) {
             console.error("Gagal kirim notif void", e);
          }
        }

        showToast("Transaksi berhasil dibatalkan", "success");
        await loadTransactions(document.getElementById('txSearchInput')?.value);
        showInvoiceDetail(txId); // refresh detail
      } catch (e) {
        showToast("Gagal membatalkan: " + e.message, "error");
      } finally {
        showLoading(false);
      }
    }
  );
}

async function cetakStruk(tx) {
  const storeName = (await db.settings.get('store_name'))?.value || 'Toko';
  const storeAddress = (await db.settings.get('store_address'))?.value || '';
  const storePhone = (await db.settings.get('store_phone'))?.value || '';

  const receiptArea = document.getElementById('receipt-area');

  let itemsHtml = tx.items.map(item => `
    <div>${item.name}</div>
    <div style="display:flex; justify-content:space-between;">
      <span>${item.qty} x ${item.price}</span>
      <span>${item.qty * item.price}</span>
    </div>
  `).join('');

  receiptArea.innerHTML = `
    <div style="text-align:center; margin-bottom:10px;">
      <h3 style="margin:0; font-size:14pt;">${storeName}</h3>
      <div style="font-size:9pt;">${storeAddress}</div>
      <div style="font-size:9pt;">${storePhone}</div>
    </div>

    <div class="receipt-line"></div>
    <div style="display:flex; justify-content:space-between; font-size:9pt;">
      <span>No: ${tx.invoiceNumber}</span>
      <span>${tx.txDateDisplay}</span>
    </div>
    <div style="font-size:9pt;">Kasir: ${tx.cashierName}</div>
    <div style="font-size:9pt;">Plg: ${tx.customerName}</div>
    <div class="receipt-line"></div>

    ${itemsHtml}

    <div class="receipt-line"></div>
    <div style="display:flex; justify-content:space-between;">
      <span>Subtotal</span>
      <span>${tx.subtotal}</span>
    </div>
    ${tx.taxAmount > 0 ? `
    <div style="display:flex; justify-content:space-between;">
      <span>PPN</span>
      <span>${tx.taxAmount}</span>
    </div>` : ''}
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:11pt; margin-top:5px;">
      <span>TOTAL</span>
      <span>${tx.total}</span>
    </div>
    <div style="display:flex; justify-content:space-between; margin-top:5px;">
      <span>Bayar (${tx.paymentMethod})</span>
      <span>${tx.paymentMethod === 'Tunai' ? tx.cashPaid : tx.total}</span>
    </div>
    ${tx.paymentMethod === 'Tunai' ? `
    <div style="display:flex; justify-content:space-between;">
      <span>Kembali</span>
      <span>${tx.changeAmount}</span>
    </div>` : ''}

    <div class="receipt-line" style="margin-top:10px;"></div>
    <div style="text-align:center; font-size:9pt; margin-top:10px;">
      Terima Kasih Atas Kunjungan Anda<br>
      Status: ${tx.status === 'void' ? 'VOID/DIBATALKAN' : 'LUNAS'}
    </div>
  `;

  window.print();
}

async function kirimStrukWA(tx) {
  let phone = tx.customerPhone;

  if (!phone) {
    const input = prompt("Masukkan nomor WA pelanggan (contoh: 628...):");
    if (!input) return;
    phone = sanitizeText(input).replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);
  }

  showLoading(true);
  try {
    const storeName = (await db.settings.get('store_name'))?.value || 'Toko';
    const storePhone = (await db.settings.get('store_phone'))?.value || '';
    const storeAddress = (await db.settings.get('store_address'))?.value || '';

    const message = templateStrukPelanggan(tx, storeName, storePhone, storeAddress);

    const enabledSetting = await db.settings.get('fonnte_enabled');
    if (enabledSetting?.value) {
      await sendWAMessage(phone, message);
      showToast('Struk berhasil dikirim via Fonnte', 'wa');
    } else {
      const url = generateWhatsAppLink(phone, message);
      window.open(url, '_blank');
    }
  } catch(e) {
    showToast('Gagal mengirim: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}
