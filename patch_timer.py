import sys

with open('index.html', 'r') as f:
    content = f.read()

content = content.replace('placeholder="5" min="0" value="5"', 'placeholder="10" min="0" value="10"')

with open('index.html', 'w') as f:
    f.write(content)

with open('admin.js', 'r') as f:
    content = f.read()

content = content.replace('waitEl.value = localStorage.getItem("waitTimer") || "5";', 'waitEl.value = localStorage.getItem("waitTimer") || "10";')

with open('admin.js', 'w') as f:
    f.write(content)

with open('app.js', 'r') as f:
    content = f.read()

content = content.replace('const waitTimerStr = localStorage.getItem("waitTimer") || "5";', 'const waitTimerStr = localStorage.getItem("waitTimer") || "10";')

with open('app.js', 'w') as f:
    f.write(content)
