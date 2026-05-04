import sys

with open('app.js', 'r') as f:
    content = f.read()

content = content.replace(
    'const qrisOverlay = document.getElementById("posQrisOverlay");\n    const posQrisImg = document.getElementById("posQrisImg");\n    if(posQrisImg) posQrisImg.src = qrisSrc;\n    const posQrisImg = document.getElementById("posQrisImg");\n    if(posQrisImg) posQrisImg.src = qrisSrc;',
    'const qrisOverlay = document.getElementById("posQrisOverlay");\n    const posQrisImg = document.getElementById("posQrisImg");\n    if(posQrisImg) posQrisImg.src = qrisSrc;'
)

with open('app.js', 'w') as f:
    f.write(content)
