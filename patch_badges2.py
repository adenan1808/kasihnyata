import re

with open('style.css', 'r') as f:
    content = f.read()

# Update pos-card-diskon-badge
search_pos_diskon = r'''.pos-card-diskon-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  font-size: 10px;
  background: var(--red);
  color: #fff;
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 800;
  z-index: 10;
}'''

replace_pos_diskon = '''.pos-card-diskon-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  font-size: 8px;
  background: var(--red);
  color: #fff;
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 800;
  z-index: 10;
}'''

content = content.replace(search_pos_diskon, replace_pos_diskon)

with open('style.css', 'w') as f:
    f.write(content)
