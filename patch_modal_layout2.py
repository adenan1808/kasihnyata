import re

with open('index.html', 'r') as f:
    content = f.read()

search_block = r'''      <!-- Row Baru Status Barang & Tempo -->
      <div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div>
              <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Status Barang</label>
              <select id="pSumber" class="select-field" style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;" onchange="
                const tEl = document.getElementById('pTempo');
                if(this.value === 'Cash' && tEl) { tEl.value = ''; }
                else if(tEl && !tEl.value) {
                    const d = new Date(); d.setDate(d.getDate() + 90);
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    tEl.value = d.getFullYear() + '-' + mm + '-' + dd;
                }
              ">
                <option value="Cash">Cash</option>
                <option value="Hutang">Hutang</option>
                <option value="Titip Jual">Titip Jual</option>
              </select>
            </div>
            <div>
              <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Jatuh Tempo <span style="color:#ef4444; font-size:10px;">(Hutang/Titip)</span></label>
              <input type="date" id="pTempo" style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px; color-scheme:dark;">
            </div>
        </div>
      </div>

      <!-- Row 3 -->
      <div>
        <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Supplier</label>'''

replace_block = '''      <!-- Row Baru Status Barang & Tempo -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Status Barang</label>
          <select id="pSumber" class="select-field" style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;" onchange="
            const tEl = document.getElementById('pTempo');
            if(this.value === 'Cash' && tEl) { tEl.value = ''; }
            else if(tEl && !tEl.value) {
                const d = new Date(); d.setDate(d.getDate() + 90);
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                tEl.value = d.getFullYear() + '-' + mm + '-' + dd;
            }
          ">
            <option value="Cash">Cash</option>
            <option value="Hutang">Hutang</option>
            <option value="Titip Jual">Titip Jual</option>
          </select>
        </div>
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Jatuh Tempo <span style="color:#ef4444; font-size:10px;">(Hutang/Titip)</span></label>
          <input type="date" id="pTempo" style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px; color-scheme:dark;">
        </div>
      </div>

      <!-- Row 3 -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; grid-column: span 2;">
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Supplier</label>
          <input id="pSupplierName" placeholder="Nama Supplier" style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;">
        </div>
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">No. WA Supplier</label>
          <input id="pSupplierWA" placeholder="08..." style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;">
        </div>
      </div>

      <!-- Skip original Row 3 fields to avoid duplicates -->
      <div style="display:none;">
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Supplier</label>'''

content = content.replace(search_block, replace_block)

# Clean up the original duplicate fields
search_block_dup = r'''      <div style="display:none;">
        <div>
          <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">Supplier</label>
        <input id="pSupplierName" placeholder="Nama Supplier" style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;">
      </div>
      <div>
        <label class="field-label" style="font-size:12px; color:#a0aec0; margin-bottom:6px;">No. WA Supplier</label>
        <input id="pSupplierWA" placeholder="08..." style="width:100%; padding:10px 12px; background:#2d3748; border:1px solid #4a5568; border-radius:8px; color:white; font-size:13px;">
      </div>'''

content = content.replace(search_block_dup, '')

with open('index.html', 'w') as f:
    f.write(content)
