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
    if (typeof window.renderOwnerProdukList === "function") {
      window.renderOwnerProdukList();
    }
    // Refresh UI App (POS/Web)
    if (typeof window.renderFull === "function") {
      window.renderFull();
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
    if (typeof window.renderTransaksiList === "function") {
      window.renderTransaksiList();
    }
    if (typeof window.renderHistory === "function") {
      window.renderHistory();
    }
    if (typeof window.showHistoryPelanggan === "function" && document.getElementById("historyPelangganModal")?.style.display === "flex") {
      // Re-render history pelanggan if it's open
      const phone = document.getElementById("detailPelangganPhone")?.innerText;
      if(phone) window.showHistoryPelanggan(phone);
    }

    // Refresh UI App
    if (typeof window.renderHistoryPesanan === "function") {
      window.renderHistoryPesanan();
    }
  }
}

// Expose globally
window.notifySync = notifySync;
