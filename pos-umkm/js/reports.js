// reports.js

let salesChart = null;

async function renderDashboard() {
  const page = document.getElementById('dashboard-content');
  if (!page) return;

  const today = new Date();
  today.setHours(0,0,0,0);

  const txs = await db.transactions.where('status').equals('selesai').toArray();

  let todaySales = 0;
  let todayTxCount = 0;
  let thisMonthSales = 0;

  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  txs.forEach(t => {
    const d = new Date(t.date);
    if (d >= today) {
      todaySales += t.total;
      todayTxCount++;
    }
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      thisMonthSales += t.total;
    }
  });

  page.innerHTML = `
    <!-- Hero Stats -->
    <div class="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-5 text-white shadow-glow mb-4">
      <p class="text-indigo-200 text-xs font-medium mb-1">Total Penjualan Hari Ini</p>
      <p class="text-3xl font-extrabold mb-4">${formatRupiah(todaySales)}</p>

      <div class="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
        <div>
          <p class="text-[10px] text-indigo-200 uppercase tracking-wider mb-0.5">Bulan Ini</p>
          <p class="font-bold">${formatRupiah(thisMonthSales)}</p>
        </div>
        <div>
          <p class="text-[10px] text-indigo-200 uppercase tracking-wider mb-0.5">Transaksi Hari Ini</p>
          <p class="font-bold">${todayTxCount} <span class="text-xs font-normal text-indigo-200">Trx</span></p>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-4 gap-3 mb-4">
      <button onclick="document.querySelector('[data-page=\\'kasir\\']').click()" class="bg-white p-3 rounded-2xl shadow-card hover:shadow-card-hover transition-all flex flex-col items-center justify-center gap-2">
        <div class="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <i data-lucide="shopping-cart" class="w-5 h-5"></i>
        </div>
        <span class="text-[10px] font-bold text-slate-600">Kasir</span>
      </button>
      <button onclick="document.querySelector('[data-page=\\'produk\\']').click()" class="bg-white p-3 rounded-2xl shadow-card hover:shadow-card-hover transition-all flex flex-col items-center justify-center gap-2">
        <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <i data-lucide="package" class="w-5 h-5"></i>
        </div>
        <span class="text-[10px] font-bold text-slate-600">Produk</span>
      </button>
      <button onclick="document.querySelector('[data-page=\\'lainnya\\']').click(); setTimeout(()=>switchPage('pengeluaran'), 100)" class="bg-white p-3 rounded-2xl shadow-card hover:shadow-card-hover transition-all flex flex-col items-center justify-center gap-2">
        <div class="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <i data-lucide="receipt" class="w-5 h-5"></i>
        </div>
        <span class="text-[10px] font-bold text-slate-600">Kas Keluar</span>
      </button>
      <button onclick="document.querySelector('[data-page=\\'lainnya\\']').click(); setTimeout(()=>switchPage('transaksi'), 100)" class="bg-white p-3 rounded-2xl shadow-card hover:shadow-card-hover transition-all flex flex-col items-center justify-center gap-2">
        <div class="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
          <i data-lucide="history" class="w-5 h-5"></i>
        </div>
        <span class="text-[10px] font-bold text-slate-600">Riwayat</span>
      </button>
    </div>

    <!-- Chart -->
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-slate-800">Grafik 7 Hari Terakhir</h3>
      </div>
      <div class="relative h-48 w-full">
        <canvas id="salesChartCanvas"></canvas>
      </div>
    </div>

    <div class="text-center mt-8">
       <button class="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-2xl text-xs font-semibold" onclick="generateReport()">Unduh Laporan Excel (Pro)</button>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });
  renderChart(txs);
}

function renderChart(txs) {
  const ctx = document.getElementById('salesChartCanvas');
  if (!ctx) return;

  // Last 7 days data
  const labels = [];
  const data = [];

  const today = new Date();
  today.setHours(0,0,0,0);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - (i * 24 * 60 * 60 * 1000));
    labels.push(d.toLocaleDateString('id-ID', { weekday: 'short' }));

    const dayTotal = txs.filter(t => {
      const td = new Date(t.date);
      td.setHours(0,0,0,0);
      return td.getTime() === d.getTime();
    }).reduce((sum, t) => sum + t.total, 0);

    data.push(dayTotal);
  }

  if (salesChart) salesChart.destroy();

  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Penjualan',
        data: data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#6366f1',
        pointBorderWidth: 2,
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return formatRupiah(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          display: false
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: '#94a3b8' }
        }
      }
    }
  });
}

async function generateReport() {
  const premium = await isPremium();
  if (!premium) {
    showToast("Fitur Laporan Excel hanya untuk pengguna PRO", "warning");
    return;
  }
  showToast("Mengunduh laporan... (Mock)", "success");
}
