import sys

with open('app.js', 'r') as f:
    content = f.read()

# Make WAIT status reduce stock as well (hold stock)
patch_reduce = """      // Reduce stock for both paid and wait to hold stock
      if(real.stok !== undefined && real.stok > 0){
        real.stok = Math.max(0, real.stok - i.qty);
      }"""

content = content.replace("""      // Reduce stock ONLY if paid
      if(!isWait && real.stok !== undefined && real.stok > 0){
        real.stok = Math.max(0, real.stok - i.qty);
      }""", patch_reduce)

# Update `reduceStockForTx` to also reduce regardless, since it's just a fallback function but mostly logic happens in `saveTransaction` now.
# `reduceStockForTx` is mostly called in admin manual changes, which might not be needed if `saveTransaction` already handles it, but let's keep it safe.

with open('app.js', 'w') as f:
    f.write(content)
