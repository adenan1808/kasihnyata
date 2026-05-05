// settings.js

async function renderSettingsPage() {
  const page = document.getElementById('settings-content');
  if (!page) return;

  const storeName = (await db.settings.get('store_name'))?.value || '';
  const storePhone = (await db.settings.get('store_phone'))?.value || '';
  const storeAddress = (await db.settings.get('store_address'))?.value || '';
  const taxRate = (await db.settings.get('tax_rate'))?.value || 0;

  const waEnabled = (await db.settings.get('fonnte_enabled'))?.value || false;
  const adminNumber = (await db.settings.get('wa_admin_number'))?.value || '';
  const notifAdmin = (await db.settings.get('wa_notif_on_sale'))?.value || false;
  const notifCustomer = (await db.settings.get('wa_notif_to_customer'))?.value || false;
  const notifStock = (await db.settings.get('wa_notif_on_low_stock'))?.value || false;
  const lastWaStatus = (await db.settings.get('wa_last_notif'))?.value;

  page.innerHTML = `
    <!-- Pengaturan Toko -->
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
          <i data-lucide="store" class="w-4 h-4 text-indigo-600"></i>
        </span>
        Profil Toko
      </h3>

      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Nama Toko</label>
          <input type="text" id="setStoreName" value="${storeName}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">No WhatsApp Toko</label>
          <input type="tel" id="setStorePhone" value="${storePhone}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Alamat</label>
          <textarea id="setStoreAddress" rows="2" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">${storeAddress}</textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Pajak / PPN (%)</label>
          <input type="number" id="setTaxRate" value="${taxRate}" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all">
        </div>
        <button onclick="saveStoreSettings()" class="w-full bg-indigo-500 text-white font-semibold py-3 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all mt-2">
          Simpan Profil
        </button>
      </div>
    </div>

    <!-- Pengaturan WA -->
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
          <i data-lucide="message-circle" class="w-4 h-4 text-green-600"></i>
        </span>
        Notifikasi WhatsApp
      </h3>

      <div class="flex items-center justify-between py-3 border-b border-slate-100">
        <div>
          <p class="text-sm font-semibold text-slate-700">Aktifkan WA Notifikasi</p>
          <p class="text-xs text-slate-400">Menggunakan Fonnte API</p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="toggleWA" class="sr-only peer" ${waEnabled ? 'checked' : ''} onchange="saveWASettings()">
          <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
        </label>
      </div>

      <div class="py-3 border-b border-slate-100">
        <label class="block text-xs font-semibold text-slate-500 mb-1.5">Fonnte Token</label>
        <div class="relative">
          <input type="password" id="inputFonnteToken" placeholder="[Token terenkripsi] Isi untuk update" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all pr-12">
          <button onclick="toggleShowToken()" class="absolute right-3 top-1/2 -translate-y-1/2">
            <i data-lucide="eye" class="w-4 h-4 text-slate-400"></i>
          </button>
        </div>
        <p class="text-xs text-slate-400 mt-1">Daftar dan ambil token di fonnte.com</p>
      </div>

      <div class="py-3 border-b border-slate-100">
        <label class="block text-xs font-semibold text-slate-500 mb-1.5">Nomor WA Admin/Owner</label>
        <input type="tel" id="inputAdminWA" value="${adminNumber}" placeholder="628123456789 (format 62xxx)" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-all">
      </div>

      <div class="space-y-3 py-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-slate-700">Notif tiap transaksi ke admin</p>
          <input type="checkbox" id="toggleNotifAdmin" class="w-4 h-4 accent-indigo-500" ${notifAdmin ? 'checked' : ''}>
        </div>
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-slate-700">Kirim struk ke pelanggan via WA</p>
          <input type="checkbox" id="toggleNotifPelanggan" class="w-4 h-4 accent-indigo-500" ${notifCustomer ? 'checked' : ''}>
        </div>
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-slate-700">Notif stok menipis ke admin</p>
          <input type="checkbox" id="toggleNotifStok" class="w-4 h-4 accent-indigo-500" ${notifStock ? 'checked' : ''}>
        </div>
      </div>

      <button onclick="saveWASettings(true)" class="w-full bg-indigo-500 text-white font-semibold py-3 rounded-2xl shadow-glow hover:bg-indigo-600 active:scale-95 transition-all mt-2">
        Simpan Pengaturan WA
      </button>

      <button onclick="testKirimWA()" class="w-full bg-green-50 text-green-700 font-semibold py-3 rounded-2xl hover:bg-green-100 transition-all mt-3 flex items-center justify-center gap-2">
        <i data-lucide="send" class="w-4 h-4"></i> Kirim Pesan Test WA
      </button>

      ${lastWaStatus ? `
      <div class="mt-3 p-3 bg-slate-50 rounded-2xl text-xs text-slate-500">
        Terakhir dikirim: ${formatTanggal(lastWaStatus.time)}<br>
        Status: ${lastWaStatus.results.join(', ')}
      </div>
      ` : ''}
    </div>

    <!-- Keamanan / PIN -->
    <div class="bg-white rounded-3xl p-5 shadow-card">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
          <i data-lucide="lock" class="w-4 h-4 text-slate-600"></i>
        </span>
        Keamanan
      </h3>
      <button onclick="changeAdminPIN()" class="w-full bg-slate-50 text-slate-700 font-semibold py-3 rounded-2xl hover:bg-slate-100 transition-all mt-2 border border-slate-200">
        Ubah PIN Admin
      </button>
    </div>
  `;

  lucide.createIcons({ nodes: [page] });
  renderBackupPage();
}

function toggleShowToken() {
  const input = document.getElementById('inputFonnteToken');
  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
}

async function saveStoreSettings() {
  const name = sanitizeText(document.getElementById('setStoreName').value.trim());
  const phone = sanitizeText(document.getElementById('setStorePhone').value.trim());
  const addr = sanitizeText(document.getElementById('setStoreAddress').value.trim());
  const tax = parseFloat(document.getElementById('setTaxRate').value) || 0;

  await db.settings.put({ key: 'store_name', value: name });
  await db.settings.put({ key: 'store_phone', value: phone });
  await db.settings.put({ key: 'store_address', value: addr });
  await db.settings.put({ key: 'tax_rate', value: tax });

  const topName = document.getElementById('storeName');
  if (topName) topName.textContent = name || 'POS UMKM';

  // also update posTaxRate if on pos page
  if (typeof posTaxRate !== 'undefined') posTaxRate = tax;

  showToast("Profil toko disimpan", "success");
}

async function saveWASettings(showMsg = false) {
  const enabled = document.getElementById('toggleWA').checked;
  const adminPhone = sanitizeText(document.getElementById('inputAdminWA').value.trim());
  const tokenInput = document.getElementById('inputFonnteToken').value.trim();

  await db.settings.put({ key: 'fonnte_enabled', value: enabled });
  await db.settings.put({ key: 'wa_admin_number', value: adminPhone });
  await db.settings.put({ key: 'wa_notif_on_sale', value: document.getElementById('toggleNotifAdmin').checked });
  await db.settings.put({ key: 'wa_notif_to_customer', value: document.getElementById('toggleNotifPelanggan').checked });
  await db.settings.put({ key: 'wa_notif_on_low_stock', value: document.getElementById('toggleNotifStok').checked });

  if (tokenInput !== '') {
    const encrypted = CryptoJS.AES.encrypt(tokenInput, getDeviceFingerprint()).toString();
    await db.settings.put({ key: 'fonnte_token', value: encrypted });
    document.getElementById('inputFonnteToken').value = '';
  }

  if (showMsg) showToast("Pengaturan WA disimpan", "success");
}

async function testKirimWA() {
  const adminPhone = document.getElementById('inputAdminWA').value.trim();
  if (!adminPhone) {
    showToast("Nomor admin belum diisi", "warning");
    return;
  }

  showLoading(true);
  try {
    const res = await sendWAMessage(adminPhone, "Test notifikasi dari POS UMKM berhasil! (Abaikan pesan ini)");
    showToast("Pesan test terkirim!", "success");
  } catch (e) {
    showToast("Gagal mengirim test: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

function changeAdminPIN() {
  const html = `
    <div class="space-y-4">
      <h3 class="font-bold text-lg text-slate-800 text-center mb-6">Ubah PIN Admin</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">PIN Lama</label>
          <input type="password" id="oldPin" maxlength="6" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-lg tracking-widest text-center font-bold text-slate-800 outline-none" required>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">PIN Baru (Min. 4 angka)</label>
          <input type="password" id="newPin" maxlength="6" class="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-400 rounded-2xl px-4 py-3 text-lg tracking-widest text-center font-bold text-slate-800 outline-none" required>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 mt-6">
        <button onclick="hideModal()" class="bg-slate-100 text-slate-700 font-semibold py-3 rounded-2xl">Batal</button>
        <button onclick="processChangePIN()" class="bg-indigo-500 text-white font-semibold py-3 rounded-2xl">Simpan</button>
      </div>
    </div>
  `;
  showModal(html);
}

async function processChangePIN() {
  const oldPin = document.getElementById('oldPin').value;
  const newPin = document.getElementById('newPin').value;

  if (newPin.length < 4) {
    showToast("PIN baru minimal 4 angka", "warning");
    return;
  }

  const currentHashSetting = await db.settings.get('admin_pin');
  const oldHash = CryptoJS.MD5(oldPin).toString();

  if (currentHashSetting && currentHashSetting.value !== oldHash) {
    showToast("PIN Lama salah!", "error");
    return;
  }

  const newHash = CryptoJS.MD5(newPin).toString();
  await db.settings.put({ key: 'admin_pin', value: newHash });

  hideModal();
  showToast("PIN berhasil diubah", "success");
}
