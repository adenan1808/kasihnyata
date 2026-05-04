import sys

with open('style.css', 'r') as f:
    content = f.read()

# Replace blocky buttons with modern floating GenZ design
patch_css = """
/* MODERN GEN-Z ADD BUTTON / STEPPER */
.pos-card-add-btn, .product-card-add {
  display: flex !important;
  width: 100% !important;
  justify-content: center;
  align-items: center;
  border-radius: 30px !important; /* Pill shape */
  font-weight: 700;
  font-size: 14px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 10px 0 !important;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
  color: #000 !important; /* Usually best contrast for bright gradients */
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  border: none;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.pos-card-add-btn:hover, .product-card-add:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0,0,0,0.25);
  filter: brightness(1.1);
}
.pos-card-add-btn:active, .product-card-add:active {
  transform: scale(0.95) translateY(0);
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.pos-card-stepper, .product-card-stepper {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  background: var(--surface);
  border-radius: 30px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1) inset;
  border: 1px solid var(--border);
}
.stepper-btn {
  background: transparent;
  color: var(--accent);
  border: none;
  padding: 10px 18px;
  font-size: 18px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stepper-btn:hover {
  background: rgba(255,255,255,0.1);
  color: var(--accent2);
}
.stepper-btn:active {
  transform: scale(0.9);
}
.stepper-num {
  font-weight: 800;
  font-size: 15px;
  flex: 1;
  text-align: center;
  color: var(--text);
}

.product-card, .pos-card {
  border-radius: 16px; /* softer edges for genz feel */
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
}
"""

# Replace the previous modern card css entirely
start_idx = content.find("/* MODERN CARD ENHANCEMENTS */")
if start_idx != -1:
    content = content[:start_idx] + patch_css
else:
    content += "\n" + patch_css

with open('style.css', 'w') as f:
    f.write(content)
