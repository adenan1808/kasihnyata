import re
with open('app.js', 'r') as f:
    content = f.read()

content = content.replace(
    '  if(typeof window.notifySync==="function") window.notifySync("products");, JSON.stringify(getProducts()));',
    '  localStorage.setItem("products", JSON.stringify(getProducts())); if(typeof window.notifySync==="function") window.notifySync("products");'
)

with open('app.js', 'w') as f:
    f.write(content)
