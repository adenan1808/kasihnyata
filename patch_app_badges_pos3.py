import re

with open('app.js', 'r') as f:
    content = f.read()

search_pos_img = r'''      <div class="pos-card${inCart?" in-cart":""}${stokNum<=0?" out-of-stock":""}" ${stokNum<=0?"style=\"opacity:0.6;\"":""} data-pos-id="${id}">
        <div class="pos-card-img">
          ${imgHtml}
          ${qty>0?`<div class="pos-card-qty-badge">${qty}</div>`:""}
        </div>'''

replace_pos_img = '''      <div class="pos-card${inCart?" in-cart":""}${stokNum<=0?" out-of-stock":""}" ${stokNum<=0?"style=\\"opacity:0.6;\\"":""} data-pos-id="${id}">
        <div class="pos-card-img" style="position:relative;">
          ${imgHtml}
          ${hasDiskon?`<span class="pos-card-diskon-badge">-${diskonGPos}%</span>`:""}
          ${qty>0?`<div class="pos-card-qty-badge">${qty}</div>`:""}
        </div>'''

content = content.replace(search_pos_img, replace_pos_img)

with open('app.js', 'w') as f:
    f.write(content)
