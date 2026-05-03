import sys

with open('app.js', 'r') as f:
    content = f.read()

# Add invalidateAppTxCache
if 'window.invalidateAppTxCache = function' not in content:
    content += '\n\nwindow.invalidateAppTxCache = function() { _appTxCache = null; };\n'

# Add invalidateAppProductCache
if 'window.invalidateAppProductCache = function' not in content:
    content += 'window.invalidateAppProductCache = function() { /* App relies on getProducts() from core/admin, so we may not need to do much, but we could re-render */ };\n'

with open('app.js', 'w') as f:
    f.write(content)
