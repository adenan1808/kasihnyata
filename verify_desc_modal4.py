from playwright.sync_api import sync_playwright
import json
import os

def run_cuj(page):
    page.set_viewport_size({"width": 1280, "height": 800})

    products = [
        {
            "i": 1,
            "n": "Produk Test Desc",
            "p": 15000,
            "m": 10000,
            "stok": 50,
            "k": "Umum",
            "desc": "Ini deskripsi testing"
        }
    ]

    config = {
        "diskonGlobal": 10
    }

    page.add_init_script(f"""
        localStorage.setItem('products', JSON.stringify({json.dumps(products)}));
        localStorage.setItem('config', JSON.stringify({json.dumps(config)}));
    """)

    page.goto("file:///app/index.html")
    page.wait_for_timeout(1000)

    # Switch to buyer
    btn = page.locator("button:has-text('Buka Toko')").first
    if btn.is_visible():
        btn.click()
        page.wait_for_timeout(1000)

    # Click image wrap
    img_wrap = page.locator(".product-card-img-wrap").first
    img_wrap.click()
    page.wait_for_timeout(1000)

    page.screenshot(path="/home/jules/verification/screenshots/verify_desc_modal4.png")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()
        run_cuj(page)
        browser.close()
