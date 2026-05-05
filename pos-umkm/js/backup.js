// backup.js

function renderBackupPage() {
  const page = document.getElementById('settings-content');
  if (!page) return;

  const html = `
    <div class="bg-white rounded-3xl p-5 shadow-card mb-4 mt-4">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
          <i data-lucide="database" class="w-4 h-4 text-amber-600"></i>
        </span>
        Backup & Restore Data
      </h3>

      <p class="text-xs text-slate-500 mb-4">
        Data aplikasi ini disimpan di dalam browser HP Anda. Lakukan backup rutin agar data tidak hilang saat membersihkan cache atau ganti HP.
      </p>

      <div class="grid grid-cols-2 gap-3">
        <button onclick="backupData()" class="bg-amber-500 text-white font-semibold py-3 rounded-2xl shadow-glow hover:bg-amber-600 active:scale-95 transition-all flex flex-col items-center justify-center gap-1">
          <i data-lucide="download-cloud" class="w-5 h-5"></i>
          <span class="text-xs">Backup Data</span>
        </button>

        <label class="bg-indigo-50 text-indigo-700 font-semibold py-3 rounded-2xl border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer">
          <i data-lucide="upload-cloud" class="w-5 h-5"></i>
          <span class="text-xs">Restore Data</span>
          <input type="file" id="fileRestore" class="hidden" accept=".json,.enc" onchange="restoreData(event)">
        </label>
      </div>

      <div class="mt-4 p-3 bg-red-50 rounded-xl border border-red-100">
        <p class="text-xs text-red-600 font-semibold flex items-center gap-1 mb-1">
          <i data-lucide="alert-triangle" class="w-3 h-3"></i> Perhatian Restore
        </p>
        <p class="text-[10px] text-red-500">
          Melakukan restore akan MENIMPA semua data yang ada saat ini. Pastikan file yang dipilih adalah file backup yang benar.
        </p>
      </div>
    </div>
  `;

  // Append to settings page
  page.insertAdjacentHTML('beforeend', html);
  lucide.createIcons({ nodes: [page] });
}

async function backupData() {
  showLoading(true);
  try {
    const blob = await db.export({ prettyJson: true });
    const text = await blob.text();

    // Encrypt the backup
    const encrypted = CryptoJS.AES.encrypt(text, getDeviceFingerprint()).toString();
    const encBlob = new Blob([encrypted], { type: "text/plain" });

    const url = URL.createObjectURL(encBlob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `POS_Backup_${dateStr}.enc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast("Backup berhasil diunduh", "success");
  } catch (error) {
    console.error("Backup failed", error);
    showToast("Gagal melakukan backup", "error");
  } finally {
    showLoading(false);
  }
}

async function restoreData(event) {
  const file = event.target.files[0];
  if (!file) return;

  showConfirmDialog(
    "Restore Data?",
    "Semua data lama akan ditimpa dengan data dari file backup ini. Lanjutkan?",
    async () => {
      showLoading(true);
      try {
        const text = await file.text();

        let jsonStr = text;
        // Attempt decrypt if it's an .enc file
        if (file.name.endsWith('.enc')) {
          try {
            jsonStr = CryptoJS.AES.decrypt(text, getDeviceFingerprint()).toString(CryptoJS.enc.Utf8);
            if (!jsonStr) throw new Error("Invalid password/fingerprint");
          } catch(e) {
             throw new Error("File backup tidak valid untuk perangkat ini, atau file korup.");
          }
        }

        const blob = new Blob([jsonStr], { type: "application/json" });

        // Clear old data and import new
        await db.delete();
        await db.open();
        await db.import(blob);

        showToast("Restore berhasil! Aplikasi akan dimuat ulang.", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        console.error("Restore failed", error);
        showToast("Gagal restore: " + error.message, "error");
      } finally {
        showLoading(false);
        event.target.value = ''; // reset input
      }
    }
  );
}
