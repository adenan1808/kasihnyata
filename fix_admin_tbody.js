const fs = require('fs');
let code = fs.readFileSync('admin.js', 'utf8');

code = code.replace(/const tbody = document.getElementById\("adminTableBody"\);\n  if\(tbody\) tbody.appendChild\(frag\);/g, 'let tbodyEl = document.getElementById("adminTableBody");\n  if(tbodyEl) tbodyEl.appendChild(frag);');

fs.writeFileSync('admin.js', code);
