import sys

with open('app.js', 'r') as f:
    content = f.read()

content = content.replace(
    'document.addEventListener("DOMContentLoaded", ()=>{',
    'document.addEventListener("DOMContentLoaded", ()=>{\n  if(typeof autoCancelExpiredOrders === "function") autoCancelExpiredOrders();'
)

with open('app.js', 'w') as f:
    f.write(content)
