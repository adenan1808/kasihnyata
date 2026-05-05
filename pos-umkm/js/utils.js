// utils.js

function formatRupiah(number) {
  if (number === undefined || number === null) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number);
}

function formatTanggal(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + ' WIB';
}

function formatTanggalSingkat(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function sanitizeText(text) {
  if (!text) return '';
  // Hanya memperbolehkan karakter ASCII standar
  return text.toString().replace(/[^\x20-\x7E]/g, '');
}

async function generateInvoiceNumber() {
  const now = new Date();
  const tz = 'Asia/Jakarta';

  // Format: YYYYMMDD
  const datePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now).split('/').reverse().join('');

  // Format: HHMMSS
  const timePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(now).replace(/:/g, '').replace(/\./g, ''); // just in case dots appear

  const baseKey = datePart + timePart; // e.g. "20260505143022"

  // Ambil counter dari IndexedDB untuk detik ini
  const counterKey = 'inv_counter_' + baseKey;
  let existing = await db.settings.get(counterKey);
  const counter = existing ? parseInt(existing.value) + 1 : 1;
  await db.settings.put({ key: counterKey, value: counter });

  const pad = String(counter).padStart(3, '0');
  return `INV-${datePart}-${timePart}-${pad}`;
}

function showToast(message, type = 'info', duration = 3000) {
  const colors = {
    success: 'bg-emerald-500',
    error:   'bg-red-500',
    warning: 'bg-amber-500',
    info:    'bg-indigo-500',
    wa:      'bg-green-500',  // khusus notif WA terkirim
  };
  const icons = {
    success: 'check-circle',
    error:   'x-circle',
    warning: 'alert-triangle',
    info:    'info',
    wa:      'message-circle',
  };

  const toast = document.createElement('div');
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2
    ${colors[type] || colors.info} text-white px-4 py-3 rounded-2xl shadow-lg text-sm font-medium
    animate-[fadeInDown_0.3s_ease] max-w-[90vw]`;
  toast.innerHTML = `<i data-lucide="${icons[type] || icons.info}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${message}</span>`;

  document.body.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Modal System
function showModal(contentHTML) {
  const overlay = document.getElementById('modalOverlay');
  const sheet = document.getElementById('modalSheet');
  const content = document.getElementById('modalContent');

  content.innerHTML = contentHTML;
  lucide.createIcons({ nodes: [content] });

  overlay.classList.remove('hidden');

  // Use timeout to allow transition to work
  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    sheet.classList.remove('translate-y-full');
  }, 10);

  overlay.onclick = (e) => {
    if (e.target === overlay) hideModal();
  };
}

function hideModal() {
  const overlay = document.getElementById('modalOverlay');
  const sheet = document.getElementById('modalSheet');

  overlay.classList.add('opacity-0');
  sheet.classList.add('translate-y-full');

  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 300);
}

function showConfirmDialog(title, message, onConfirm) {
  const html = `
    <div class="text-center space-y-4">
      <div class="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
        <i data-lucide="alert-triangle" class="w-8 h-8"></i>
      </div>
      <h3 class="font-bold text-lg text-slate-800">${title}</h3>
      <p class="text-sm text-slate-500">${message}</p>
      <div class="grid grid-cols-2 gap-3 mt-6">
        <button onclick="hideModal()" class="w-full bg-slate-100 text-slate-700 font-semibold py-3 rounded-2xl hover:bg-slate-200 transition-all">
          Batal
        </button>
        <button id="btnConfirm" class="w-full bg-red-500 text-white font-semibold py-3 rounded-2xl shadow-glow hover:bg-red-600 active:scale-95 transition-all">
          Ya, Lanjutkan
        </button>
      </div>
    </div>
  `;
  showModal(html);
  document.getElementById('btnConfirm').onclick = () => {
    hideModal();
    onConfirm();
  };
}

// Loading state
function showLoading(show = true) {
  if (show) {
    if (!document.getElementById('loadingOverlay')) {
      const loading = document.createElement('div');
      loading.id = 'loadingOverlay';
      loading.className = 'fixed inset-0 bg-white/70 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center';
      loading.innerHTML = `
        <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p class="mt-4 text-sm font-semibold text-slate-600">Memproses...</p>
      `;
      document.body.appendChild(loading);
    }
  } else {
    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.remove();
  }
}
