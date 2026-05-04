1. **Edit Product Form (Menu Produk)**
   - Modify `index.html`: Update the "sumber produk" logic. If `Hutang` or `Titip Jual` is selected, show a row next to it for "tanggal jatuh tempo" with format DD-MM-YY and default 90 days from now.
   - Below "tanggal jatuh tempo", add "Nama Supplier" (text input) and "No. WA supplier" (number input).
   - Below that, add "alamat Supplier" (text input).
   - Modify `admin.js`: Update `addProduct`, `_updateExistingProduct`, `_editProductForm`, and `_resetForm` functions to handle the new supplier fields (nama supplier, WA supplier, alamat supplier).
   - Update tempo to format DD-MM-YY.

2. **Last 30 Transactions Table (Menu Akuntansi)**
   - Modify `admin.js`: Update the function that renders the "30 Transaksi Terakhir" (which seems to be the `txList` render inside `renderAkuntansi`).
   - Add information about items purchased (nama, qty), kasir id / web, and payment method (pembayaran pake apa) to each transaction item.

3. **Table Rekap (Menu Table)**
   - Modify `index.html`: In the `tabTable` section (`tableRekap`), remove the "Sumber" column header.
   - Add 3 column headers: "Nama Supplier", "No. WA supplier", and "Alamat Supplier".
   - Modify `admin.js`: Update `renderTable` function. Remove the logic that renders the "Sumber" column. Add logic to render "Nama Supplier", "No. WA supplier", and "Alamat Supplier" using the data stored in the product object.

4. **Complete pre commit steps**
   - Run `pre_commit_instructions` to test, verify, review and reflect.

5. **Submit changes**
   - Call `submit`.
