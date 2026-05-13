from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        page.goto("file:///app/index.html")
        page.wait_for_timeout(2000)

        page.evaluate("App.openPOS()")
        page.wait_for_timeout(1000)
        page.screenshot(path="pos_test.png", full_page=True)
        print("Screenshot saved to pos_test.png")

        browser.close()

if __name__ == "__main__":
    main()
