import sys

# We add logic in app.js and admin.js to render countdown for "wait" status
patch = """
/* ================= COUNTDOWN HELPERS ================= */
function getWaitCountdown(tgl, status) {
    if (status !== "wait" && status !== "pending") return "";
    const waitMinutes = parseInt(localStorage.getItem("waitTimer") || "10", 10);
    if (waitMinutes <= 0) return " (Manual)";
    const maxWaitMs = waitMinutes * 60 * 1000;
    const now = Date.now();
    const elapsed = now - tgl;
    if (elapsed > maxWaitMs) return " (Habis)";

    const remainingS = Math.floor((maxWaitMs - elapsed) / 1000);
    const m = Math.floor(remainingS / 60);
    const s = remainingS % 60;
    return ` (Sisa ${m}:${String(s).padStart(2,'0')})`;
}
"""

with open('core.js', 'r') as f:
    content = f.read()

if "getWaitCountdown" not in content:
    content = content.replace("window.formatDate = formatDate;", "window.formatDate = formatDate;\n" + patch + "window.getWaitCountdown = getWaitCountdown;\n")

with open('core.js', 'w') as f:
    f.write(content)


with open('admin.js', 'r') as f:
    content = f.read()

# Transaksi Table (Akuntansi & Transaksi)
content = content.replace(
    """status==="wait"?'<span class="status-badge status-wait">⏳ Wait</span>':""",
    """status==="wait"?`<span class="status-badge status-wait">⏳ Wait ${getWaitCountdown(tx.tgl, tx.status)}</span>` :"""
)
content = content.replace(
    """(tx.status === "wait" ? "<span style='color:#facc15'>Wait</span>" : """,
    """(tx.status === "wait" ? `<span style='color:#facc15'>Wait ${getWaitCountdown(tx.tgl, tx.status)}</span>` : """
)

with open('admin.js', 'w') as f:
    f.write(content)
