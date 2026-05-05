// payment-qris.js

function startQRISPayment() {
  const { total } = window.tempPaymentState;

  const html = `
    <div class="text-center space-y-4">
      <h3 class="font-bold text-lg text-slate-800">Pembayaran QRIS</h3>
      <p class="text-sm text-slate-500 mb-2">Total: <span class="font-bold text-indigo-600">${formatRupiah(total)}</span></p>

      <div class="bg-white p-4 rounded-3xl border-2 border-indigo-100 shadow-sm mx-auto w-64 h-64 flex items-center justify-center mb-4">
        <!-- Ini adalah simulasi gambar QRIS Statis -->
        <div class="text-center">
          <i data-lucide="qr-code" class="w-32 h-32 text-slate-800 mx-auto mb-2"></i>
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">QRIS GPN</p>
        </div>
      </div>

      <p class="text-xs text-slate-500 mb-4 px-4">Minta pelanggan scan QR di atas menggunakan aplikasi m-Banking atau E-Wallet.</p>

      <div class="space-y-3">
        <label class="block text-xs font-semibold text-slate-500 mb-1.5 text-left">Nomor Referensi (Opsional)</label>
        <input type="text" id="qrisRefInput" placeholder="Masukkan jika ada..." class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
      </div>

      <div class="grid grid-cols-2 gap-3 mt-6">
        <button onclick="showPaymentModal()" class="w-full bg-slate-100 text-slate-700 font-semibold py-3 rounded-2xl hover:bg-slate-200 transition-all">
          Kembali
        </button>
        <button onclick="processPayment(document.getElementById('qrisRefInput').value)" class="w-full bg-indigo-500 text-white font-semibold py-3 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all">
          Verifikasi & Selesai
        </button>
      </div>
    </div>
  `;

  showModal(html);
}
