from playwright.sync_api import sync_playwright
import os
import json

def run_cuj(page):
    page.set_viewport_size({"width": 1280, "height": 800})

    products = [
        {
            "i": 1,
            "n": "Produk Test Tunai",
            "p": 15000,
            "m": 10000,
            "stok": 50,
            "k": "Umum",
            "desc": "Ini deskripsi testing"
        }
    ]

    config = {"diskonGlobal": 10}

    page.add_init_script(f"""
        localStorage.setItem('products', JSON.stringify({json.dumps(products)}));
        localStorage.setItem('config', JSON.stringify({json.dumps(config)}));
    """)

    page.goto("file:///app/index.html")
    page.wait_for_timeout(1000)

    # 1. Test Admin Modal Spacing & Colors
    page.evaluate("Admin.openProductModal()")
    page.wait_for_timeout(500)
    page.screenshot(path="/home/jules/verification/screenshots/verify_admin_modal.png")
    page.evaluate("Admin.closeProductModal()")
    page.wait_for_timeout(500)

    # 2. Test Supplier Modal (Tempo Warning)
    page.evaluate("showTab('tabSupplier')")
    page.wait_for_timeout(500)
    page.evaluate("Admin.openTempoWarningSettings()")
    page.wait_for_timeout(500)
    page.screenshot(path="/home/jules/verification/screenshots/verify_tempo_warning.png")
    page.evaluate("document.getElementById('tempoWarningModal').style.display='none'")
    page.wait_for_timeout(500)

    # 3. Test POS Tunai
    page.evaluate("App.openPOS()")
    page.wait_for_timeout(500)
    page.locator(".pos-card-add-btn").first.click()
    page.wait_for_timeout(500)
    page.evaluate("document.getElementById('posPayMethod').value = 'Tunai'")
    # Note: dibayar is empty (0)
    page.locator("#posBayarBtn").click()
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verify_pos_tunai.png")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="/home/jules/verification/videos")
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
