const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

code = code.replace(/\$\{p\.sku \? \`\<div style="font-size: 10px; color: var\(--text3\);"\>\$\{p\.sku\}\<\/div\>\` : ""\}/g, '${p.sku ? `<div style="font-size: 10px; color: var(--text3);">${window.escapeHTML(p.sku)}</div>` : ""}');

fs.writeFileSync('app.js', code);
