// payment-midtrans.js

async function startMidtransPayment() {
  const premium = await isPremium();
  if (!premium) {
    showToast("Fitur Midtrans hanya tersedia untuk pengguna PRO", "warning");
    return;
  }

  // Simulasi Midtrans Snap
  showToast("Midtrans Snap Simulation", "info");
}
