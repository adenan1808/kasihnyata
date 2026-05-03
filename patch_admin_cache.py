import sys

with open('admin.js', 'r') as f:
    content = f.read()

# Add invalidateTxCache
if 'function invalidateTxCache()' not in content:
    content = content.replace('let _txCache = null;', 'let _txCache = null;\nfunction invalidateTxCache(){ _txCache = null; }')

# Add to exports
if 'invalidateTxCache,' not in content:
    content = content.replace('invalidateProductCache,', 'invalidateProductCache,\n  invalidateTxCache,')

with open('admin.js', 'w') as f:
    f.write(content)
