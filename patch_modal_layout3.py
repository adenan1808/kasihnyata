import re

with open('index.html', 'r') as f:
    content = f.read()

search_block = r'''      <div style="display:none;">
        </div>
      </div>'''

content = content.replace(search_block, '')

with open('index.html', 'w') as f:
    f.write(content)
