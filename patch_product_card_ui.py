import sys

with open('style.css', 'r') as f:
    content = f.read()

# Enhance product cards with hover animations and modern spacing
css_modern_cards = """
/* MODERN CARD ENHANCEMENTS */
.product-card, .pos-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.product-card:hover, .pos-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.4);
}
.product-card:active, .pos-card:active {
  transform: translateY(0);
}

.pos-card-add-btn, .product-card-add {
  display: flex !important;
  width: 100% !important;
  justify-content: center;
  align-items: center;
  border-radius: 8px !important;
  font-weight: bold;
  transition: all 0.2s ease;
  padding: 8px 0 !important;
  background: var(--accent);
  color: var(--bg) !important;
}
.pos-card-add-btn:active, .product-card-add:active {
  transform: scale(0.95);
  background: var(--accent2);
}

.pos-card-stepper, .product-card-stepper {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  background: var(--surface2);
  border-radius: 8px;
  overflow: hidden;
}
.stepper-btn {
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 8px 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.1s;
}
.stepper-btn:active {
  background: var(--accent2);
}
.stepper-num {
  font-weight: bold;
  flex: 1;
  text-align: center;
}
"""

content += "\n" + css_modern_cards

with open('style.css', 'w') as f:
    f.write(content)

with open('app.js', 'r') as f:
    content = f.read()

# Make the stepper in POS use this new style
content = content.replace(
    '<button class="pos-card-add-btn" onclick="event.stopPropagation();App._posQtyDelta(\'${id}\',1)">+</button>',
    '<button class="pos-card-add-btn" onclick="event.stopPropagation();App._posQtyDelta(\'${id}\',1)">Tambah</button>'
)

# Replace the buyer web add button logic to become a full stepper as requested
# Currently it looks like:
# `<button class="product-card-add" onclick="event.stopPropagation();App.addKranjang('${id}',event)">+</button>`
# We will change it to act like the POS card
buyer_btn_stepper = """    const qtyCtrl = qty > 0
      ? `<div class="product-card-stepper">
           <button class="stepper-btn" onclick="event.stopPropagation();App.kurangKranjang('${id}',event)">-</button>
           <span class="stepper-num">${qty}</span>
           <button class="stepper-btn" onclick="event.stopPropagation();App.addKranjang('${id}',event)">+</button>
         </div>`
      : `<button class="product-card-add" onclick="event.stopPropagation();App.addKranjang('${id}',event)">+ Tambah</button>`;
"""

# inject `qtyCtrl` into `renderFull` where `product-card-add` was
content = content.replace(
    '<button class="product-card-add" onclick="event.stopPropagation();App.addKranjang(\'${id}\',event)">+</button>',
    '${qtyCtrl}'
)

# And we need to add the `qtyCtrl` definition above it
content = content.replace(
    '  return `\n    <div class="product-card"',
    buyer_btn_stepper + '\n  return `\n    <div class="product-card"'
)


with open('app.js', 'w') as f:
    f.write(content)
