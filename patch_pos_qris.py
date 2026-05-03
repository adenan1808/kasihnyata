import sys

with open('app.js', 'r') as f:
    content = f.read()

patch = """  let payMethod = document.getElementById("posPayMethod")?.value||"Tunai";

  // Jika QRIS admin di-disable, perlakukan QRIS sebagai Tunai
  const qrisEnabled = localStorage.getItem("qrisEnabled") !== "false";
  if(payMethod === "QRIS" && !qrisEnabled){
      payMethod = "Tunai";
  }

  // QRIS: timer 3 detik sebelum proses otomatis
  if(payMethod === "QRIS" && !posBayar._qrisValidated){"""

content = content.replace('  const payMethod = document.getElementById("posPayMethod")?.value||"Tunai";\n\n  // QRIS: timer 3 detik sebelum proses otomatis\n  if(payMethod === "QRIS" && !posBayar._qrisValidated){', patch)

# Add contrasting styling to Toast / Wait warning for QRIS
patch_toast = """
    // Tampilkan overlay QRIS
    const qrisOverlay = document.getElementById("posQrisOverlay");
    if(qrisOverlay) qrisOverlay.style.display = "flex";

    const oldBtnText = document.getElementById("posBayarBtn").innerHTML;
    document.getElementById("posBayarBtn").innerHTML = "<b style='color:#fff'>Tunggu 3 Detik...</b>";
    document.getElementById("posBayarBtn").disabled = true;
    document.getElementById("posBayarBtn").style.backgroundColor = "#dc2626"; // Merah
    document.getElementById("posBayarBtn").style.borderColor = "#b91c1c";

    showToast("⚠️ CEK PEMBAYARAN! Tunggu 3 Detik...", 3000, {background: "#dc2626", color: "#fff", fontWeight: "bold"});
    setTimeout(()=>{
      posBayar._qrisValidated = true;
      posBayar._lock = false;
      document.getElementById("posBayarBtn").disabled = false;
      document.getElementById("posBayarBtn").innerHTML = oldBtnText;
      document.getElementById("posBayarBtn").style.backgroundColor = ""; // Reset
      document.getElementById("posBayarBtn").style.borderColor = "";
      showToast("✅ Validasi OK! Silakan klik BAYAR kembali", 3000, {background: "#16a34a", color: "#fff", fontWeight: "bold"});
    }, 3000);
"""

content = content.replace("""    // Tampilkan overlay QRIS
    const qrisOverlay = document.getElementById("posQrisOverlay");
    if(qrisOverlay) qrisOverlay.style.display = "flex";

    const oldBtnText = document.getElementById("posBayarBtn").innerHTML;
    document.getElementById("posBayarBtn").innerHTML = "Tunggu 3 Detik...";
    document.getElementById("posBayarBtn").disabled = true;

    showToast("⚠️ Tunggu 3 detik untuk QRIS...");
    setTimeout(()=>{
      posBayar._qrisValidated = true;
      posBayar._lock = false;
      document.getElementById("posBayarBtn").disabled = false;
      document.getElementById("posBayarBtn").innerHTML = oldBtnText;
      showToast("✅ Silakan klik BAYAR kembali");
    }, 3000);""", patch_toast)

with open('app.js', 'w') as f:
    f.write(content)
