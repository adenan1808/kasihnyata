const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

code = code.replace(/const skuDisp = sku \|\| "xxx-xxx-xxxxxx";/g, 'const skuDisp = window.escapeHTML(sku || "xxx-xxx-xxxxxx");');

fs.writeFileSync('app.js', code);
