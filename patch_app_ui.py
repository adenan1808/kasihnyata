import sys

with open('app.js', 'r') as f:
    content = f.read()

# Update renderHeroPromo to respect toggles
patch = """function renderHeroPromo(){
  const heroEnabled = localStorage.getItem("heroEnabled") !== "false";
  const promoLeftEnabled = localStorage.getItem("promoLeftEnabled") !== "false";
  const promoRightEnabled = localStorage.getItem("promoRightEnabled") !== "false";

  const heroWrapper = document.querySelector('.hero-wrapper');
  if (heroWrapper) heroWrapper.style.display = heroEnabled ? "" : "none";

  const track = document.getElementById("heroSliderTrack");"""

content = content.replace('function renderHeroPromo(){\n  const track = document.getElementById("heroSliderTrack");', patch)

patch2 = """
  if(!promoLeftEnabled) leftImages = [];
  if(!promoRightEnabled) rightImages = [];
  left.style.display = promoLeftEnabled ? "" : "none";
  right.style.display = promoRightEnabled ? "" : "none";
"""

content = content.replace('if(!rightImages.length && rightLegacy) rightImages = [rightLegacy];',
                          'if(!rightImages.length && rightLegacy) rightImages = [rightLegacy];\n' + patch2)

with open('app.js', 'w') as f:
    f.write(content)
