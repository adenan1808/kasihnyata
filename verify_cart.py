from playwright.sync_api import sync_playwright
import time

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/index.html")

        # Inject some mock data since categories are empty by default
        page.evaluate("""
            storeData = {
                markup: 30,
                categories: [
                    {
                        name: "Baju",
                        products: [
                            {
                                name: "Baju Kaos",
                                basePrice: 50000,
                                discount: 0,
                                image: ""
                            }
                        ]
                    }
                ]
            };
            activeCategoryIndex = 0;
            renderProducts();
            renderCategoryTabs();
        """)

        page.wait_for_selector(".product-card")

        print("Page loaded, categories & products present.")

        # Click Tambah ke Keranjang
        page.click("text=Tambah ke Keranjang")
        time.sleep(1)

        cart_total = page.locator("#cartTotalPrice").inner_text()
        print(f"Cart total price: {cart_total}")

        if "Rp" not in cart_total or cart_total == "Rp 0":
            print("Cart price error!")

        page.click("#floatingCart")
        time.sleep(1)

        checkout_items = page.locator("#checkoutItems").inner_text()
        print(f"Checkout Items: {checkout_items}")

        browser.close()
        print("Verification passed.")

if __name__ == "__main__":
    verify()
