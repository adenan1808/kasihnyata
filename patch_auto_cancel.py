import sys

with open('app.js', 'r') as f:
    content = f.read()

# Auto cancel logic
auto_cancel_logic = """
/* ================= AUTO CANCEL WAIT ================= */
function autoCancelExpiredOrders() {
    const waitTimerStr = localStorage.getItem("waitTimer") || "5";
    const waitMinutes = parseInt(waitTimerStr, 10);

    // If timer is 0, manual confirmation only, skip auto cancel
    if(waitMinutes <= 0) return;

    const maxWaitMs = waitMinutes * 60 * 1000;
    const now = Date.now();
    let txList = getTx();
    let changed = false;
    let products = null;

    txList.forEach(tx => {
        if((tx.status === "wait" || tx.status === "pending") && (now - tx.tgl > maxWaitMs)) {
            tx.status = "batal";
            changed = true;

            // Return stock
            if(!products) products = ensureProductIndex(getProducts());
            if(tx.items && tx.items.length) {
                tx.items.forEach(item => {
                    const real = products._map[item.id];
                    if(real && real.stok !== undefined) {
                        real.stok += item.qty;
                    }
                });
            }
        }
    });

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
        console.log("[Auto Cancel] Canceled expired WAIT transactions and returned stock.");
    }
}
setInterval(autoCancelExpiredOrders, 60000); // Check every minute
window.autoCancelExpiredOrders = autoCancelExpiredOrders;

/* ================= TRANSACTION STORAGE ================= */"""

content = content.replace("/* ================= TRANSACTION STORAGE ================= */", auto_cancel_logic)

with open('app.js', 'w') as f:
    f.write(content)
