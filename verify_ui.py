from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto("file:///app/index.html")
    page.wait_for_timeout(1000)

    # 1. Supplier Tab Verification
    page.evaluate("showTab('tabSupplier')")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verify_supplier.png")

    # 2. Add Supplier
    page.evaluate("Admin.openSupplierModal()")
    page.wait_for_timeout(1000)
    page.fill("#supNama", "Test Supplier")
    page.fill("#supWA", "08123456789")
    page.fill("#supAlamat", "Test Address")
    page.evaluate("Admin.saveSupplier()")
    page.wait_for_timeout(1000)

    # 3. Product Tab Verification (Check removed elements)
    page.evaluate("showTab('tabProduk')")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verify_admin_product.png")

    # 4. Buyer View Verification (Check + button and sticky cart)
    page.evaluate("switchToBuyer()")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verify_buyer.png")

    # 5. POS View Verification (Check Glass + button)
    page.evaluate("App.openPOS()")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verify_pos.png")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
