// pos.js

let cart = [];
let customersList = [];
let selectedCustomerId = 0;
let posTaxRate = 0;

async function initPOS() {
  await loadCustomersForPOS();
  await loadProductsForPOS();

  const taxSetting = await db.settings.get('tax_rate');
  if (taxSetting) {
    posTaxRate = parseFloat(taxSetting.value);
  }
}

async function loadCustomersForPOS() {
  customersList = await db.customers.toArray();
  const select = document.getElementById('posCustomerSelect');
  if (!select) return;

  let html = `<option value="0">Pelanggan Umum</option>`;
  customersList.forEach(c => {
    html += `<option value="${c.id}">${c.name}</option>`;
  });
  select.innerHTML = html;

  select.addEventListener('change', (e) => {
    selectedCustomerId = parseInt(e.target.value);
  });
}

async function loadProductsForPOS(searchQuery = '') {
  const container = document.getElementById('posProductsGrid');
  if (!container) return;

  let products = await db.products.filter(p => p.isActive === 1).toArray();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(q));
  }

  if (products.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-8 text-slate-400">Tidak ada produk.</div>`;
    return;
  }

  container.innerHTML = products.map(p => `
    <div onclick="addToCart(${p.id})" class="bg-white rounded-2xl p-3 shadow-card hover:shadow-card-hover transition-all cursor-pointer active:scale-95 border border-transparent hover:border-indigo-200 ${p.stock <= 0 ? 'opacity-50 grayscale' : ''}">
      <div class="w-full h-16 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl flex items-center justify-center mb-2">
        <i data-lucide="package" class="w-6 h-6 text-indigo-400"></i>
      </div>
      <p class="text-xs font-semibold text-slate-800 truncate">${p.name}</p>
      <div class="flex justify-between items-end mt-0.5">
        <p class="text-xs font-bold text-indigo-600">${formatRupiah(p.price)}</p>
        <p class="text-[10px] ${p.stock > p.minStock ? 'text-slate-400' : 'text-red-500 font-bold'}">Stok: ${p.stock}</p>
      </div>
    </div>
  `).join('');

  lucide.createIcons({ nodes: [container] });
}

async function addToCart(productId) {
  const product = await db.products.get(productId);
  if (!product) return;

  if (product.stock <= 0) {
    showToast(`Stok ${product.name} habis!`, 'error');
    return;
  }

  const existingItem = cart.find(item => item.id === productId);
  if (existingItem) {
    if (existingItem.qty >= product.stock) {
      showToast(`Stok ${product.name} tidak cukup!`, 'warning');
      return;
    }
    existingItem.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      cost: product.cost,
      qty: 1
    });
  }

  renderCart();

  // Animate grid item subtly
  const gridItem = document.querySelector(`[onclick="addToCart(${productId})"]`);
  if (gridItem) {
    gridItem.classList.add('bounce-scale');
    setTimeout(() => gridItem.classList.remove('bounce-scale'), 300);
  }
}

function updateCartQty(index, change) {
  if (index < 0 || index >= cart.length) return;

  const item = cart[index];
  item.qty += change;

  if (item.qty <= 0) {
    cart.splice(index, 1);
  } else {
    // In a real scenario, re-check max stock here by querying DB
  }

  renderCart();
}

function renderCart() {
  const container = document.getElementById('posCartItems');
  const btnPay = document.getElementById('btnPosPay');
  if (!container || !btnPay) return;

  if (cart.length === 0) {
    container.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-slate-400">
      <i data-lucide="shopping-cart" class="w-12 h-12 mb-2 text-slate-200"></i>
      <p class="text-sm">Keranjang kosong</p>
    </div>`;
    btnPay.innerHTML = `Bayar Sekarang (Rp 0)`;
    btnPay.classList.add('opacity-50', 'pointer-events-none');
    lucide.createIcons({ nodes: [container] });
    return;
  }

  btnPay.classList.remove('opacity-50', 'pointer-events-none');

  let subtotal = 0;

  container.innerHTML = cart.map((item, index) => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;

    return `
      <div class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
        <div class="flex-1">
          <p class="text-sm font-semibold text-slate-800">${item.name}</p>
          <p class="text-xs text-indigo-600 font-bold">${formatRupiah(item.price)}</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onclick="updateCartQty(${index}, -1)" class="w-6 h-6 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 active:scale-95"><i data-lucide="minus" class="w-3 h-3"></i></button>
            <span class="w-6 text-center text-sm font-semibold">${item.qty}</span>
            <button onclick="updateCartQty(${index}, 1)" class="w-6 h-6 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 active:scale-95"><i data-lucide="plus" class="w-3 h-3"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const taxAmount = (subtotal * posTaxRate) / 100;
  const total = subtotal + taxAmount;

  btnPay.innerHTML = `Bayar ${formatRupiah(total)}`;

  lucide.createIcons({ nodes: [container] });
}

async function showPaymentModal() {
  if (cart.length === 0) return;

  let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  let taxAmount = (subtotal * posTaxRate) / 100;
  let total = subtotal + taxAmount;

  let customerName = 'Pelanggan Umum';
  let customerPhone = '';
  if (selectedCustomerId > 0) {
    const c = await db.customers.get(selectedCustomerId);
    if (c) {
      customerName = c.name;
      customerPhone = c.phone;
    }
  }

  const html = `
    <div class="space-y-4">
      <div class="text-center mb-6">
        <h3 class="font-bold text-lg text-slate-800">Pembayaran</h3>
        <p class="text-sm text-slate-500">Total tagihan: ${formatRupiah(total)}</p>
      </div>

      <div class="bg-indigo-50 rounded-2xl p-4 text-center mb-4">
        <p class="text-3xl font-extrabold text-indigo-600">${formatRupiah(total)}</p>
      </div>

      <div class="space-y-3">
        <label class="block text-xs font-semibold text-slate-500 mb-1.5">Metode Pembayaran</label>
        <div class="grid grid-cols-2 gap-3">
          <button id="btnPayCash" onclick="selectPaymentMethod('Tunai')" class="payment-method bg-indigo-50 border-2 border-indigo-500 text-indigo-700 py-3 rounded-2xl font-semibold transition-all">Tunai</button>
          <button id="btnPayQRIS" onclick="selectPaymentMethod('QRIS')" class="payment-method bg-slate-50 border-2 border-transparent text-slate-600 py-3 rounded-2xl font-semibold transition-all">QRIS</button>
        </div>
      </div>

      <div id="cashInputSection" class="space-y-3 mt-4">
        <label class="block text-xs font-semibold text-slate-500 mb-1.5">Uang Diterima (Rp)</label>
        <div class="relative">
          <input type="number" id="inputCashAmount" value="${total}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl px-4 py-3 text-lg font-bold text-slate-800 outline-none transition-all" oninput="calculateChange(${total})">
        </div>
        <div class="flex flex-wrap gap-2">
          ${[total, 50000, 100000].filter((val, i, arr) => val >= total && arr.indexOf(val) === i).map(amount =>
            `<button onclick="document.getElementById('inputCashAmount').value=${amount}; calculateChange(${total})" class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold active:scale-95">${formatRupiah(amount)}</button>`
          ).join('')}
        </div>
        <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl mt-2">
          <span class="text-sm font-medium text-slate-500">Kembalian</span>
          <span id="changeAmountDisplay" class="font-bold text-emerald-600 text-lg">Rp 0</span>
        </div>
      </div>

      <button id="btnProcessPayment" onclick="processPayment()" class="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-4 rounded-2xl shadow-glow hover:shadow-glow active:scale-[0.98] transition-all mt-6">
        Selesaikan Transaksi
      </button>
    </div>
  `;

  showModal(html);

  // Save temp state
  window.tempPaymentState = {
    subtotal, taxAmount, total, method: 'Tunai', customerName, customerPhone
  };
}

function selectPaymentMethod(method) {
  window.tempPaymentState.method = method;

  document.querySelectorAll('.payment-method').forEach(el => {
    el.className = "payment-method bg-slate-50 border-2 border-transparent text-slate-600 py-3 rounded-2xl font-semibold transition-all";
  });

  const btnId = method === 'Tunai' ? 'btnPayCash' : 'btnPayQRIS';
  document.getElementById(btnId).className = "payment-method bg-indigo-50 border-2 border-indigo-500 text-indigo-700 py-3 rounded-2xl font-semibold transition-all";

  const cashSection = document.getElementById('cashInputSection');
  if (method === 'Tunai') {
    cashSection.style.display = 'block';
    document.getElementById('btnProcessPayment').textContent = 'Selesaikan Transaksi';
    document.getElementById('btnProcessPayment').setAttribute('onclick', 'processPayment()');
  } else if (method === 'QRIS') {
    cashSection.style.display = 'none';
    document.getElementById('btnProcessPayment').textContent = 'Tampilkan QRIS';
    document.getElementById('btnProcessPayment').setAttribute('onclick', 'startQRISPayment()');
  }
}

function calculateChange(total) {
  const cashInput = document.getElementById('inputCashAmount');
  if (!cashInput) return;
  const cash = parseInt(cashInput.value) || 0;
  const change = cash - total;

  const display = document.getElementById('changeAmountDisplay');
  if (change >= 0) {
    display.textContent = formatRupiah(change);
    display.className = "font-bold text-emerald-600 text-lg";
    document.getElementById('btnProcessPayment').disabled = false;
    document.getElementById('btnProcessPayment').classList.remove('opacity-50');
  } else {
    display.textContent = "Uang Kurang!";
    display.className = "font-bold text-red-500 text-lg";
    document.getElementById('btnProcessPayment').disabled = true;
    document.getElementById('btnProcessPayment').classList.add('opacity-50');
  }
}

async function processPayment(paymentRef = '-') {
  showLoading(true);
  try {
    const { subtotal, taxAmount, total, method, customerName, customerPhone } = window.tempPaymentState;

    let cashPaid = 0;
    let changeAmount = 0;

    if (method === 'Tunai') {
      cashPaid = parseInt(document.getElementById('inputCashAmount').value) || 0;
      if (cashPaid < total) throw new Error("Uang tidak cukup");
      changeAmount = cashPaid - total;
    }

    const invoiceNumber = await generateInvoiceNumber();
    const nowISO = new Date().toISOString();

    const tx = {
      invoiceNumber: invoiceNumber,
      txNumber: invoiceNumber,
      date: nowISO,
      txDateDisplay: formatTanggal(nowISO),
      customerId: selectedCustomerId,
      customerName: sanitizeText(customerName),
      customerPhone: sanitizeText(customerPhone),
      cashierId: currentUser ? currentUser.id : 1,
      cashierName: sanitizeText(currentUser ? currentUser.name : 'Admin'),
      items: JSON.parse(JSON.stringify(cart)),
      subtotal: subtotal,
      discountAmount: 0,
      taxRate: posTaxRate,
      taxAmount: taxAmount,
      total: total,
      paymentMethod: method,
      cashPaid: cashPaid,
      changeAmount: changeAmount,
      paymentRef: sanitizeText(paymentRef),
      status: 'selesai',
      voidReason: '',
      notes: ''
    };

    // Update Stock
    for (let item of tx.items) {
      const product = await db.products.get(item.id);
      if (product) {
        await db.products.update(product.id, { stock: product.stock - item.qty });
      }
    }

    // Save transaction
    await db.transactions.add(tx);

    // Notifications
    await kirimNotifikasiTransaksi(tx);
    await cekDanKirimNotifStok();

    hideModal();
    cart = [];
    renderCart();
    await loadProductsForPOS(document.getElementById('posSearchInput')?.value);

    showToast("Transaksi Berhasil!", "success");
    showModal(getSuccessModalHTML(tx));

  } catch (error) {
    console.error("Gagal bayar:", error);
    showToast(error.message || "Transaksi gagal", "error");
  } finally {
    showLoading(false);
  }
}

function getSuccessModalHTML(tx) {
  return `
    <div class="text-center space-y-4">
      <div class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2 relative">
        <i data-lucide="check" class="w-10 h-10"></i>
        <!-- particle fx placeholder -->
      </div>
      <h3 class="font-extrabold text-2xl text-slate-800">Pembayaran Berhasil!</h3>
      <p class="text-sm text-slate-500">Invoice: <span class="font-mono text-slate-800">${tx.invoiceNumber}</span></p>

      <div class="bg-slate-50 rounded-2xl p-4 mt-4">
        <p class="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Total Kembalian</p>
        <p class="text-2xl font-extrabold text-emerald-600">${formatRupiah(tx.changeAmount)}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-6">
        <button onclick="hideModal()" class="bg-slate-100 text-slate-700 font-semibold py-3 rounded-2xl hover:bg-slate-200 transition-all">
          Tutup
        </button>
        <button onclick="cetakStrukTx('${tx.invoiceNumber}')" class="bg-indigo-500 text-white font-semibold py-3 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all flex items-center justify-center gap-2">
          <i data-lucide="printer" class="w-4 h-4"></i> Cetak Struk
        </button>
      </div>
    </div>
  `;
}

// Global hook for printing from success modal
async function cetakStrukTx(inv) {
  const txArr = await db.transactions.filter(t => t.invoiceNumber === inv).toArray();
  if (txArr.length > 0) {
    if (typeof cetakStruk === 'function') {
      cetakStruk(txArr[0]);
    } else {
      showToast('Fungsi cetak tidak ditemukan', 'error');
    }
  }
}

// UI Setup
function renderPOSPage() {
  const page = document.getElementById('kasir-content');
  if (!page) return;

  page.innerHTML = `
    <!-- Top Bar -->
    <div class="flex items-center gap-2 mb-4">
      <div class="relative flex-1">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
        <input type="text" id="posSearchInput" placeholder="Cari produk..." class="w-full bg-white border-2 border-transparent focus:border-indigo-400 rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none shadow-sm transition-all">
      </div>
      <button onclick="document.getElementById('posSearchInput').value=''; loadProductsForPOS()" class="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-500 active:scale-95 transition-all">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <div class="mb-4">
      <select id="posCustomerSelect" class="w-full bg-white border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none shadow-sm transition-all appearance-none">
        <option value="0">Pelanggan Umum</option>
      </select>
    </div>

    <!-- Products Grid -->
    <div id="posProductsGrid" class="grid grid-cols-3 gap-3 mb-6">
      <!-- loaded via JS -->
    </div>

    <!-- Cart Section (Sticky Bottom inside view) -->
    <div class="bg-white rounded-3xl p-4 shadow-card">
      <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
        <h3 class="font-bold text-slate-800">Keranjang</h3>
        <button onclick="cart=[]; renderCart()" class="text-xs font-semibold text-red-500 hover:text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">Kosongkan</button>
      </div>

      <div id="posCartItems" class="max-h-40 overflow-y-auto mb-4 space-y-1 pr-1">
        <!-- cart items -->
      </div>

      <button id="btnPosPay" onclick="showPaymentModal()" class="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold py-4 rounded-2xl shadow-glow pulse-glow hover:shadow-glow active:scale-[0.98] transition-all opacity-50 pointer-events-none">
        Bayar Sekarang (Rp 0)
      </button>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });

  document.getElementById('posSearchInput').addEventListener('input', (e) => {
    loadProductsForPOS(e.target.value);
  });

  initPOS();
  renderCart();
}
