import re

with open('app.js', 'r') as f:
    content = f.read()

# Web buyer _productCardHTML
search_buyer = r'''        ${imgHtml}
        ${diskon?`<span class="badge-diskon" style="position:absolute; bottom:4px; right:4px;">-${diskon}%</span>`:""}
        ${qty>0?`<span class="badge-qty-cart">${qty}</span>`:""}'''

replace_buyer = '''        ${imgHtml}
        ${diskon?`<span class="badge-diskon">-${diskon}%</span>`:""}
        ${qty>0?`<span class="badge-qty-cart">${qty}</span>`:""}'''

content = content.replace(search_buyer, replace_buyer)

# POS _posRenderGrid
search_pos = r'''          <div class="pos-card-price-wrap">
            ${hasDiskon?`<div class="pos-card-price-ori">Rp ${originalPrice.toLocaleString("id")}</div>`:""}
            <div class="pos-card-price">Rp ${price.toLocaleString("id")}<span style="font-size:9px; color:var(--text3); font-weight:normal;">/${p.satuan||'pcs'}</span></div>
            ${hasDiskon?`<span class="pos-card-diskon-badge">-${diskonGPos}%</span>`:""}
          </div>'''

replace_pos = '''          <div class="pos-card-price-wrap">
            ${hasDiskon?`<div class="pos-card-price-ori">Rp ${originalPrice.toLocaleString("id")}</div>`:""}
            <div class="pos-card-price">Rp ${price.toLocaleString("id")}<span style="font-size:9px; color:var(--text3); font-weight:normal;">/${p.satuan||'pcs'}</span></div>
          </div>'''

content = content.replace(search_pos, replace_pos)

search_pos_img = r'''      <div class="pos-card${inCart?" in-cart":""}${stokNum<=0?" out-of-stock":""}" ${stokNum<=0?"style=\\"opacity:0.6;\"":""} data-pos-id="${id}">
        <div class="pos-card-img">
          ${imgHtml}
          ${qty>0?`<div class="pos-card-qty-badge">${qty}</div>`:""}
        </div>'''

replace_pos_img = '''      <div class="pos-card${inCart?" in-cart":""}${stokNum<=0?" out-of-stock":""}" ${stokNum<=0?"style=\\"opacity:0.6;\"":""} data-pos-id="${id}">
        <div class="pos-card-img" style="position:relative;">
          ${imgHtml}
          ${hasDiskon?`<span class="pos-card-diskon-badge">-${diskonGPos}%</span>`:""}
          ${qty>0?`<div class="pos-card-qty-badge">${qty}</div>`:""}
        </div>'''

content = content.replace(search_pos_img, replace_pos_img)

with open('app.js', 'w') as f:
    f.write(content)
