import re

with open('index.html', 'r') as f:
    content = f.read()

content = content.replace(
    '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; width: 200%; margin-bottom: 16px;">',
    '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top: 16px;">'
)

with open('index.html', 'w') as f:
    f.write(content)
