import re

with open('admin.js', 'r') as f:
    content = f.read()

search = '''  products[idx].stok = stok;
  products[idx].minStok = minStok;
  products[idx].sumber = sumber;
  if(sumber === 'Cash') { tempo = ''; }
  products[idx].sumber = sumber;
  products[idx].tempo = tempo;'''

replace = '''  products[idx].stok = stok;
  products[idx].minStok = minStok;
  if(sumber === 'Cash') { tempo = ''; }
  products[idx].sumber = sumber;
  products[idx].tempo = tempo;'''

content = content.replace(search, replace)

with open('admin.js', 'w') as f:
    f.write(content)
