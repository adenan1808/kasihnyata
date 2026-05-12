import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace Kategori Baru
old_kat_baru = r'''<div>
        <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Atau Kategori Baru</label>
        <input id="pKatBaru" placeholder="Tulis kategori baru..." style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;">
      </div>'''

new_kat_baru = '''<div>
        <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Atau Kategori Baru</label>
        <div style="display:flex; gap:8px;">
          <input id="pKatBaru" placeholder="Tulis kategori baru..." onkeypress="if(event.key === 'Enter'){ event.preventDefault(); window.simpanKategoriBaruInline(); }" style="flex:1; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;">
          <button type="button" onclick="window.simpanKategoriBaruInline()" style="padding:0 12px; background:var(--accent); color:var(--bg); border:none; border-radius:8px; font-weight:bold; cursor:pointer;">+ Tambah</button>
        </div>
      </div>'''

content = content.replace(old_kat_baru, new_kat_baru)

with open('index.html', 'w') as f:
    f.write(content)
