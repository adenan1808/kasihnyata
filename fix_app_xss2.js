const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const helper = `\n// Helper to escape HTML\nwindow.escapeHTML = (str) => {\n  if (typeof str !== 'string') return str;\n  return str.replace(/[&<>'"]/g, \n    tag => ({\n      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'\n    }[tag] || tag));\n};\n`;

code = code.replace(/\/\*\s+Product card HTML\s+\*\//, helper + '\n/*  Product card HTML  */');

code = code.replace(/const name\s*=\s*pField\(p,"name"\)\|\|p\.n\|\|"";/g, 'const name  = window.escapeHTML(pField(p,"name")||p.n||"");');
code = code.replace(/const kat\s*=\s*pField\(p,"kategori"\)\|\|p\.k\|\|"Umum";/g, 'const kat   = window.escapeHTML(pField(p,"kategori")||p.k||"Umum");');
code = code.replace(/const img\s*=\s*p\.thumb \|\| pField\(p,"img"\)\|\|p\.g\|\|"";/g, 'const img   = window.escapeHTML(p.thumb || pField(p,"img")||p.g||"");');
code = code.replace(/const skuDisp\s*=\s*p\.sku \|\| "xxx-xxx-xxxxxx";/g, 'const skuDisp = window.escapeHTML(p.sku || "xxx-xxx-xxxxxx");');

code = code.replace(/list\.map\(k=>\`<option value="\$\{k\}"\>\$\{k\}<\/option>\`\)/g, 'list.map(k=>`<option value="${window.escapeHTML(k)}">${window.escapeHTML(k)}</option>`)');

code = code.replace(/const name=p\.n!==undefined\?p\.n:p\.name;/g, 'const name=window.escapeHTML(p.n!==undefined?p.n:p.name);');
code = code.replace(/const img=p\.g!==undefined\?p\.g:\(p\.img\|\|""\);/g, 'const img=window.escapeHTML(p.g!==undefined?p.g:(p.img||""));');

fs.writeFileSync('app.js', code);
