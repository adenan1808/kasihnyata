// app.js

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await initAuth();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  }
});

async function renderApp() {
  await updateTierBadge();
  const storeName = await db.settings.get('store_name');
  if (storeName) {
    const el = document.getElementById('storeName');
    if (el) el.textContent = storeName.value;
  }

  // Setup Router
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchPage(tab.dataset.page);
    });
  });

  // Default page
  switchPage('dashboard');
}

function switchPage(pageId) {
  // Update Nav
  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.dataset.page === pageId) {
      tab.classList.remove('text-slate-400');
      tab.classList.add('text-indigo-600', 'bg-indigo-50');
    } else {
      tab.classList.add('text-slate-400');
      tab.classList.remove('text-indigo-600', 'bg-indigo-50');
    }
  });

  // Toggle Page Visibility
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  // Route Handler
  switch (pageId) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'kasir':
      renderPOSPage();
      break;
    case 'produk':
      renderProductsPage();
      break;
    case 'pelanggan':
      renderCustomersPage();
      break;
    case 'transaksi':
      renderTransactionsPage();
      break;
    case 'pengeluaran':
      renderExpensesPage();
      break;
    case 'settings':
      renderSettingsPage();
      break;
    case 'lainnya':
      renderLainnyaPage();
      break;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLainnyaPage() {
  const page = document.getElementById('lainnya-content');
  if (!page) return;

  page.innerHTML = `
    <div class="bg-white rounded-3xl shadow-card overflow-hidden">
      <div class="p-4 border-b border-slate-50 bg-slate-50/50">
        <h3 class="font-bold text-slate-800">Menu Tambahan</h3>
      </div>
      <div class="divide-y divide-slate-50">
        <button onclick="switchPage('transaksi')" class="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all active:bg-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <i data-lucide="history" class="w-5 h-5"></i>
            </div>
            <span class="font-semibold text-slate-700">Riwayat Transaksi</span>
          </div>
          <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300"></i>
        </button>
        <button onclick="switchPage('pengeluaran')" class="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all active:bg-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <i data-lucide="receipt" class="w-5 h-5"></i>
            </div>
            <span class="font-semibold text-slate-700">Catat Pengeluaran</span>
          </div>
          <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300"></i>
        </button>
        <button onclick="switchPage('settings')" class="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all active:bg-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <i data-lucide="settings" class="w-5 h-5"></i>
            </div>
            <span class="font-semibold text-slate-700">Pengaturan Toko & WA</span>
          </div>
          <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300"></i>
        </button>
      </div>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });
}
