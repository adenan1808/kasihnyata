import sys

with open('admin.js', 'r') as f:
    content = f.read()

# Make history table also clickable
content = content.replace(
    '<td>${tx.inv||"-"}</td>',
    r'<td><a href="#" onclick="showInvoiceDetail(\'${tx.inv}\'); return false;" style="color:var(--accent);text-decoration:underline;cursor:pointer;">${tx.inv||"-"}</a></td>'
)

with open('admin.js', 'w') as f:
    f.write(content)
