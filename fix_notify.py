import re

def fix_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # The previous regex caused syntax errors like:
    # if(typeof window.notifySync==="function") window.notifySync("transactions");, JSON.stringify(list));

    # Let's cleanly reset and apply

    # 1. Reset broken lines
    content = re.sub(
        r'if\(typeof window\.notifySync==="function"\) window\.notifySync\("(products|transactions)"\);, (JSON\.stringify\([^)]+\)|"\[\]")\);',
        r'localStorage.setItem("\1", \2); if(typeof window.notifySync==="function") window.notifySync("\1");',
        content
    )

    # Remove weird duplicate in app.js
    content = content.replace(
        '  if(window.Admin && Admin.saveProducts){ if(typeof window.notifySync==="function") window.notifySync("products");\n    Admin.saveProducts(products); if(typeof window.notifySync==="function") window.notifySync("products");',
        '  if(window.Admin && Admin.saveProducts){\n    Admin.saveProducts(products); if(typeof window.notifySync==="function") window.notifySync("products");'
    )

    content = content.replace(
        '  if(window.Admin && Admin.saveProducts){ if(typeof window.notifySync==="function") window.notifySync("products");\n    Admin.saveProducts(getProducts()); if(typeof window.notifySync==="function") window.notifySync("products");',
        '  if(window.Admin && Admin.saveProducts){\n    Admin.saveProducts(getProducts()); if(typeof window.notifySync==="function") window.notifySync("products");'
    )

    # In case there's an exact match of transactions mapped to products by the reset
    content = content.replace('localStorage.setItem("transactions",', 'localStorage.setItem("transaksi",')

    with open(filename, 'w') as f:
        f.write(content)

fix_file('app.js')
fix_file('admin.js')
