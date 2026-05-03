with open('app.js', 'r') as f:
    content = f.read()

content = content.replace('  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions"); \n  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions");',
                          '  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions"); ')

with open('app.js', 'w') as f:
    f.write(content)
