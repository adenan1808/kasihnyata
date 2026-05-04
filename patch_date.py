import re

def fix_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # We will let format date logic handle Date objects or timestamps

    # In core.js, add the format_date function
    if filename == 'core.js':
        patch = """function formatDate(val) {
  if(!val) return "";
  const d = new Date(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${m}`;
}
window.formatDate = formatDate;"""
        if "function formatDate" not in content:
            content = content.replace('/* ================= HELPER & UTILS ================= */', '/* ================= HELPER & UTILS ================= */\n' + patch)

    else:
        # replace `.toLocaleString("id")` and `.toLocaleDateString("id")` where used for dates, but not for currency formatting like `.toLocaleString("id")` on numbers.
        # It's safer to only target known date variables to avoid breaking currency.

        # Regex to target: `new Date(...).toLocaleString("id")` -> `formatDate(new Date(...))`
        content = re.sub(r'new Date\((.*?)\)\.toLocaleDateString\([\'"]id[\'"](,\{[^\}]+\})?\)', r'formatDate(new Date(\1)).split(" ")[0]', content)
        content = re.sub(r'new Date\((.*?)\)\.toLocaleString\([\'"]id[\'"](,\{[^\}]+\})?\)', r'formatDate(new Date(\1))', content)
        content = re.sub(r'd\.toLocaleDateString\([\'"]id[\'"](,\{[^\}]+\})?\)\s*\+\s*["\'] ["\']\s*\+\s*d\.toLocaleTimeString\([\'"]id[\'"](,\{[^\}]+\})?\)', r'formatDate(d)', content)
        content = re.sub(r'd\.toLocaleDateString\([\'"]id[\'"](,\{[^\}]+\})?\)', r'formatDate(d).split(" ")[0]', content)

    with open(filename, 'w') as f:
        f.write(content)

fix_file('core.js')
fix_file('app.js')
fix_file('admin.js')
