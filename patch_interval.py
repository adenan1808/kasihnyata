import sys

with open('app.js', 'r') as f:
    content = f.read()

# Make it trigger re-render if elements are showing
patch = """
    if(changed) {
        saveTx(txList);
        if(products) {
            if(window.Admin && Admin.saveProducts) {
                Admin.saveProducts(products._list);
                if(typeof window.notifySync==="function") window.notifySync("products");
            } else {
                localStorage.setItem("products", JSON.stringify(products._list));
                if(typeof window.notifySync==="function") window.notifySync("products");
            }
            if(window._broadcastStockChange) window._broadcastStockChange();
        }
        if(typeof window.notifySync==="function") window.notifySync("transactions");
        console.log("[Auto Cancel] Canceled expired WAIT transactions and returned stock.");
    }

    // Also re-render active admin tables if open to show real-time countdown
    if (window.Admin && typeof window.Admin.renderHistory === 'function' && document.getElementById("tabHistory")?.classList.contains("active")) {
       window.Admin.renderHistory();
    }
    if (window.Admin && typeof window.Admin.renderTransaksiList === 'function' && document.getElementById("tabKasir")?.classList.contains("active")) {
       window.Admin.renderTransaksiList();
    }
}
setInterval(autoCancelExpiredOrders, 1000); // Check every second for countdown UI
"""

content = content.replace("""    if(changed) {
        saveTx(txList);
        if(products) {
            if(window.Admin && Admin.saveProducts) {
                Admin.saveProducts(products._list);
                if(typeof window.notifySync==="function") window.notifySync("products");
            } else {
                localStorage.setItem("products", JSON.stringify(products._list));
                if(typeof window.notifySync==="function") window.notifySync("products");
            }
            if(window._broadcastStockChange) window._broadcastStockChange();
        }
        console.log("[Auto Cancel] Canceled expired WAIT transactions and returned stock.");
    }
}
setInterval(autoCancelExpiredOrders, 60000); // Check every minute""", patch)

with open('app.js', 'w') as f:
    f.write(content)
