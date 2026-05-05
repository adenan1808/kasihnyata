with open("style.css", "r") as f:
    css = f.read()

# Make the bayarBtn turn yellow and disabled when it is visually disabled (which is true when kurang bayar for non-QRIS).
# The user asked: "warna tombol bayar berobah jadi kuning dan tak bisa diklik. Ini hanya terjadi saat pembayaran TUNAI."
# Right now button disabled is already applied by calcKembalian!
# Let's check `pos-bayar-btn` css
if '.pos-bayar-btn:disabled {' not in css:
    css += """
.pos-bayar-btn:disabled {
  background: #facc15 !important;
  color: #854d0e !important;
  cursor: not-allowed;
  opacity: 0.9;
}
"""
    with open("style.css", "w") as f:
        f.write(css)
