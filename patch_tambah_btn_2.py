import sys

with open('app.js', 'r') as f:
    content = f.read()

content = content.replace(
    '<button class="product-card-add" onclick="event.stopPropagation();App.addKranjang(\'${id}\',event)">+ Tambah</button>',
    '<button class="product-card-add" onclick="event.stopPropagation();App.addKranjang(\'${id}\',event)">+ Beli</button>'
)

content = content.replace(
    '<button class="pos-card-add-btn" onclick="event.stopPropagation();App._posQtyDelta(\'${id}\',1)">Tambah</button>',
    '<button class="pos-card-add-btn" onclick="event.stopPropagation();App._posQtyDelta(\'${id}\',1)">+ Tambah</button>'
)

with open('app.js', 'w') as f:
    f.write(content)
