import re

with open('index.html', 'r') as f:
    content = f.read()

search_block = r'''      <!-- Skip original Row 3 fields to avoid duplicates -->


      <!-- Row 4 -->'''

replace_block = r'''      <!-- Row 4 -->'''

content = content.replace(search_block, replace_block)

search_block2 = r'''      <div style="display:none;">
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Supplier</label>'''

content = content.replace(search_block2, '')

with open('index.html', 'w') as f:
    f.write(content)
