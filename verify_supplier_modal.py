from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto("file:///app/index.html")
    page.wait_for_timeout(1000)

    # 1. Open Product Modal to verify layout
    page.evaluate("Admin.openProductModal()")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verify_supplier_modal.png")

    # 2. Add Supplier inline
    page.fill("#pSupplierBaru", "Test Supplier Baru")
    page.fill("#pSupplierWA", "081234567890")
    page.evaluate("Admin.simpanSupplierBaruInline()")
    page.wait_for_timeout(1000)

    # Check if dropdown has the new supplier selected
    val = page.evaluate("document.getElementById('pSupplierName').value")
    print(f"Selected supplier after inline save: {val}")

    # Take screenshot of selected
    page.screenshot(path="/home/jules/verification/screenshots/verify_supplier_modal_selected.png")

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
