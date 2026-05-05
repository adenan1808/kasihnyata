with open("app.js", "r") as f:
    app_js = f.read()

# Make sure only TUNAI triggers yellow button/Kurang Bayar if they explicitly said "Ini hanya terjadi saat pembayaran TUNAI."
# Wait, what if they choose Transfer or COD? Do they also need to fill "Dibayar"?
# Usually yes, "Dibayar" for Transfer means exact amount transferred, but maybe they only mean TUNAI.
# "Ini hanya terjadi saat pembayaran TUNAI."
import re
app_js = app_js.replace('if (rawPayMethod !== "QRIS" && dibayar < total)', 'if (rawPayMethod === "Tunai" && dibayar < total)')
app_js = app_js.replace('const isQris = document.getElementById("posPayMethod")?.value === "QRIS";', 'const isTunai = document.getElementById("posPayMethod")?.value === "Tunai";')
app_js = app_js.replace('} else if (kembalian < 0 && !isQris) {', '} else if (kembalian < 0 && isTunai) {')
app_js = app_js.replace('if (getCart().length > 0 && (dibayar >= total || isQris)) {', 'if (getCart().length > 0 && (!isTunai || dibayar >= total)) {')

with open("app.js", "w") as f:
    f.write(app_js)
