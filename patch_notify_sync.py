import sys

def add_notify(filename, patterns, sync_type):
    with open(filename, 'r') as f:
        content = f.read()

    for pattern in patterns:
        if pattern in content:
            # We want to replace occurrences with the pattern + notifySync
            replacement = pattern + f'\n  if(typeof window.notifySync==="function") window.notifySync("{sync_type}");'
            # Only replace if we haven't already added it nearby
            if f'notifySync("{sync_type}")' not in content:
                 content = content.replace(pattern, replacement)
            else:
                 # Be more precise: look for exact line
                 lines = content.split('\n')
                 for i, line in enumerate(lines):
                     if pattern in line and f'notifySync("{sync_type}")' not in line and (i+1 < len(lines) and 'notifySync' not in lines[i+1]):
                         lines[i] = line + f' if(typeof window.notifySync==="function") window.notifySync("{sync_type}");'
                 content = '\n'.join(lines)

    with open(filename, 'w') as f:
        f.write(content)

add_notify('app.js', ['localStorage.setItem("products"', 'saveProducts'], 'products')
add_notify('app.js', ['localStorage.setItem("transaksi"'], 'transactions')
add_notify('admin.js', ['localStorage.setItem("products"'], 'products')
add_notify('admin.js', ['localStorage.setItem("transaksi"'], 'transactions')
