// sync.js - Handles cross-tab synchronization

const SYNC_CHANNEL_NAME = "toko-sync";
let syncChannel = null;

if ("BroadcastChannel" in window) {
  syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  syncChannel.onmessage = handleSyncMessage;
}

// Fallback for older browsers that don't support BroadcastChannel
window.addEventListener("storage", (e) => {
  if (e.key === "wpos_products" || e.key === "wpos_tx" || e.key === "_wpos_sync_trigger_products" || e.key === "_wpos_sync_trigger_transactions") {
    const type = (e.key.includes("products")) ? "products" : "transactions";
    handleSyncMessage({ data: { type } });
  }
});

function notifySync(type) {
  if (syncChannel) {
    syncChannel.postMessage({ type });
  }
  // Always trigger storage fallback for cross-tab in case BroadcastChannel fails or for older browsers
  localStorage.setItem("_wpos_sync_trigger_" + type, Date.now().toString());
}

function invalidateAppCaches() {
  if (typeof window.invalidateAppTxCache === "function") {
    window.invalidateAppTxCache();
  } else {
      // Direct variable invalidation if we're in the same scope, but let's export a function in app.js
  }
}

function handleSyncMessage(event) {
  const type = event.data?.type;
  if (!type) return;

  console.log("[Sync] Received sync event for:", type);

  if (type === "products") {
    // Invalidate caches
    if (window.Admin && typeof window.Admin.invalidateProductCache === "function") {
      window.Admin.invalidateProductCache();
    }
    if (typeof window.invalidateAppProductCache === "function") {
      window.invalidateAppProductCache();
    }

    // Refresh UI Admin
    if (window.Admin && typeof window.Admin.renderOwnerProdukList === "function") {
      window.Admin.renderOwnerProdukList();
    }
    // Refresh UI App (POS/Web)
    if (window.App && typeof window.App.renderFull === "function") {
      window.App.renderFull();
    }
  } else if (type === "transactions") {
    // Invalidate tx caches
    if (window.Admin && typeof window.Admin.invalidateTxCache === "function") {
       window.Admin.invalidateTxCache();
    }
    if (typeof window.invalidateAppTxCache === "function") {
       window.invalidateAppTxCache();
    }

    // Refresh UI Admin
    if (window.Admin && typeof window.Admin.renderAkuntansi === "function" && document.getElementById("tabAkuntansi")?.classList.contains("active")) {
      window.Admin.renderAkuntansi();
    }
    if (window.Admin && typeof window.Admin.renderHistory === "function" && document.getElementById("tabHistory")?.classList.contains("active")) {
      window.Admin.renderHistory();
    }
    if (typeof window.showHistoryPelanggan === "function" && document.getElementById("historyPelangganModal")?.style.display === "flex") {
      const phone = document.getElementById("historyPelangganInfo")?.innerText.match(/\(([^)]+)\)/)?.[1];
      const name = document.getElementById("historyPelangganInfo")?.innerText.split("Riwayat: ")[1]?.split(" (")[0];
      if(phone && name) window.showHistoryPelanggan(phone, name);
    }

    // Refresh UI App (POS grid if active)
    if (window.App && document.getElementById("posView")?.style.display !== "none") {
      if (typeof window._posRenderGrid === "function") window._posRenderGrid();
      if (typeof window._posRenderCart === "function") window._posRenderCart();
    }
  }
}

// Expose globally
window.notifySync = notifySync;
