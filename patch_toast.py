import sys

with open('core.js', 'r') as f:
    content = f.read()

# Make showToast support extra options
patch = """function showToast(msg, duration=2000, options={}){
  const old=document.getElementById("toast-msg");
  if(old) old.remove();
  const t=document.createElement("div");
  t.id="toast-msg";
  t.style.position="fixed"; t.style.bottom="20px"; t.style.left="50%"; t.style.transform="translateX(-50%)";
  t.style.background=options.background || "#333"; t.style.color=options.color || "#fff";
  t.style.padding="10px 20px"; t.style.borderRadius="8px"; t.style.zIndex="999999";
  t.style.fontSize="14px"; t.style.boxShadow="0 4px 6px rgba(0,0,0,0.3)";
  if(options.fontWeight) t.style.fontWeight = options.fontWeight;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), duration);
}"""

content = content.replace('function showToast(msg){\n  const old=document.getElementById("toast-msg");\n  if(old) old.remove();\n  const t=document.createElement("div");\n  t.id="toast-msg";\n  t.style.position="fixed"; t.style.bottom="20px"; t.style.left="50%"; t.style.transform="translateX(-50%)";\n  t.style.background="#333"; t.style.color="#fff"; t.style.padding="10px 20px"; t.style.borderRadius="8px"; t.style.zIndex="999999";\n  t.textContent=msg;\n  document.body.appendChild(t);\n  setTimeout(()=>t.remove(),2000);\n}', patch)

with open('core.js', 'w') as f:
    f.write(content)
