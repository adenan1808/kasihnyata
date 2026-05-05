// db.js

const db = new Dexie('POSUMKMDatabase');

db.version(2).stores({
  settings: 'key, value',
  products: '++id, barcode, name, category, price, cost, stock, minStock, image, isActive',
  customers: '++id, name, phone, address, notes',
  transactions: '++id, invoiceNumber, txNumber, date, txDateDisplay, customerId, customerName, customerPhone, cashierId, cashierName, items, subtotal, discountAmount, taxRate, taxAmount, total, paymentMethod, cashPaid, changeAmount, paymentRef, status, voidReason, notes',
  expenses: '++id, date, amount, category, note'
});

async function initDB() {
  try {
    await db.open();
    // Cek apakah data demo sudah diinisialisasi
    const isInit = await db.settings.get('is_initialized');
    if (!isInit) {
      await seedDemoData();
      await db.settings.put({ key: 'is_initialized', value: true });
      await db.settings.put({ key: 'store_name', value: 'Warung Barokah' });
      await db.settings.put({ key: 'store_phone', value: '081234567890' });
      await db.settings.put({ key: 'store_address', value: 'Jl. Merdeka No. 45, Jakarta' });
      await db.settings.put({ key: 'tax_rate', value: 0 }); // 0% default
    }
  } catch (error) {
    console.error("Gagal membuka database:", error);
    showToast("Kesalahan database. Coba muat ulang halaman.", "error");
  }
}

async function seedDemoData() {
  const products = [
    { name: 'Nasi Ayam Goreng', category: 'Makanan', price: 18000, cost: 12000, stock: 50, minStock: 10, isActive: 1 },
    { name: 'Nasi Goreng Spesial', category: 'Makanan', price: 20000, cost: 14000, stock: 45, minStock: 10, isActive: 1 },
    { name: 'Es Teh Manis', category: 'Minuman', price: 5000, cost: 2000, stock: 100, minStock: 20, isActive: 1 },
    { name: 'Kopi Susu Gula Aren', category: 'Minuman', price: 15000, cost: 8000, stock: 60, minStock: 15, isActive: 1 },
    { name: 'Mie Goreng Telur', category: 'Makanan', price: 15000, cost: 10000, stock: 30, minStock: 5, isActive: 1 }
  ];
  await db.products.bulkAdd(products);

  const customers = [
    { name: 'Budi Santoso', phone: '081234567891', address: 'Jl. Sudirman No 1' },
    { name: 'Siti Aminah', phone: '081234567892', address: 'Jl. Thamrin No 2' }
  ];
  await db.customers.bulkAdd(customers);

  // Generate some dummy transactions
  const txDummy = [];
  const now = new Date();

  for (let i = 1; i <= 5; i++) {
    const pastDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = pastDate.toISOString();
    const dateDisplay = formatTanggal(dateStr);

    // Simulate generation of invoice number (YYYYMMDD-HHMMSS-NNN)
    const tz = 'Asia/Jakarta';
    const dPart = new Intl.DateTimeFormat('id-ID', {timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit'}).format(pastDate).split('/').reverse().join('');
    const tPart = new Intl.DateTimeFormat('id-ID', {timeZone:tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false}).format(pastDate).replace(/:/g,'').replace(/\./g,'');
    const inv = `INV-${dPart}-${tPart}-001`;

    txDummy.push({
      invoiceNumber: inv,
      txNumber: inv, // fallback
      date: dateStr,
      txDateDisplay: dateDisplay,
      customerId: 0,
      customerName: 'Pelanggan Umum',
      customerPhone: '',
      cashierId: 1,
      cashierName: 'Admin',
      items: [{ id: 1, name: 'Nasi Ayam Goreng', price: 18000, qty: i }],
      subtotal: 18000 * i,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 18000 * i,
      paymentMethod: 'Tunai',
      cashPaid: 20000 * i,
      changeAmount: (20000 * i) - (18000 * i),
      paymentRef: '-',
      status: 'selesai',
      voidReason: '',
      notes: ''
    });
  }

  await db.transactions.bulkAdd(txDummy);
}
