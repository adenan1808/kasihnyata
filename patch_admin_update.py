import re

with open('admin.js', 'r') as f:
    content = f.read()

search = '''  if(sumber === 'Cash') { tempo = ''; pSupplierName = ''; pSupplierWA = ''; pSupplierAlamat = ''; }
  products[idx].tempo = tempo;'''

replace = '''  if(sumber === 'Cash') { tempo = ''; }
  products[idx].sumber = sumber;
  products[idx].tempo = tempo;'''

content = content.replace(search, replace)

with open('admin.js', 'w') as f:
    f.write(content)
