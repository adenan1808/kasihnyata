// customers.js

async function renderCustomersPage() {
  const page = document.getElementById('pelanggan-content');
  if (!page) return;

  page.innerHTML = `
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
            <i data-lucide="users" class="w-4 h-4 text-indigo-600"></i>
          </span>
          Pelanggan
        </h3>
        <button onclick="showCustomerModal()" class="w-10 h-10 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white rounded-xl shadow-glow flex items-center justify-center transition-all">
          <i data-lucide="user-plus" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="relative mb-4">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
        <input type="text" id="custSearchInput" placeholder="Cari nama atau nomor HP..." class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl pl-10 pr-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all">
      </div>

      <div id="customerList" class="space-y-3">
        <!-- populated by JS -->
      </div>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });

  document.getElementById('custSearchInput').addEventListener('input', (e) => {
    loadCustomers(e.target.value);
  });

  await loadCustomers();
}

async function loadCustomers(searchQuery = '') {
  const listContainer = document.getElementById('customerList');
  if (!listContainer) return;

  let customers = await db.customers.toArray();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    customers = customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q))
    );
  }

  if (customers.length === 0) {
    listContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">Belum ada pelanggan.</div>`;
    return;
  }

  listContainer.innerHTML = customers.map(c => `
    <div onclick="showCustomerModal(${c.id})" class="bg-slate-50 rounded-2xl p-4 cursor-pointer hover:bg-slate-100 active:scale-[0.98] transition-all border border-transparent hover:border-indigo-100 flex items-center gap-4">
      <div class="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg">
        ${c.name.charAt(0).toUpperCase()}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-slate-800 truncate">${c.name}</p>
        <p class="text-xs text-slate-500 mt-0.5">${c.phone || '-'}</p>
      </div>
      <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300"></i>
    </div>
  `).join('');

  lucide.createIcons({ nodes: [listContainer] });
}

async function showCustomerModal(id = null) {
  let customer = { name: '', phone: '', address: '', notes: '' };

  if (id) {
    customer = await db.customers.get(id);
  }

  const html = `
    <div class="space-y-4">
      <h3 class="font-bold text-lg text-slate-800 text-center mb-6">${id ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</h3>

      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Nama Lengkap *</label>
          <input type="text" id="custName" value="${customer.name}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all" required>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Nomor WhatsApp</label>
          <input type="tel" id="custPhone" value="${customer.phone}" placeholder="Cth: 08123456789" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
          <p class="text-[10px] text-slate-400 mt-1">Digunakan untuk mengirim struk/notifikasi via WA</p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Alamat</label>
          <textarea id="custAddr" rows="2" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">${customer.address}</textarea>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-6">
        ${id ? `
          <button onclick="deleteCustomer(${id})" class="bg-red-50 text-red-600 font-semibold py-4 rounded-2xl hover:bg-red-100 transition-all flex items-center justify-center gap-2">
            <i data-lucide="trash-2" class="w-4 h-4"></i> Hapus
          </button>
        ` : `
          <button onclick="hideModal()" class="bg-slate-100 text-slate-700 font-semibold py-4 rounded-2xl hover:bg-slate-200 transition-all">
            Batal
          </button>
        `}
        <button onclick="saveCustomer(${id || 'null'})" class="bg-indigo-500 text-white font-semibold py-4 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all">
          Simpan
        </button>
      </div>
    </div>
  `;
  showModal(html);
}

async function saveCustomer(id) {
  const name = document.getElementById('custName').value.trim();

  if (!name) {
    showToast("Nama wajib diisi", "warning");
    return;
  }

  const payload = {
    name: sanitizeText(name),
    phone: sanitizeText(document.getElementById('custPhone').value.trim()),
    address: sanitizeText(document.getElementById('custAddr').value.trim()),
    notes: ''
  };

  showLoading(true);
  try {
    if (id) {
      await db.customers.update(id, payload);
      showToast("Data pelanggan diperbarui", "success");
    } else {
      await db.customers.add(payload);
      showToast("Pelanggan ditambahkan", "success");
    }
    hideModal();
    await loadCustomers(document.getElementById('custSearchInput')?.value);
  } catch (e) {
    showToast("Gagal menyimpan data", "error");
  } finally {
    showLoading(false);
  }
}

function deleteCustomer(id) {
  showConfirmDialog(
    "Hapus Pelanggan?",
    "Data pelanggan akan dihapus permanen.",
    async () => {
      showLoading(true);
      try {
        await db.customers.delete(id);
        hideModal();
        await loadCustomers(document.getElementById('custSearchInput')?.value);
        showToast("Pelanggan dihapus", "success");
      } catch (e) {
        showToast("Gagal menghapus", "error");
      } finally {
        showLoading(false);
      }
    }
  );
}
