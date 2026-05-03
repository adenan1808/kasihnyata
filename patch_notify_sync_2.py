import re

def process_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Product saves
    content = re.sub(
        r'(localStorage\.setItem\("products",\s*[^)]+\);)(?!\s*if\(typeof window\.notifySync)',
        r'\1 if(typeof window.notifySync==="function") window.notifySync("products");',
        content
    )

    # Transaction saves
    content = re.sub(
        r'(localStorage\.setItem\("transaksi",\s*[^)]+\);)(?!\s*if\(typeof window\.notifySync)',
        r'\1 if(typeof window.notifySync==="function") window.notifySync("transactions");',
        content
    )

    with open(filename, 'w') as f:
        f.write(content)

process_file('app.js')
process_file('admin.js')
