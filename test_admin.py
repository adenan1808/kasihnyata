with open("admin.js", "r") as f:
    content = f.read()

import re

search = r"function renderAkuntansi\(\)\{.*?(const latest30 = .*?;)"
match = re.search(search, content, flags=re.DOTALL)
if match:
    print("Found latest30 in renderAkuntansi")
else:
    print("Could not find latest30 in renderAkuntansi")
