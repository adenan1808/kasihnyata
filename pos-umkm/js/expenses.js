// expenses.js

async function renderExpensesPage() {
  const page = document.getElementById('pengeluaran-content');
  if (!page) return;

  page.innerHTML = `
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
            <i data-lucide="receipt" class="w-4 h-4 text-red-600"></i>
          </span>
          Kas Keluar
        </h3>
        <button onclick="showExpenseModal()" class="w-10 h-10 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-xl shadow-glow flex items-center justify-center transition-all">
          <i data-lucide="plus" class="w-5 h-5"></i>
        </button>
      </div>

      <div id="expenseList" class="space-y-3">
        <!-- populated by JS -->
      </div>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });
  await loadExpenses();
}

async function loadExpenses() {
  const listContainer = document.getElementById('expenseList');
  if (!listContainer) return;

  const expenses = await db.expenses.orderBy('date').reverse().toArray();

  if (expenses.length === 0) {
    listContainer.innerHTML = `<div class="text-center py-8 text-slate-400 text-sm">Belum ada pengeluaran dicatat.</div>`;
    return;
  }

  listContainer.innerHTML = expenses.map(e => `
    <div onclick="showExpenseModal(${e.id})" class="bg-slate-50 rounded-2xl p-4 cursor-pointer hover:bg-slate-100 active:scale-[0.98] transition-all border border-transparent hover:border-red-100 flex items-center justify-between">
      <div>
        <p class="text-sm font-bold text-slate-800">${e.note || e.category}</p>
        <p class="text-xs text-slate-500 mt-0.5">${formatTanggalSingkat(e.date)} &bull; ${e.category}</p>
      </div>
      <p class="text-sm font-extrabold text-red-600">-${formatRupiah(e.amount)}</p>
    </div>
  `).join('');
}

async function showExpenseModal(id = null) {
  let expense = { amount: '', category: 'Operasional', note: '', date: new Date().toISOString().slice(0, 10) };

  if (id) {
    const e = await db.expenses.get(id);
    if (e) {
      expense = e;
      if (expense.date.includes('T')) {
        expense.date = expense.date.split('T')[0];
      }
    }
  }

  const html = `
    <div class="space-y-4">
      <h3 class="font-bold text-lg text-slate-800 text-center mb-6">${id ? 'Edit Pengeluaran' : 'Catat Pengeluaran'}</h3>

      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Nominal (Rp) *</label>
          <input type="number" id="expAmount" value="${expense.amount}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-lg font-bold text-slate-800 outline-none transition-all" required>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal</label>
          <input type="date" id="expDate" value="${expense.date}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Kategori</label>
          <select id="expCat" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all appearance-none">
            <option value="Operasional" ${expense.category === 'Operasional' ? 'selected' : ''}>Operasional</option>
            <option value="Bahan Baku" ${expense.category === 'Bahan Baku' ? 'selected' : ''}>Bahan Baku</option>
            <option value="Gaji" ${expense.category === 'Gaji' ? 'selected' : ''}>Gaji</option>
            <option value="Lainnya" ${expense.category === 'Lainnya' ? 'selected' : ''}>Lainnya</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Keterangan</label>
          <input type="text" id="expNote" value="${expense.note}" placeholder="Contoh: Beli token listrik" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mt-6">
        ${id ? `
          <button onclick="deleteExpense(${id})" class="bg-red-50 text-red-600 font-semibold py-4 rounded-2xl hover:bg-red-100 transition-all flex items-center justify-center gap-2">
            <i data-lucide="trash-2" class="w-4 h-4"></i> Hapus
          </button>
        ` : `
          <button onclick="hideModal()" class="bg-slate-100 text-slate-700 font-semibold py-4 rounded-2xl hover:bg-slate-200 transition-all">
            Batal
          </button>
        `}
        <button onclick="saveExpense(${id || 'null'})" class="bg-indigo-500 text-white font-semibold py-4 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all">
          Simpan
        </button>
      </div>
    </div>
  `;
  showModal(html);
}

async function saveExpense(id) {
  const amount = parseInt(document.getElementById('expAmount').value);
  const dateVal = document.getElementById('expDate').value;

  if (isNaN(amount) || amount <= 0 || !dateVal) {
    showToast("Nominal dan tanggal wajib diisi dengan benar", "warning");
    return;
  }

  const payload = {
    amount: amount,
    date: new Date(dateVal).toISOString(),
    category: document.getElementById('expCat').value,
    note: sanitizeText(document.getElementById('expNote').value.trim())
  };

  showLoading(true);
  try {
    if (id) {
      await db.expenses.update(id, payload);
      showToast("Pengeluaran diperbarui", "success");
    } else {
      await db.expenses.add(payload);
      showToast("Pengeluaran dicatat", "success");
    }
    hideModal();
    await loadExpenses();
  } catch (e) {
    showToast("Gagal menyimpan pengeluaran", "error");
  } finally {
    showLoading(false);
  }
}

function deleteExpense(id) {
  showConfirmDialog(
    "Hapus Pengeluaran?",
    "Data pengeluaran akan dihapus.",
    async () => {
      showLoading(true);
      try {
        await db.expenses.delete(id);
        hideModal();
        await loadExpenses();
        showToast("Pengeluaran dihapus", "success");
      } catch (e) {
        showToast("Gagal menghapus", "error");
      } finally {
        showLoading(false);
      }
    }
  );
}
