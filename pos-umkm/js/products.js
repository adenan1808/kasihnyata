// products.js

async function renderProductsPage() {
  const page = document.getElementById('produk-content');
  if (!page) return;

  page.innerHTML = `
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
            <i data-lucide="package" class="w-4 h-4 text-indigo-600"></i>
          </span>
          Kelola Produk
        </h3>
        <button onclick="showProductModal()" class="w-10 h-10 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white rounded-xl shadow-glow flex items-center justify-center transition-all">
          <i data-lucide="plus" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="relative mb-4">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
        <input type="text" id="productSearchInput" placeholder="Cari nama produk..." class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all">
      </div>

      <div id="productList" class="space-y-3">
        <!-- populated by JS -->
      </div>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });

  document.getElementById('productSearchInput').addEventListener('input', (e) => {
    loadProducts(e.target.value);
  });

  await loadProducts();
}

async function loadProducts(searchQuery = '') {
  const listContainer = document.getElementById('productList');
  if (!listContainer) return;

  let products = await db.products.toArray();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(q));
  }

  if (products.length === 0) {
    listContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">Belum ada produk.</div>`;
    return;
  }

  listContainer.innerHTML = products.map(p => `
    <div onclick="showProductModal(${p.id})" class="bg-slate-50 rounded-2xl p-4 cursor-pointer hover:bg-slate-100 active:scale-[0.98] transition-all border border-transparent hover:border-indigo-100 flex items-center gap-4 ${p.isActive === 0 ? 'opacity-50 grayscale' : ''}">
      <div class="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
        <i data-lucide="package" class="w-6 h-6 text-slate-400"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between">
          <p class="text-sm font-bold text-slate-800 truncate">${p.name}</p>
          <p class="text-sm font-extrabold text-indigo-600 pl-2">${formatRupiah(p.price)}</p>
        </div>
        <div class="flex items-center gap-3 mt-1">
          <p class="text-xs ${p.stock <= p.minStock ? 'text-red-500 font-bold' : 'text-slate-500'}">Stok: ${p.stock}</p>
          <span class="w-1 h-1 rounded-full bg-slate-300"></span>
          <p class="text-xs text-slate-500">${p.category || 'Umum'}</p>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons({ nodes: [listContainer] });
}

async function showProductModal(id = null) {
  if (!id) {
    const count = await db.products.count();
    const canAdd = await checkProductLimit(count);
    if (!canAdd) return;
  }

  let product = { name: '', price: '', cost: '', stock: '', minStock: '5', category: '', isActive: 1 };

  if (id) {
    product = await db.products.get(id);
  }

  const html = `
    <div class="space-y-4">
      <h3 class="font-bold text-lg text-slate-800 text-center mb-6">${id ? 'Edit Produk' : 'Tambah Produk'}</h3>

      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Nama Produk *</label>
          <input type="text" id="prodName" value="${product.name}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all" required>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">Harga Jual (Rp) *</label>
            <input type="number" id="prodPrice" value="${product.price}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all" required>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">Modal (Rp)</label>
            <input type="number" id="prodCost" value="${product.cost}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">Stok Saat Ini *</label>
            <input type="number" id="prodStock" value="${product.stock}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all" required>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">Min. Stok</label>
            <input type="number" id="prodMinStock" value="${product.minStock}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Kategori</label>
          <input type="text" id="prodCat" value="${product.category || ''}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
        </div>

        <div class="flex items-center justify-between py-2">
          <label class="text-sm font-semibold text-slate-700">Aktif Dijual</label>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="prodActive" class="sr-only peer" ${product.isActive ? 'checked' : ''}>
            <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
          </label>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-6">
        ${id ? `
          <button onclick="deleteProduct(${id})" class="bg-red-50 text-red-600 font-semibold py-4 rounded-2xl hover:bg-red-100 transition-all flex items-center justify-center gap-2">
            <i data-lucide="trash-2" class="w-4 h-4"></i> Hapus
          </button>
        ` : `
          <button onclick="hideModal()" class="bg-slate-100 text-slate-700 font-semibold py-4 rounded-2xl hover:bg-slate-200 transition-all">
            Batal
          </button>
        `}
        <button onclick="saveProduct(${id || 'null'})" class="bg-indigo-500 text-white font-semibold py-4 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all">
          Simpan
        </button>
      </div>
    </div>
  `;
  showModal(html);
}

async function saveProduct(id) {
  const name = document.getElementById('prodName').value.trim();
  const price = parseInt(document.getElementById('prodPrice').value);
  const stock = parseInt(document.getElementById('prodStock').value);

  if (!name || isNaN(price) || isNaN(stock)) {
    showToast("Nama, Harga, dan Stok wajib diisi dengan benar", "warning");
    return;
  }

  const payload = {
    name: sanitizeText(name),
    price: price,
    cost: parseInt(document.getElementById('prodCost').value) || 0,
    stock: stock,
    minStock: parseInt(document.getElementById('prodMinStock').value) || 0,
    category: sanitizeText(document.getElementById('prodCat').value.trim()),
    isActive: document.getElementById('prodActive').checked ? 1 : 0
  };

  showLoading(true);
  try {
    if (id) {
      await db.products.update(id, payload);
      showToast("Produk diperbarui", "success");
    } else {
      await db.products.add(payload);
      showToast("Produk ditambahkan", "success");
    }
    hideModal();
    await loadProducts(document.getElementById('productSearchInput')?.value);
  } catch (e) {
    showToast("Gagal menyimpan produk", "error");
  } finally {
    showLoading(false);
  }
}

function deleteProduct(id) {
  showConfirmDialog(
    "Hapus Produk?",
    "Produk akan dihapus permanen. Transaksi lama tetap aman.",
    async () => {
      showLoading(true);
      try {
        await db.products.delete(id);
        hideModal();
        await loadProducts(document.getElementById('productSearchInput')?.value);
        showToast("Produk dihapus", "success");
      } catch (e) {
        showToast("Gagal menghapus", "error");
      } finally {
        showLoading(false);
      }
    }
  );
}
