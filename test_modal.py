from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        page.goto("file:///app/index.html")
        page.wait_for_timeout(2000)

        # open edit modal
        btn = page.locator("button.btn-add").first
        if btn.is_visible():
            btn.click()
            page.wait_for_timeout(1000)
            page.screenshot(path="modal_edit_test.png", full_page=True)
            print("Screenshot saved to modal_edit_test.png")

        browser.close()

if __name__ == "__main__":
    main()
