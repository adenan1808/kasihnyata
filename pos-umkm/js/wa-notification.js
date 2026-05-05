// wa-notification.js

async function sendWAMessage(targetNumber, message) {
  const tokenEnc = await db.settings.get('fonnte_token');
  if (!tokenEnc || !tokenEnc.value) throw new Error('Fonnte token belum dikonfigurasi');

  // Dekripsi token
  const token = CryptoJS.AES.decrypt(tokenEnc.value, getDeviceFingerprint()).toString(CryptoJS.enc.Utf8);
  if (!token) throw new Error('Token tidak valid');

  // Bersihkan nomor (hapus +, spasi, strip)
  const cleanNumber = targetNumber.replace(/[^0-9]/g, '');

  // Kirim via Fonnte REST API
  const response = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      target: cleanNumber,
      message: message,
    }),
  });

  const result = await response.json();
  if (!result.status) throw new Error(result.reason || 'Gagal kirim WA');
  return result;
}

// Template 1: Struk ke Pelanggan
function templateStrukPelanggan(tx, storeName, storePhone, storeAddress) {
  const items = tx.items.map(item =>
    `  ${item.name} x${item.qty} = ${formatRupiah(item.price * item.qty)}`
  ).join('\n');

  return [
    `*STRUK PEMBELIAN*`,
    `*${storeName}*`,
    `${storeAddress || ''}`,
    ``,
    `No Invoice : ${tx.invoiceNumber}`,
    `Tanggal    : ${tx.txDateDisplay}`,
    `Kasir      : ${tx.cashierName}`,
    `Pelanggan  : ${tx.customerName}`,
    ``,
    `*DETAIL PESANAN*`,
    `------------------------`,
    items,
    `------------------------`,
    `Subtotal   : ${formatRupiah(tx.subtotal)}`,
    tx.discountAmount > 0 ? `Diskon     : -${formatRupiah(tx.discountAmount)}` : null,
    tx.taxAmount > 0 ? `PPN ${tx.taxRate}%  : ${formatRupiah(tx.taxAmount)}` : null,
    `*TOTAL     : ${formatRupiah(tx.total)}*`,
    ``,
    `Pembayaran : ${tx.paymentMethod}`,
    tx.paymentMethod === 'Tunai' ? `Bayar      : ${formatRupiah(tx.cashPaid)}` : null,
    tx.paymentMethod === 'Tunai' ? `Kembali    : ${formatRupiah(tx.changeAmount)}` : null,
    tx.paymentRef && tx.paymentRef !== '-' ? `Ref        : ${tx.paymentRef}` : null,
    ``,
    `Status     : LUNAS`,
    ``,
    `Terima kasih sudah berbelanja!`,
    storePhone ? `Hubungi kami: ${storePhone}` : null,
  ].filter(line => line !== null).join('\n');
}

// Template 2: Notif ke Admin/Owner
function templateNotifAdmin(tx) {
  return [
    `*[NOTIF TRANSAKSI BARU]*`,
    ``,
    `Invoice    : ${tx.invoiceNumber}`,
    `Waktu      : ${tx.txDateDisplay}`,
    `Kasir      : ${tx.cashierName}`,
    `Pelanggan  : ${tx.customerName}`,
    ``,
    `*Total Pembayaran: ${formatRupiah(tx.total)}*`,
    `Metode     : ${tx.paymentMethod}`,
    `Item       : ${tx.items.reduce((s,i) => s + i.qty, 0)} produk`,
    ``,
    `Status     : ${tx.status.toUpperCase()}`,
  ].join('\n');
}

// Template 3: Notif Stok Menipis ke Admin
function templateStokMenipis(products) {
  const list = products.map(p =>
    `  - ${p.name}: sisa ${p.stock}`
  ).join('\n');

  return [
    `*[PERINGATAN STOK MENIPIS]*`,
    ``,
    `Produk berikut stoknya hampir habis:`,
    list,
    ``,
    `Segera lakukan restok untuk menghindari kehabisan stok.`,
  ].join('\n');
}

// Template 4: Notif Transaksi Void ke Admin
function templateVoidNotif(tx) {
  return [
    `*[NOTIF TRANSAKSI DIBATALKAN]*`,
    ``,
    `Invoice    : ${tx.invoiceNumber}`,
    `Waktu Void : ${formatTanggal(new Date().toISOString())}`,
    `Kasir      : ${tx.cashierName}`,
    `Alasan     : ${tx.voidReason}`,
    `Total      : ${formatRupiah(tx.total)}`,
  ].join('\n');
}

async function kirimNotifikasiTransaksi(tx) {
  const enabledSetting = await db.settings.get('fonnte_enabled');
  if (!enabledSetting || !enabledSetting.value) return;

  const adminNumber = (await db.settings.get('wa_admin_number'))?.value;
  const kirimKeAdmin = (await db.settings.get('wa_notif_on_sale'))?.value;
  const kirimKePelanggan = (await db.settings.get('wa_notif_to_customer'))?.value;

  const storeName = (await db.settings.get('store_name'))?.value || 'Toko';
  const storePhone = (await db.settings.get('store_phone'))?.value || '';
  const storeAddress = (await db.settings.get('store_address'))?.value || '';

  const notifResults = [];

  // Kirim ke admin
  if (kirimKeAdmin && adminNumber) {
    try {
      await sendWAMessage(adminNumber, templateNotifAdmin(tx));
      notifResults.push('admin: OK');
    } catch(e) {
      notifResults.push('admin: GAGAL - ' + e.message);
      console.error('WA admin gagal:', e);
    }
  }

  // Kirim struk ke pelanggan
  if (kirimKePelanggan && tx.customerPhone && tx.customerPhone.length >= 10) {
    try {
      await sendWAMessage(tx.customerPhone, templateStrukPelanggan(tx, storeName, storePhone, storeAddress));
      notifResults.push('pelanggan: OK');
      showToast('Struk WA terkirim ke ' + tx.customerName, 'wa');
    } catch(e) {
      notifResults.push('pelanggan: GAGAL - ' + e.message);
      showToast('Struk WA gagal terkirim: ' + e.message, 'warning');
    }
  }

  // Simpan log notifikasi
  await db.settings.put({
    key: 'wa_last_notif',
    value: { time: new Date().toISOString(), results: notifResults }
  });
}

async function cekDanKirimNotifStok() {
  const enabled = (await db.settings.get('wa_notif_on_low_stock'))?.value;
  if (!enabled) return;

  const adminNumber = (await db.settings.get('wa_admin_number'))?.value;
  if (!adminNumber) return;

  const produkMenipis = await db.products
    .filter(p => p.isActive === 1 && p.stock <= p.minStock)
    .toArray();

  if (produkMenipis.length > 0) {
    try {
      await sendWAMessage(adminNumber, templateStokMenipis(produkMenipis));
    } catch(e) {
      console.error('Notif stok gagal:', e);
    }
  }
}

// Fallback: Kirim manual via URL jika tidak pakai API
function generateWhatsAppLink(phone, message) {
  const cleanPhone = phone.replace(/^0/, '62').replace(/[^0-9]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
