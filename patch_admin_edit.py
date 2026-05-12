import re

with open('admin.js', 'r') as f:
    content = f.read()

search = '''  set("pMinStok", p.minStok !== undefined ? p.minStok : 10);
  set("pSupplierName", p.supplierName||"");
  set("pSupplierWA", p.supplierWA||"");'''

replace = '''  set("pMinStok", p.minStok !== undefined ? p.minStok : 10);
  set("pSumber", p.sumber||"Cash");
  if(p.sumber === "Cash") {
    set("pTempo", "");
  } else if (p.tempo) {
    let tempoStr = p.tempo;
    if (tempoStr.includes('-')) {
        const parts = tempoStr.split('-');
        if(parts[0].length === 2 && parts[2].length === 4) {
           tempoStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (parts[0].length === 2 && parts[2].length === 2) {
           tempoStr = `20${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }
    set("pTempo", tempoStr);
  } else {
    set("pTempo", "");
  }
  set("pSupplierName", p.supplierName||"");
  set("pSupplierWA", p.supplierWA||"");'''

content = content.replace(search, replace)

with open('admin.js', 'w') as f:
    f.write(content)
