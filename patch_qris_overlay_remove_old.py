import sys

with open('index.html', 'r') as f:
    content = f.read()

content = content.replace('<div id="posQrisOverlayOLD" class="pos-qris-overlay" style="display:none">\n        <!-- legacy overlay removed -->\n      </div>', '')
content = content.replace('<div id="posQrisOverlayOLD" class="pos-qris-overlay" style="display:none">\n      </div>', '')

with open('index.html', 'w') as f:
    f.write(content)
