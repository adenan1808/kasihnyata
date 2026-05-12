import re

with open('style.css', 'r') as f:
    content = f.read()

# Update .badge-diskon
search_diskon = r'''.badge-diskon {
  position: absolute;
  top: 8px;
  left: 8px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 6px;
  letter-spacing: .03em;
}'''

replace_diskon = '''.badge-diskon {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 4px;
  border-radius: 4px;
  letter-spacing: .03em;
  z-index: 10;
}'''

content = content.replace(search_diskon, replace_diskon)

# Update pos-card-diskon-badge
search_pos_diskon = r'''.pos-card-diskon-badge {
  font-size: 9px;
  background: #7f1d1d;
  color: #fca5a5;
  border-radius: 4px;
  padding: 1px 4px;
  font-weight: 700;
}'''

replace_pos_diskon = '''.pos-card-diskon-badge {
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

content = content.replace(search_pos_diskon, replace_pos_diskon)

with open('style.css', 'w') as f:
    f.write(content)
