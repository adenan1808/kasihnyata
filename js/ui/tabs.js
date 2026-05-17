/* ================= TABS UI HELPER ================= */
function showTab(id, btn){
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  const target = document.getElementById(id);
  if(target) target.classList.add("active");
  if(btn) btn.classList.add("active");

  // Specific hooks that might be defined globally
  if(id==="tabProduk" && typeof renderOwnerProdukList === "function") renderOwnerProdukList();
  if(id==="tabBackup" && typeof renderBackupHistory === "function") renderBackupHistory();
  if(id==="tabPromo" && typeof loadConfig === "function")  loadConfig();
  if(id==="tabAkuntansi" && typeof renderAkuntansi === "function") renderAkuntansi();
  if(id==="tabTable") {
      if(typeof renderTable === "function") renderTable();
      if(typeof renderPelangganList === "function") renderPelangganList();
  }
  if(id==="tabHistory" && typeof renderHistory === "function") renderHistory();
  if(id==="tabPelanggan" && typeof renderPelangganList === "function") renderPelangganList();
  if(id==="tabToko" && typeof renderKasirList === "function") renderKasirList();
}

window.showTab = showTab;
