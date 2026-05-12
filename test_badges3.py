from playwright.sync_api import sync_playwright
import json

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()
        page.set_viewport_size({"width": 375, "height": 667})

        products = [
            {
                "i": 1,
                "n": "Produk Diskon",
                "price": 5000,
                "p": 10000,
                "m": 4000,
                "stok": 10,
                "k": "Umum"
            }
        ]

        config = {
            "diskonGlobal": 50
        }

        page.add_init_script(f"""
            localStorage.setItem('products', JSON.stringify({json.dumps(products)}));
            localStorage.setItem('config', JSON.stringify({json.dumps(config)}));
            localStorage.setItem('role', 'owner');
        """)

        page.goto("file:///app/index.html")
        page.wait_for_timeout(2000)

        # Test buyer mode
        btn = page.locator("button:has-text('Buka Toko')").first
        if btn.is_visible():
            btn.click()
            page.wait_for_timeout(2000)

        page.screenshot(path="buyer_badge_test.png", full_page=True)
        print("Buyer badge screenshot saved.")

        browser.close()

if __name__ == "__main__":
    main()
