import sys

with open('app.js', 'r') as f:
    content = f.read()

# Fix for Buyer Web product card stok
content = content.replace(
    '<div class="product-card" data-id="${id}" ${stok===0?\'style="opacity:.6;pointer-events:none"\':\'\'}>',
    '<div class="product-card" data-id="${id}" ${stok<=0?\'style="opacity:.6;pointer-events:none"\':\'\'}>'
)

# Fix for POS card stok
content = content.replace(
    '${stokNum===0?" out-of-stock":""}"',
    '${stokNum<=0?" out-of-stock":""}" ${stokNum<=0?"style=\\"opacity:0.6;pointer-events:none;\\"":""}'
)

with open('app.js', 'w') as f:
    f.write(content)
