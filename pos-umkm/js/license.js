// license.js

const MAX_FREE_PRODUCTS = 20;

function getDeviceFingerprint() {
  const userAgent = navigator.userAgent;
  const screenRes = `${window.screen.width}x${window.screen.height}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return CryptoJS.MD5(userAgent + screenRes + tz).toString();
}

async function isPremium() {
  const licenseStr = await db.settings.get('license_key');
  if (!licenseStr) return false;

  try {
    // Simple validation: premium if the key decrypts correctly using the fingerprint
    // For this dummy logic, let's just assume valid if key starts with "PRO-"
    if (licenseStr.value.startsWith("PRO-")) return true;

    // In a real scenario, this would decrypt with a secret or device fingerprint
    const decrypted = CryptoJS.AES.decrypt(licenseStr.value, getDeviceFingerprint()).toString(CryptoJS.enc.Utf8);
    return decrypted.includes("PRO");
  } catch(e) {
    return false;
  }
}

async function checkProductLimit(currentCount) {
  const premium = await isPremium();
  if (premium) return true;

  if (currentCount >= MAX_FREE_PRODUCTS) {
    showToast(`Batas ${MAX_FREE_PRODUCTS} produk tercapai. Upgrade ke PRO.`, 'warning');
    return false;
  }
  return true;
}

async function updateTierBadge() {
  const badge = document.getElementById('tierBadge');
  if (!badge) return;
  const premium = await isPremium();
  if (premium) {
    badge.textContent = "PRO";
    badge.className = "px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700";
  } else {
    badge.textContent = "FREE";
    badge.className = "px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700";
  }
}
