import sys

with open('app.js', 'r') as f:
    content = f.read()

patch = """function _posQtyDelta(id, delta){
  const products = getProducts();
  const p = products.find(x=>x.id===id);
  if(p && p.stok <= 0) return; // Prevent adding if out of stock
"""

content = content.replace("function _posQtyDelta(id, delta){\n", patch)

with open('app.js', 'w') as f:
    f.write(content)
