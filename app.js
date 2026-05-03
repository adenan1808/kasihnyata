/* =========================================
   APP.JS v4.0  BUYER ENGINE
   Fixes: device-bound session, IDB transactions,
   payment method & status, checkout ENTER debounce,
   full-field product compat
   ========================================= */
"use strict";
console.log("APP v4.0 INIT");

/* ================= HASH PIN ================= */
async function hashPIN(pin){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ================= PAYMENT SIGNATURE ENGINE ================= */
// Hasilkan 3-digit random suffix anti-pemalsuan (unik per transaksi)
function generatePaymentNonce(){
  const arr = new Uint8Array(2);
  crypto.getRandomValues(arr);
  return 100 + (((arr[0] << 8) | arr[1]) % 900); // 100-999
}

// Signature 8-char dari payload transaksi  device-bound
async function generateOrderSignature(payload){
  const deviceId = localStorage.getItem("_deviceId") || "NOID";
  const secret   = "TOKO_PAY_V1_" + deviceId.slice(0,10);
  const raw      = JSON.stringify(payload) + "|" + secret;
  const buf      = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex      = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  return hex.slice(0,8).toUpperCase(); // contoh: "A3F9C21B"
}

// Verifikasi signature (owner pakai ini untuk cek keaslian pesan)
async function verifyOrderSignature(payload, sig){
  const check = await generateOrderSignature(payload);
  return check === sig;
}

/* ================= PRODUCTS (cached, minified-aware) ================= */
// Delegate to Admin's cache if available, else own parse
function getProducts(){
  if(window.Admin && Admin.getProducts) return Admin.getProducts();
  try{
    const raw = JSON.parse(localStorage.getItem("products")||"[]");
    return raw.map(p => p.i !== undefined ? p : { i:p.id, n:p.name, p:p.price, m:p.modal||0, k:p.kategori||"Umum", g:p.img||"" });
  } catch(e){ return []; }
}

// Get the "display" compatible field from a product (handles both old & new format)
function pField(p, field){
  const map = { id:"i", name:"n", price:"p", modal:"m", kategori:"k", img:"g" };
  if(p[field] !== undefined) return p[field];          // old format
  if(p[map[field]] !== undefined) return p[map[field]]; // new format
  return undefined;
}

function ensureProductIndex(products){
  if(!products) return [];

  // kalau sudah ada map, pakai map
  if(products._map) return products;

  const map = {};
  for(let i=0;i<products.length;i++){
    const id = pField(products[i],"id") || products[i].i;
    map[id] = products[i];
  }

  products._map = map;
  return products;
}

/* ================= CART & CONFIG ================= */
const getCart    = ()=> JSON.parse(localStorage.getItem("cart")||"[]");
const saveCart   = c => localStorage.setItem("cart", JSON.stringify(c));
const getKategoriTersimpan  = ()=> JSON.parse(localStorage.getItem("kategoriList")||"[]");
const saveKategoriTersimpan = list => localStorage.setItem("kategoriList", JSON.stringify(list));

const showToast = msg=>{
  const el=document.getElementById("toast"); if(!el) return;
  el.innerText=msg; el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>el.classList.remove("show"),2200);
};

/* ================= LIMIT (canonical  Core is source of truth) ================= */
function getLimit(){
  if(window.Core && typeof Core.getLimit === "function") return Core.getLimit();
  // Local fallback (same table as core.js)
  const LIMITS = { free:{k:2,p:10}, basic:{k:5,p:50}, pro:{k:10,p:100}, premium:{k:20,p:500}, ultimate:{k:50,p:1000}, developer:{k:999999,p:999999} };
  try{
    // Try new cache first, then legacy
    const nc=JSON.parse(localStorage.getItem("_licCache")||"null");
    if(nc&&nc.ok&&nc.tier) return LIMITS[nc.tier.toLowerCase()]||LIMITS.free;
    const leg=JSON.parse(localStorage.getItem("license")||"null");
    if(leg&&leg.type) return LIMITS[leg.type.toLowerCase()]||LIMITS.free;
  }catch(e){}
  return LIMITS.free;
}

/* ================= STATE ================= */
let currentKategori = "Semua";
let searchText      = "";
let pinBuffer       = "";
let failedAttempts  = 0;
let lockUntil       = 0;
let ownerTapCount   = 0, ownerTapTimer = null;
let ownerDevTapCount = 0, ownerDevTapTimer = null;
let cartTapCount    = 0, cartTapTimer = null;
let pinMode         = "owner";
let posFromBuyer    = false;
let heroSlideTimer = null;
let heroSlideIndexLeft = 0;
let heroSlideIndexRight = 0;

/* ================= ROUTING ================= */
function initMode(){
  // isOwner is now async; do a quick sync check first, async-verify in background
  const quickCheck = !!sessionStorage.getItem("_ownerSessToken");
  if(quickCheck){
    document.getElementById("ownerView").style.display="block";
    document.getElementById("buyerView").style.display="none";
    renderOwnerKategoriSelect();
    // Background verify  destroy session if token is invalid
    if(window.Core && Core.verifyOwnerSession){
      Core.verifyOwnerSession().then(ok=>{
        if(!ok){
          Core.destroyOwnerSession();
          document.getElementById("ownerView").style.display="none";
          document.getElementById("buyerView").style.display="block";
          renderFull(); updateCartUI();
        }
      });
    }
  } else {
    document.getElementById("buyerView").style.display="block";
    document.getElementById("ownerView").style.display="none";
    renderFull();
    updateCartUI();
  }
}

// = Device-bound session destroy
function switchToBuyer(){
  if(window.Core && Core.destroyOwnerSession) Core.destroyOwnerSession();
  else sessionStorage.removeItem("_ownerSessToken");

  document.getElementById("ownerView").style.display="none";
  document.getElementById("buyerView").style.display="block";
  renderFull();
  updateCartUI();
}

// = Device-bound session create (async)
async function createOwnerSession(){
  if(window.Core && Core.createOwnerSession) return await Core.createOwnerSession();
  sessionStorage.setItem("_ownerSessToken", Date.now()); // fallback
}

function isOwner(){
  // Sync check on token presence (full verify happens async in initMode)
  return !!sessionStorage.getItem("_ownerSessToken");
}

async function switchToOwner(){
  await createOwnerSession();

  document.getElementById("buyerView").style.display="none";
  document.getElementById("ownerView").style.display="block";

  if(window.Admin) Admin.renderOwnerProdukList && Admin.renderOwnerProdukList();
  renderOwnerKategoriSelect();
}

/* ================= PIN SYSTEM ================= */
const PIN_DEFAULT = "123456";
function getOwnerPinHash(){ return localStorage.getItem("ownerPinHash")||null; }
function isFirstLogin(){ return !localStorage.getItem("pinInitialized"); }

// Tap-5 to open pin  guarded so DOM is ready
function _initTapListener(){
  document.getElementById("buyerStoreNameText")?.addEventListener("click",()=>{
    ownerTapCount++;
    clearTimeout(ownerTapTimer);
    ownerTapTimer=setTimeout(()=>{ ownerTapCount=0; },1500);
    if(ownerTapCount>=5){
      ownerTapCount=0;
      openPinOverlay("owner");
    }
  });
  document.getElementById("buyerStoreLogo")?.addEventListener("click",()=>{
    cartTapCount++;
    clearTimeout(cartTapTimer);
    cartTapTimer=setTimeout(()=>{ cartTapCount=0; },1200);
    if(cartTapCount>=3){
      cartTapCount=0;
      openPinOverlay("cashier");
    }
  });
  document.getElementById("ownerJudulToko")?.addEventListener("click",()=>{
    ownerDevTapCount++;
    clearTimeout(ownerDevTapTimer);
    ownerDevTapTimer=setTimeout(()=>{ ownerDevTapCount=0; },1500);
    if(ownerDevTapCount>=5){
      ownerDevTapCount=0;
      openPinOverlay("developer");
    }
  });
}

function openPinOverlay(mode="owner"){
  pinMode = mode;
  pinBuffer=""; updatePinDots();
  document.getElementById("pinOverlay").style.display="flex";
  document.getElementById("pinError").innerText="";
  const title = document.querySelector("#pinOverlay h3");
  const desc = document.querySelector("#pinOverlay p");
  const dotsEl = document.getElementById("pinDots");
  if(title) title.innerText = mode==="cashier" ? "Mode Kasir" : (mode==="developer" ? "Mode Developer" : "Mode Owner");
  if(desc) desc.innerText = mode==="cashier" ? "Masukkan PIN kasir untuk masuk POS" : (mode==="developer" ? "Masukkan PIN developer" : "Masukkan PIN untuk masuk panel admin");
  if(dotsEl) dotsEl.innerHTML = mode==="developer"
    ? "<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>"
    : "<span></span><span></span><span></span><span></span><span></span><span></span>";
}
function closePinOverlay(){ document.getElementById("pinOverlay").style.display="none"; pinBuffer=""; }

function pinInput(n){
  const max = pinMode==="developer" ? 10 : 6;
  if(pinBuffer.length>=max) return;
  pinBuffer+=n; updatePinDots();
  if(pinBuffer.length===max) setTimeout(checkPin,120);
}

function pinClear(){
  pinBuffer = pinBuffer.slice(0,-1);
  updatePinDots();
}

function pinCancel(){ closePinOverlay(); }

function updatePinDots(){
  const dots=document.querySelectorAll("#pinDots span");
  dots.forEach((d,i)=>d.classList.toggle("filled", i<pinBuffer.length));
}

async function checkPin(){
  if(Date.now()<lockUntil){ document.getElementById("pinError").innerText="❌ Terlalu banyak percobaan. Tunggu 30 detik"; return; }

  if(pinMode==="cashier"){
    const pinKasir = localStorage.getItem("cashierPin") || "456789";
    if(pinBuffer === pinKasir){
      closePinOverlay();
      posFromBuyer = true;
      openPOS();
      showToast("✅ Kasir aktif");
    } else {
      failPin();
    }
    return;
  }

  if(pinMode==="developer"){
    if(pinBuffer === "9900990099"){
      closePinOverlay();
      if(window.Core && Core.openDevPanel){
        Core.openDevPanel();
      } else {
        showToast("❌ Developer panel tidak tersedia");
      }
    } else {
      failPin();
    }
    return;
  }

  // Gunakan Core PIN system jika tersedia (unified)
  if(window.Core && Core.verifyPin){
    if(Core.isPinLocked()){
      const rem = Core.getPinLockRemaining();
      document.getElementById("pinError").innerText="❌ Terlalu banyak percobaan. Tunggu "+rem+"s";
      return;
    }
    const ok = await Core.verifyPin(pinBuffer);
    if(ok){
      Core.resetPinFail();
      if(Core.isPinFirstRun()){
        closePinOverlay();
        openChangePinModal();
        return;
      }
      closePinOverlay();
      await switchToOwner(); // async device-bound session
      failedAttempts=0; showToast("✅ Login berhasil");
    } else {
      Core.recordPinFail();
      failedAttempts++;
      document.getElementById("pinError").innerText="❌ Habis";
      if(Core.isPinLocked()) document.getElementById("pinError").innerText=" ❌ Terlalu banyak percobaan. Tunggu "+Core.getPinLockRemaining()+"s";
      pinBuffer=""; updatePinDots();
    }
    return;
  }

  // Fallback tanpa Core
  const savedHash=getOwnerPinHash();
  if(!savedHash&&!isFirstLogin()){ document.getElementById("pinError").innerText="⚠️ PIN belum diset."; return; }
  if(isFirstLogin()){
    if(pinBuffer===PIN_DEFAULT){ localStorage.setItem("pinInitialized","1"); closePinOverlay(); openChangePinModal(); return; }
    failPin(); return;
  }
  const inputHash=await hashPIN(pinBuffer);
  if(inputHash===savedHash){
    closePinOverlay(); switchToOwner();
    failedAttempts=0; showToast("✅ Login berhasil");
  } else { failPin(); }
}

function failPin(){
  failedAttempts++;
  document.getElementById("pinError").innerText="❌ Kuota percobaan Habis";
  if(failedAttempts>=5){ lockUntil=Date.now()+30000; failedAttempts=0; }
  pinBuffer=""; updatePinDots();
}

window.pinInput=pinInput; window.pinClear=pinClear; window.pinCancel=pinCancel;

/* ================= CONFIG / PRICING ================= */
function getConfig(){
  const c=JSON.parse(localStorage.getItem("config")||"{}");
  return { diskonGlobal:c.diskonGlobal||0, diskonProduk:c.diskonProduk||{}, bundle:c.bundle||{aktif:false,minItem:0,diskon:0}, freeOngkir:c.freeOngkir||{aktif:false,minTotal:0} };
}

function getHarga(p, productsCache=null){
  const cfg = getConfig();
 const products = ensureProductIndex(productsCache || getProducts());

  const id = pField(p,"id");
  if(id === undefined || id === null) return 0;

  // ⚡ O(1) lookup
  const real = products._map[id];
  if(!real) return 0;

  let h = pField(real,"price") || 0;

  if(cfg.diskonGlobal)     h -= h * cfg.diskonGlobal / 100;
  if(cfg.diskonProduk[id]) h -= h * cfg.diskonProduk[id] / 100;

  return Math.round(h);
}

/* ================= CART ENGINE ================= */
function calculateCart(){
  const cart=getCart(), cfg=getConfig();
  let total=0, items=0;
const products = ensureProductIndex(getProducts());

  cart.forEach(i=>{
    const real = products._map[i.id]; // a O(1)
    if(!real) return;

    const h = getHarga(real, products);
    total += h * i.qty;
    items += i.qty;
  });
  let ongkir=10000, bundleActive=false, freeOngkir=false;
  if(cfg.bundle.aktif&&items>=cfg.bundle.minItem){ total-=total*cfg.bundle.diskon/100; bundleActive=true; }
  if(cfg.freeOngkir.aktif&&total>=cfg.freeOngkir.minTotal){ ongkir=0; freeOngkir=true; }
  return {total,ongkir,grand:total+ongkir,items,bundleActive,freeOngkir};
}


/* ================= AUTO CANCEL WAIT ================= */
function autoCancelExpiredOrders() {
    const waitTimerStr = localStorage.getItem("waitTimer") || "5";
    const waitMinutes = parseInt(waitTimerStr, 10);

    // If timer is 0, manual confirmation only, skip auto cancel
    if(waitMinutes <= 0) return;

    const maxWaitMs = waitMinutes * 60 * 1000;
    const now = Date.now();
    let txList = getTx();
    let changed = false;
    let products = null;

    txList.forEach(tx => {
        if((tx.status === "wait" || tx.status === "pending") && (now - tx.tgl > maxWaitMs)) {
            tx.status = "batal";
            changed = true;

            // Return stock
            if(!products) products = ensureProductIndex(getProducts());
            if(tx.items && tx.items.length) {
                tx.items.forEach(item => {
                    const real = products._map[item.id];
                    if(real && real.stok !== undefined) {
                        real.stok += item.qty;
                    }
                });
            }
        }
    });

    if(changed) {
        saveTx(txList);
        if(products) {
            if(window.Admin && Admin.saveProducts) {
                Admin.saveProducts(products._list);
                if(typeof window.notifySync==="function") window.notifySync("products");
            } else {
                localStorage.setItem("products", JSON.stringify(products._list));
                if(typeof window.notifySync==="function") window.notifySync("products");
            }
            if(window._broadcastStockChange) window._broadcastStockChange();
        }
        console.log("[Auto Cancel] Canceled expired WAIT transactions and returned stock.");
    }
}
setInterval(autoCancelExpiredOrders, 60000); // Check every minute
window.autoCancelExpiredOrders = autoCancelExpiredOrders;

/* ================= TRANSACTION STORAGE ================= */
let _appTxCache = null;
function getTx(){
  if(_appTxCache) return _appTxCache;
  try{ return JSON.parse(localStorage.getItem("transaksi")||"[]"); }catch(e){ return []; }
}
function saveTx(list){
  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions");
  _appTxCache = list;
  if(window.Core && Core.idbPutAll){
    Core.idbPutAll("transaksi", list).catch(e=>{});
  }
}

function pruneOldTx(list){
  const s=window.Admin ? Admin.getAccSettings() : {maxDays:37};
  const cutoff=Date.now()-Math.min(60,s.maxDays||37)*24*60*60*1000;
  return list.filter(tx=>tx.tgl>=cutoff);
}

function updateRekapBulanan(tx){
  const now=new Date(tx.tgl);
  const bulan=String(now.getMonth()+1).padStart(2,"0")+"-"+now.getFullYear();
  const rekap=JSON.parse(localStorage.getItem("rekapBulanan")||"[]");
  const idx=rekap.findIndex(r=>r.bulan===bulan);
  if(idx>=0){ rekap[idx].omzet+=tx.total; rekap[idx].transaksi+=1; }
  else rekap.push({bulan,omzet:tx.total,pajak:0,transaksi:1});
  localStorage.setItem("rekapBulanan", JSON.stringify(rekap));
}


/* Reduce stock when tx confirmed as Paid */
function reduceStockForTx(tx){
  if(!tx || !tx.items || !tx.items.length) return;
  const products = getProducts();
  let changed = false;
  tx.items.forEach(item => {
    const idx = products.findIndex(p => {
      const pid = String(p.i !== undefined ? p.i : p.id);
      return pid === String(item.id) || (p.n||p.name) === item.nama;
    });
    if(idx >= 0 && products[idx].stok !== undefined && products[idx].stok > 0){
      products[idx].stok = Math.max(0, products[idx].stok - item.qty);
      changed = true;
    }
  });
  if(!changed) return;
  if(window.Admin && Admin.saveProducts){
    Admin.saveProducts(products); if(typeof window.notifySync==="function") window.notifySync("products");
    Admin.invalidateProductCache && Admin.invalidateProductCache();
  } else {
  localStorage.setItem("products", JSON.stringify(products)); if(typeof window.notifySync==="function") window.notifySync("products");
  }
  _broadcastStockChange();
}
window.reduceStockForTx = reduceStockForTx;

/* Real-time stock sync across all open tabs/views */
function _broadcastStockChange(){
  // Trigger storage event for other tabs
  const ts = Date.now();
  localStorage.setItem("_stockUpdated", ts);
  // Also update current page's views without full reload
  _applyStockUIUpdate();
}

function _applyStockUIUpdate(){
  // Re-render buyer view if visible
  if(document.getElementById("buyerView")?.style.display !== "none"){
    _updateProductCards(); // fast inline update
    renderFull();
  }
  // Re-render POS grid if visible
  if(document.getElementById("posView")?.style.display !== "none"){
    if(typeof _posRenderGrid === "function") _posRenderGrid();
  }
  // Re-render owner product list if visible
  if(window.Admin && Admin.renderOwnerProdukList){
    const tabProduk = document.getElementById("tabProduk");
    if(tabProduk?.classList.contains("active")) Admin.renderOwnerProdukList();
    const tabTable = document.getElementById("tabTable");
    if(tabTable?.classList.contains("active")) Admin.renderTable && Admin.renderTable();
  }
}

// Listen for stock changes from other tabs
window.addEventListener("storage", e => {
  if(e.key === "_stockUpdated"){
    _applyStockUIUpdate();
  }
});


async function saveTransaction(cart, data, extraFields={}){
  const s=window.Admin ? Admin.getAccSettings() : {accEnabled:true};
  if(!s.accEnabled) return null;
  const inv=window.Admin ? Admin.generateInvoiceId() : ("INV-"+Date.now());
  const products = ensureProductIndex(getProducts());

  const isWait = (extraFields.status === "wait" || extraFields.status === "pending");
  const txCore = {
    id:      Date.now(),
    inv,
    tgl:     Date.now(),
    items:   cart.map(i=>{
      const real = products._map[i.id];
      if(!real) return null;
      // Reduce stock for both paid and wait to hold stock
      if(real.stok !== undefined && real.stok > 0){
        real.stok = Math.max(0, real.stok - i.qty);
      }
      return {
        id:    pField(real,"id") || real.i,
        nama:  pField(real,"name") || "",
        qty:   i.qty,
        harga: getHarga(real, products),
        modal: pField(real,"modal") || 0
      };
    }).filter(Boolean),
    total:         data.total,
    ongkir:        data.ongkir,
    grand:         data.grand,
    paymentMethod: extraFields.paymentMethod || "WA",
    status:        extraFields.status || "pending",
    source:        extraFields.source || "kasir",   // kasir | web
    nama:          extraFields.nama || "",
    hp:            extraFields.hp || "",
    alamat:        extraFields.alamat || ""
  };

  // Stock reduce  persist updated products
  if(window.Admin && Admin.saveProducts){
    Admin.saveProducts(getProducts()); if(typeof window.notifySync==="function") window.notifySync("products");
    Admin.invalidateProductCache && Admin.invalidateProductCache();
  } else {
  localStorage.setItem("products", JSON.stringify(getProducts())); if(typeof window.notifySync==="function") window.notifySync("products");
    if(window._broadcastStockChange) window._broadcastStockChange();
  }

  // = SIGNATURE  anti tamper
  if(window.Core && Core.signData){
    txCore.sig = await Core.signData({
      inv:   txCore.inv,
      tgl:   txCore.tgl,
      grand: txCore.grand,
      total: txCore.total
    });
  }

  const tx = txCore;
  let list = getTx();
  list.push(tx);
  list = pruneOldTx(list);
  if(list.length > 1000) list = list.slice(-1000);
  saveTx(list);

  // x IDB write (fire-and-forget)
  if(window.Core && Core.idbPutAll){
    Core.idbPutAll("transaksi", list).catch(()=>{});
  }

  updateRekapBulanan(tx);
  return inv;
}

/* ================= FLY TO CART ANIMATION ================= */
let lastBundle=false, lastOngkir=false;

function flyToCart(imgEl){
  if(!imgEl) return;
  const cartBtn=document.getElementById("cartBtn"); if(!cartBtn) return;
  const img=imgEl.cloneNode(true);
  const r=imgEl.getBoundingClientRect(), cr=cartBtn.getBoundingClientRect();
  img.className="fly-img";
  img.style.cssText=`top:${r.top}px;left:${r.left}px;width:${r.width}px;position:fixed;z-index:9999;transition:all .6s cubic-bezier(.2,.8,.2,1);pointer-events:none;border-radius:8px;`;
  document.body.appendChild(img);
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      img.style.top=cr.top+"px"; img.style.left=cr.left+"px";
      img.style.width="20px"; img.style.opacity="0";
    });
  });
  setTimeout(()=>img.remove(),700);
}

function changeQty(id, delta){
  id = +id;

  if(delta > 0){
    const imgEl = document.querySelector(`[data-id="${id}"] .product-card-img`);
    flyToCart(imgEl);
  }

 let cart = getCart();
const products = ensureProductIndex(getProducts());

let item = cart.find(x => (pField(x,"id")||x.id) === id);

// ~" tambah item baru
if(!item && delta > 0){
  const p = products._map[id];

  // = TAMBAHAN INI
  if(!p || p._invalid){
    showToast("❌  Produk tidak valid");
    return;
  }

  cart.push({
    id: pField(p,"id") || p.i,
    qty: 1
  });


// ================= FORCE UI REFRESH =================
setTimeout(()=>{
  updateCartUI();
}, 0);


}

  // = update qty
  else if(item){
    item.qty = (item.qty || 0) + delta;

    // = batas bawah
    if(item.qty <= 0){
      cart = cart.filter(x => x.id !== id);
      saveCart(cart);
      updateCartUI();
      return;
    }

    // = batas atas
    if(item.qty > 50){
      if(item.qty !== 50){
        showToast("Maksimal 50 item. Hubungi owner jika butuh lebih.");
      }
      item.qty = 50;
    }
  }

  // = simpan + update
  saveCart(cart);

  const data = calculateCart();

  if(data.bundleActive && !lastBundle) showToast("🔥 Bundle aktif!");
  if(data.freeOngkir && !lastOngkir)  showToast("🚚 Free ongkir aktif!");

  lastBundle = data.bundleActive;
  lastOngkir = data.freeOngkir;

// x TARUH DI SINI
_updateProductCards();
updateCartUI();
_renderCart();
}

/* ================= SEARCH ================= */
document.getElementById("searchInput")?.addEventListener("input", e=>{
  searchText=e.target.value.toLowerCase();
  renderFull();
});

/* ================= RENDER PIPELINE ================= */
let _renderPending=false;
function renderFull(){
  if(_renderPending) return;
  _renderPending=true;
  requestAnimationFrame(()=>{
    _renderPending=false;
    const products=getProducts();
    renderHeroPromo();
    _renderKategoriChips(products);
    _renderProductsByKategori(products);
    _renderRecommend(products);
    const stat=document.getElementById("totalProduk");
    if(stat) stat.innerText=products.length;
  });
}

function renderHeroPromo(){
  const heroEnabled = localStorage.getItem("heroEnabled") !== "false";
  const promoLeftEnabled = localStorage.getItem("promoLeftEnabled") !== "false";
  const promoRightEnabled = localStorage.getItem("promoRightEnabled") !== "false";

  const heroWrapper = document.querySelector('.hero-wrapper');
  if (heroWrapper) heroWrapper.style.display = heroEnabled ? "" : "none";

  const track = document.getElementById("heroSliderTrack");
  const dotsEl = document.getElementById("heroDots");
  const left = document.getElementById("heroPromoLeft");
  const right = document.getElementById("heroPromoRight");
  if(!left || !right) return;

  const leftLegacy = localStorage.getItem("heroPromoLeftImg")||"";
  const rightLegacy = localStorage.getItem("heroPromoRightImg")||"";
  let leftImages = [];
  let rightImages = [];
  try{ leftImages = JSON.parse(localStorage.getItem("heroPromoLeftImages")||"[]"); }catch(e){}
  try{ rightImages = JSON.parse(localStorage.getItem("heroPromoRightImages")||"[]"); }catch(e){}
  if(!leftImages.length && leftLegacy) leftImages = [leftLegacy];
  if(!rightImages.length && rightLegacy) rightImages = [rightLegacy];

  if(!promoLeftEnabled) leftImages = [];
  if(!promoRightEnabled) rightImages = [];
  left.style.display = promoLeftEnabled ? "" : "none";
  right.style.display = promoRightEnabled ? "" : "none";


  const promoTitle   = (localStorage.getItem("promoTitle")||"").trim();
  const promoDesc    = (localStorage.getItem("promoDesc")||"").trim();
  const sponsorTitle = (localStorage.getItem("sponsorTitle")||"").trim();
  const sponsorDesc  = (localStorage.getItem("sponsorDesc")||"").trim();

  // Only show hero promo content box if filled
  const promoCont = document.getElementById("heroPromoContent");
  const sponsCont = document.getElementById("heroSponsorContent");
  const t1 = document.getElementById("buyerHeroText");
  const d1 = document.getElementById("heroPromoDesc");
  const t2 = document.getElementById("heroSponsorTitle");
  const d2 = document.getElementById("heroSponsorDesc");
  const promoBtnEl = document.getElementById("heroPromoBtn");
  const sponsBtnEl = document.getElementById("heroSponsorBtn");

  if(promoCont){
    const hasPromo = promoTitle || promoDesc;
    promoCont.style.display = hasPromo ? "inline-flex" : "none";
    if(t1) t1.textContent = promoTitle;
    if(d1){ d1.textContent = promoDesc; d1.style.display = promoDesc ? "" : "none"; }
    if(promoBtnEl) promoBtnEl.style.display = "none"; // hidden per request
  }
  if(sponsCont){
    const hasSpons = sponsorTitle || sponsorDesc;
    sponsCont.style.display = hasSpons ? "inline-flex" : "none";
    if(t2) t2.textContent = sponsorTitle;
    if(d2){ d2.textContent = sponsorDesc; d2.style.display = sponsorDesc ? "" : "none"; }
    if(sponsBtnEl) sponsBtnEl.style.display = "none"; // hidden per request
  }

  // Build slides: merge all images into one sequence
  // Promo images go to slide 1 (left), sponsor images go to slide 2 (right)
  // Each image becomes its own "frame" within its respective slide
  const allSlides = [];
  leftImages.forEach(img => allSlides.push({ type: "promo", img }));
  rightImages.forEach(img => allSlides.push({ type: "sponsor", img }));
  if(!allSlides.length) {
    allSlides.push({ type: "promo", img: "" });
    allSlides.push({ type: "sponsor", img: "" });
  }

  // Grid implementation:
  // Kolom 1 = Banner Utama (dari heroImage)
  // Kolom 2 = Promo 1 (dari leftImages[0] atau fallback)
  // Kolom 3 = Promo 2 (dari rightImages[0] atau fallback)

  const mainBannerEl = document.getElementById("heroMainBanner");
  const promo1El = document.getElementById("heroPromo1");
  const promo2El = document.getElementById("heroPromo2");

  // Banner Utama
  const mainImg = localStorage.getItem("storeHeaderImg") || localStorage.getItem("hero") || "";
  if(mainBannerEl){
    mainBannerEl.style.backgroundImage = mainImg
      ? `linear-gradient(130deg, rgba(7,12,25,.75), rgba(7,12,25,.4)), url(${mainImg})`
      : "";
  }

  // Set interval to alternate sponsor and promo images
  if(window._promoInterval) clearInterval(window._promoInterval);
  let pIdx = 0, sIdx = 0;

  const updatePromoBg = () => {
    if(promo1El) {
      const img = leftImages[pIdx % leftImages.length] || "";
      promo1El.style.backgroundImage = img ? `linear-gradient(130deg, rgba(7,12,25,.75), rgba(7,12,25,.4)), url(${img})` : "";
    }
    if(promo2El) {
      const img = rightImages[sIdx % rightImages.length] || "";
      promo2El.style.backgroundImage = img ? `linear-gradient(130deg, rgba(7,12,25,.75), rgba(7,12,25,.4)), url(${img})` : "";
    }
  };
  updatePromoBg();

  const speedSec = parseInt(localStorage.getItem("heroSlideSpeedSec")) || 5;
  const speedMs = (speedSec > 0 ? speedSec : 5) * 1000;
  window._promoInterval = setInterval(() => {
    pIdx++; sIdx++;
    updatePromoBg();
  }, speedMs);

  if(heroSlideTimer) clearInterval(heroSlideTimer);
}

async function saveHeroPromoHybrid(payload){
  try{
    localStorage.setItem("heroPromo", JSON.stringify(payload||{}));
    const req = indexedDB.open("tokowa_promo_db", 1);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains("heroPromo")) db.createObjectStore("heroPromo", { keyPath:"id" });
    };
    req.onsuccess = ()=>{
      const db = req.result;
      const tx = db.transaction("heroPromo", "readwrite");
      tx.objectStore("heroPromo").put({ id:"main", ...payload, updatedAt: Date.now() });
    };
  } catch(e){}
}

async function loadHeroPromoHybrid(){
  try{
    const req = indexedDB.open("tokowa_promo_db", 1);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains("heroPromo")) db.createObjectStore("heroPromo", { keyPath:"id" });
    };
    req.onsuccess = ()=>{
      const db = req.result;
      const tx = db.transaction("heroPromo", "readonly");
      const getReq = tx.objectStore("heroPromo").get("main");
      getReq.onsuccess = ()=>{
        const d = getReq.result;
        if(!d) return;
        if(d.promoTitle) localStorage.setItem("promoTitle", d.promoTitle);
        if(d.promoDesc) localStorage.setItem("promoDesc", d.promoDesc);
        if(d.sponsorTitle) localStorage.setItem("sponsorTitle", d.sponsorTitle);
        if(d.sponsorDesc) localStorage.setItem("sponsorDesc", d.sponsorDesc);
        if(d.leftImg) localStorage.setItem("heroPromoLeftImg", d.leftImg);
        if(d.rightImg) localStorage.setItem("heroPromoRightImg", d.rightImg);
        if(Array.isArray(d.leftImages)) localStorage.setItem("heroPromoLeftImages", JSON.stringify(d.leftImages));
        if(Array.isArray(d.rightImages)) localStorage.setItem("heroPromoRightImages", JSON.stringify(d.rightImages));
        if(d.slideSpeedSec) localStorage.setItem("heroSlideSpeedSec", d.slideSpeedSec);
        renderHeroPromo();
      };
    };
  } catch(e){}
}

function loadStoreHeaderLogo(){
  const img = localStorage.getItem("storeHeaderImg")||"";
  const logoImg = document.getElementById("buyerStoreLogoImg");
  const fallback = document.getElementById("buyerStoreLogoFallback");
  if(!logoImg || !fallback) return;
  if(img){
    logoImg.src = img;
    logoImg.style.display = "block";
    fallback.style.display = "none";
  } else {
    logoImg.style.display = "none";
    fallback.style.display = "block";
  }
}

// Alias for backward compat
const render = renderFull;

/*  Kategori chips  */
function _renderKategoriChips(products){
  const wrap=document.getElementById("kategoriChipsWrap"); if(!wrap) return;
  const katSet=[...new Set(products.map(p=>pField(p,"kategori")||"Umum"))];
  const list=["Semua",...katSet];
  // Use DocumentFragment
  const frag=document.createDocumentFragment();
  list.forEach(k=>{
    const div=document.createElement("div");
    div.className="chip"+(k===currentKategori?" active":"");
    div.textContent=k;
    div.dataset.kat=k;
    frag.appendChild(div);
  });
  wrap.innerHTML="";
  wrap.appendChild(frag);
}

/*  Event delegation for kategori chips  */
document.getElementById("kategoriChipsWrap")?.addEventListener("click", e=>{
  const chip=e.target.closest(".chip");
  if(chip){ selectKategori(chip.dataset.kat); }
});

/*  Products by kategori (virtual / chunk render)  */
const RENDER_CHUNK = 20; // cards per frame
let _renderController = null;

function _renderProductsByKategori(products){
  const el=document.getElementById("productsByKategori"); if(!el) return;

  // Cancel any in-progress render
  if(_renderController) _renderController.cancelled=true;
  const ctrl={cancelled:false};
  _renderController=ctrl;

  const filtered=products.filter(p=>{
    const k=pField(p,"kategori")||"Umum";
    const name=pField(p,"name")||"";
    const matchKat=currentKategori==="Semua"||k===currentKategori;
    const matchSearch=!searchText||name.toLowerCase().includes(searchText);
    return matchKat&&matchSearch;
  });

  if(!filtered.length){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🛒</div><div>Tidak ada produk ditemukan</div></div>`;
    return;
  }

  // Group by kategori
  const byKat={};
  filtered.forEach(p=>{ const k=pField(p,"kategori")||"Umum"; if(!byKat[k]) byKat[k]=[]; byKat[k].push(p); });

  el.innerHTML="";
  const outerFrag=document.createDocumentFragment();
  const katKeys=Object.keys(byKat);
  let katIdx=0, cardIdx=0;
  let currentGrid=null, currentSection=null;

  function buildChunk(){
    if(ctrl.cancelled) return;
    let count=0;
    while(katIdx<katKeys.length && count<RENDER_CHUNK){
      const kat=katKeys[katIdx];
      const cards=byKat[kat];

      if(cardIdx===0){
        // Create section wrapper
        if(currentKategori!=="Semua"){
          currentGrid=document.createElement("div");
          currentGrid.className="products-grid";
        } else {
          currentSection=document.createElement("div");
          currentSection.className="kat-section";
          currentSection.innerHTML=`<div class="kat-section-title">${kat}</div>`;
          currentGrid=document.createElement("div");
          currentGrid.className="products-grid";
          currentSection.appendChild(currentGrid);
        }
      }

      while(cardIdx<cards.length && count<RENDER_CHUNK){
        const cardEl=document.createElement("div");
        cardEl.outerHTML; // noop  we set innerHTML below
        currentGrid.insertAdjacentHTML("beforeend", _productCardHTML(cards[cardIdx]));
        cardIdx++; count++;
      }

      if(cardIdx>=cards.length){
        // Section complete
        if(currentSection) outerFrag.appendChild(currentSection);
        else if(currentGrid) outerFrag.appendChild(currentGrid);
        currentSection=null; currentGrid=null;
        katIdx++; cardIdx=0;
      }
    }

    el.appendChild(outerFrag.cloneNode(true));
    while(outerFrag.firstChild) outerFrag.removeChild(outerFrag.firstChild);

    if(katIdx<katKeys.length){
      requestAnimationFrame(buildChunk);
    }
  }

  requestAnimationFrame(buildChunk);
}

/*  Targeted card update (avoid full redraw on qty change)  */
function _updateProductCards(){
  const cart=getCart();
  const products = ensureProductIndex(getProducts());
  products.forEach(p=>{
    const id=pField(p,"id")||p.i;
    const cardEl=document.querySelector(`.product-card[data-id="${id}"]`);
    if(!cardEl) return;
    const item=cart.find(x=>(x.id||x.i)===id);
    const qty=item?item.qty:0;

    // Update badge
    let badge=cardEl.querySelector(".badge-qty-cart");
    if(qty>0){
      if(!badge){
        badge=document.createElement("span");
        badge.className="badge-qty-cart";
        const imgWrap=cardEl.querySelector(".product-card-img-wrap");
        if(imgWrap) imgWrap.appendChild(badge);
      }
      badge.textContent=qty;
    } else if(badge){ badge.remove(); }

    // Update qty controls
    const qtyWrap=cardEl.querySelector(".product-card-qty");
    if(qtyWrap){
      if(qty>0){
        qtyWrap.innerHTML=`<div class="stepper-row"><button class="stepper-btn stepper-min qty-btn" data-id="${id}" data-delta="-1">-</button><span class="stepper-num">${qty}</span><button class="stepper-btn stepper-plus qty-btn" data-id="${id}" data-delta="1">+</button></div>`;
      } else {
        qtyWrap.innerHTML=`<button class="buyer-add-btn qty-btn" data-id="${id}" data-delta="1">+</button>`;
      }
    }
  });
}

/*  Product card HTML  */
function _productCardHTML(p){
  const cart=getCart();
  const id    = pField(p,"id")||p.i;
  const name  = pField(p,"name")||p.n||"";
  const price = pField(p,"price")||p.p||0;
  const kat   = pField(p,"kategori")||p.k||"Umum";
  const img   = pField(p,"img")||p.g||"";
  const item  = cart.find(x=>(x.id||x.i)===id);
  const qty   = item?item.qty:0;
  const cfg   = getConfig();
  const harga = getHarga(p);
  const diskon= cfg.diskonGlobal||0;
  const placeholder = "https://placehold.co/300/1e2740/5cf17b?text=%F0%9F%9B%8D";

  const imgHtml = img
    ? `<img class="product-card-img" src="${img}" onerror="this.src='${placeholder}'" loading="lazy">`
    : `<div class="product-card-no-img">🖼️</div>`;

  const qtyControls = qty > 0
    ? `<div class="product-card-qty">
        <div class="buyer-stepper">
          <button class="buyer-stepper-btn buyer-stepper-min qty-btn" data-id="${id}" data-delta="-1">-</button>
          <span class="buyer-stepper-num">${qty}</span>
          <button class="buyer-stepper-btn buyer-stepper-plus qty-btn" data-id="${id}" data-delta="1">+</button>
        </div>
       </div>`
    : `<div class="product-card-qty">
        <button class="buyer-add-btn qty-btn" data-id="${id}" data-delta="1">+</button>
       </div>`;

  const stok = p.stok;
  const stokHtml = stok !== undefined
    ? stok <= 0
      ? `<div class="product-card-stok habis">❌ Habis</div>`
      : stok < 5
        ? `<div class="product-card-stok low">⚠️ Stok: ${stok}</div>`
        : `<div class="product-card-stok">Stok: ${stok}</div>`
    : "";

  return `
    <div class="product-card" data-id="${id}" ${stok<=0?'style="opacity:.6;pointer-events:none"':''}>
      <div class="product-card-img-wrap">
        ${imgHtml}
        ${diskon?`<span class="badge-diskon">-${diskon}%</span>`:""}
        ${qty>0?`<span class="badge-qty-cart">${qty}</span>`:""}
      </div>
      <div class="product-card-body">
        <div class="product-card-kat">${kat}</div>
        <div class="product-card-name">${name}</div>
        <div class="product-card-price">Rp ${harga.toLocaleString("id")}</div>
        ${diskon?`<div class="product-card-ori">Rp ${price.toLocaleString("id")}</div>`:""}
        ${stokHtml}
        ${qtyControls}
      </div>
    </div>`;
}

/*  Event delegation: product card clicks  */
document.addEventListener("click", e=>{
  const btnAdd = e.target.closest(".qty-btn, .btn-add, .btn-qty");
  if(btnAdd && btnAdd.dataset.id){
    const id    = +btnAdd.dataset.id;
    const delta = +btnAdd.dataset.delta;
    if(!isNaN(id) && !isNaN(delta)) changeQty(id, delta);
  }
});

/*  Recommend section  */
function _renderRecommend(products){
  const el=document.getElementById("recommendList"); if(!el) return;
  const cart=getCart();
  const cartIds=new Set(cart.map(x=>x.id||x.i));
  const recs=products.filter(p=>!cartIds.has(pField(p,"id")||p.i)).slice(0,4);
  el.innerHTML=recs.map(_productCardHTML).join("");
}

/* ================= KATEGORI ================= */
function selectKategori(k){ currentKategori=k; renderFull(); }

function openKategoriPopup(){ _renderKategoriOptions(); document.getElementById("kategoriPopup").style.display="flex"; }
function closeKategoriPopup(){ document.getElementById("kategoriPopup").style.display="none"; }

function _renderKategoriOptions(){
  const products=getProducts();
  const katSet=[...new Set(products.map(p=>pField(p,"kategori")||"Umum"))];
  const limit=getLimit();
  const used=katSet.length, sisa=limit.k-used;
  const pct=Math.min(100,limit.k>0?(used/limit.k)*100:100);
  const barColor=sisa>0?"#22c55e":"#ef4444";
  const maxLabel=limit.k>=999999?" ~":limit.k;
  const sisaLabel=limit.k>=999999?" ~":sisa>0?sisa:"0  limit";

  let html=`
    <div class="kpopup-quota">
      <div class="kpopup-quota-row"><span>📊 Kategori terpakai</span><b>${used} / ${maxLabel}</b></div>
      <div class="kpopup-bar-track"><div class="kpopup-bar-fill" style="width:${limit.k>=999999?5:pct}%;background:${barColor}"></div></div>
      <div class="kpopup-quota-row"><span style="opacity:.6;font-size:11px">Sisa slot</span><b style="color:${barColor};font-size:12px">${sisaLabel}</b></div>
    </div>
    <div class="kpopup-label">Pilih Kategori</div>
    <div class="kategori-opt-item${currentKategori==="Semua"?" active":""}" data-kat="Semua">
      <span>📦</span> Semua <span class="kopt-count">${products.length} produk</span>
    </div>`;

  if(!katSet.length){
    html+=`<div class="kpopup-empty"><div style="font-size:28px">📂</div><div>Belum ada kategori</div></div>`;
  } else {
    html+=katSet.map(k=>{
      const jumlah=products.filter(p=>(pField(p,"kategori")||"Umum")===k).length;
      return `<div class="kategori-opt-item${k===currentKategori?" active":""}" data-kat="${k}"><span>📦</span> ${k} <span class="kopt-count">${jumlah} produk</span></div>`;
    }).join("");
  }
  document.getElementById("kategoriOptions").innerHTML=html;
}

// Event delegation for kategori popup options
document.getElementById("kategoriOptions")?.addEventListener("click", e=>{
  const opt=e.target.closest(".kategori-opt-item");
  if(opt){ selectKategori(opt.dataset.kat); closeKategoriPopup(); }
});

/* ================= CART UI ================= */
function updateCartUI(){
// ================= FIX QTY UI SYNC =================
const cart = getCart();

document.querySelectorAll("[data-id]").forEach(el=>{
  const id = +el.dataset.id;

  const item = cart.find(x => (x.id || x.i) === id);
  const qty  = item ? item.qty : 0;

  const qtyEl = el.querySelector(".qty-number");
  if(qtyEl){
    qtyEl.innerText = qty;
  }
});
  const data=calculateCart();
  const bar=document.getElementById("stickyCart"); if(!bar) return;

  const isWebBuyer = document.getElementById("buyerView") && document.getElementById("buyerView").style.display !== "none";

  if(data.items>0 && isWebBuyer){
    bar.style.display="flex";
    document.getElementById("stickyTotal").textContent="Rp "+data.grand.toLocaleString("id");
    document.getElementById("stickyItems").textContent=data.items+" item";
  } else { bar.style.display="none"; }
  const badge=document.getElementById("cartCount");
  if(badge) badge.textContent=String(data.items);
}


/* ================= PRINT RECEIPT (Thermal 80mm + PDF fallback) ================= */
function posPrintReceipt(){
  const cart = getCart();
  if(!cart.length){ showToast("Keranjang kosong"); return; }

  const products = ensureProductIndex(getProducts());
  const cfg = getConfig();
  const storeName = localStorage.getItem("storeName")||"Toko WA";
  const ownerWa   = localStorage.getItem("ownerWa")||"";
  const diskonG   = cfg.diskonGlobal||0;
  const ongkir    = _getOngkirDefault();
  const nama      = document.getElementById("posNama")?.value.trim()||"Pelanggan";
  const hp        = document.getElementById("posHp")?.value.trim()||"";
  const tgl       = new Date().toLocaleString("id");

  let subtotal = 0;
  let itemRows = "";
  cart.forEach(i => {
    const real = products._map[i.id]; if(!real) return;
    const harga = getHarga(real, products);
    const sub   = harga * i.qty;
    subtotal += sub;
    const n = pField(real,"name")||"";
    itemRows += `<tr><td>${n}</td><td style="text-align:right">${i.qty}</td><td style="text-align:right">Rp ${sub.toLocaleString("id")}</td></tr>`;
  });
  const diskonNominal = diskonG > 0 ? Math.round(subtotal*diskonG/100) : 0;
  const grand = subtotal - diskonNominal + ongkir;

  const html = `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>Struk - ${storeName}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 8px; }
    h2 { text-align:center; font-size:15px; margin-bottom:4px; }
    .center { text-align:center; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    table { width:100%; border-collapse:collapse; }
    td { padding: 2px 0; vertical-align:top; }
    .total-row { font-weight:bold; font-size:13px; }
    .footer { text-align:center; margin-top:8px; font-size:10px; }
  </style>
  </head><body>
  <h2>${storeName}</h2>
  <div class="center">${tgl}</div>
  <div class="center">Kasir: ${nama}</div>
  <div class="divider"></div>
  <table>${itemRows}</table>
  <div class="divider"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">Rp ${subtotal.toLocaleString("id")}</td></tr>
    ${diskonNominal>0?`<tr><td>Diskon</td><td style="text-align:right">-Rp ${diskonNominal.toLocaleString("id")}</td></tr>`:""}
    ${ongkir>0?`<tr><td>Ongkir</td><td style="text-align:right">Rp ${ongkir.toLocaleString("id")}</td></tr>`:""}
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right">Rp ${grand.toLocaleString("id")}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="footer">Terima kasih sudah berbelanja!<br>${storeName}</div>
  <script>window.onload=function(){window.print();setTimeout(()=>window.close(),500);}<\/script>
  </body></html>`;

  // Try thermal print via popup
  const win = window.open("", "_blank", "width=320,height=600");
  if(win){
    win.document.write(html);
    win.document.close();
    showToast("🖨️ Membuka dialog print...");
  } else {
    // Fallback: send PDF link to WA if HP given
    showToast("⚠️ Popup diblokir. Kirim resi via WA.");
    if(hp && ownerWa){
      const msg = `[STRUK] ${storeName}\nTgl: ${tgl}\nTotal: Rp ${grand.toLocaleString("id")}\nTerima kasih, ${nama}!`;
      setTimeout(()=>{ window.open("https://wa.me/"+hp.replace(/\D/g,"")+"?text="+encodeURIComponent(msg)); }, 300);
    }
  }
}

/* Show/hide print button based on last transaction */
function _posUpdatePrintBtn(){
  const btn = document.getElementById("posPrintBtn"); if(!btn) return;
  const cart = getCart();
  btn.style.display = cart.length > 0 ? "flex" : "none";
}

/* ================= CART MODAL ================= */
function openCart(){ _renderCart(); document.getElementById("cartModal").style.display="flex"; }
function closeCart(){ document.getElementById("cartModal").style.display="none"; }

function _renderCart(){
  const cart=getCart(), data=calculateCart();
  const diskonPesan=+localStorage.getItem("diskonPesan")||0;
  const cartList=document.getElementById("cartList"); if(!cartList) return;

  if(!cart.length){
    cartList.innerHTML=`<div class="empty-state"><div class="empty-icon">🛒</div><p>Keranjang masih kosong</p></div>`;
    return;
  }

  const frag=document.createDocumentFragment();
  const products=ensureProductIndex(getProducts());
  const cfg=getConfig();
  const diskonOwner=cfg.diskonGlobal||0;

  cart.forEach(i=>{
    const real=products._map[i.id];
    if(!real) return;
    const nama=pField(real,"name")||"";
    const img=pField(real,"img")||"";
    const harga=getHarga(real,products);
    const sub=harga*i.qty;
    const ph="https://placehold.co/56/1e2740/5cf17b?text=x:";
    const div=document.createElement("div");
    div.className="cart-item";
    div.dataset.cartId=i.id;
    div.innerHTML=`
      <img class="cart-item-img" src="${img||ph}" onerror="this.src='${ph}'" loading="lazy">
      <div class="cart-item-info">
        <div class="cart-item-name">${nama}</div>
        <div class="cart-item-unit">Rp ${harga.toLocaleString("id")} / item</div>
      </div>
      <div class="cart-item-right">
        <div class="cart-item-price">Rp ${sub.toLocaleString("id")}</div>
        <div class="cart-stepper">
          <button class="stepper-btn stepper-min qty-btn" data-id="${i.id}" data-delta="-1">-</button>
          <span class="stepper-num">${i.qty}</span>
          <button class="stepper-btn stepper-plus qty-btn" data-id="${i.id}" data-delta="1">+</button>
        </div>
      </div>`;
    frag.appendChild(div);
  });

  const diskonNominal=diskonOwner>0?Math.round(data.total*diskonOwner/100):0;
  const totalFinal=data.total-diskonNominal;
  const totalAfterDiskon=diskonPesan>0?Math.round(totalFinal-totalFinal*diskonPesan/100):totalFinal;
  const grand=totalAfterDiskon+data.ongkir;

  const summaryDiv=document.createElement("div");
  summaryDiv.className="cart-summary";
  summaryDiv.innerHTML=`
    <div class="cart-summary-row"><span>Subtotal (${data.items} item)</span><span>Rp ${data.total.toLocaleString("id")}</span></div>
    ${diskonOwner>0?`<div class="cart-summary-row green"><span>💸 Diskon Produk ${diskonOwner}%</span><span>-Rp ${diskonNominal.toLocaleString("id")}</span></div>`:""}
    ${diskonPesan>0?`<div class="cart-summary-row green"><span><💸 Diskon Pesan ${diskonPesan}%</span><span>-Rp ${Math.round(totalFinal*diskonPesan/100).toLocaleString("id")}</span></div>`:""}
    <div class="cart-summary-row"><span>🚚 Ongkir</span><span>${data.ongkir?"Rp "+data.ongkir.toLocaleString("id"):"<span class=\'free-badge\'>GRATIS/span>"}</span></div>
    <div class="cart-summary-divider"></div>
    <div class="cart-summary-row grand"><span>Total</span><span>Rp ${grand.toLocaleString("id")}</span></div>`;
  frag.appendChild(summaryDiv);
  cartList.innerHTML=""; cartList.appendChild(frag);
}

/* ================= CHECKOUT ================= */
let _checkoutLock = false; // prevent double-trigger
function checkout(){
  if(_checkoutLock) return;
  _checkoutLock = true;
  setTimeout(()=>{ _checkoutLock = false; }, 800); // unlock after 800ms

  _renderCart();
  const data=calculateCart();
  const diskonPesan=+localStorage.getItem("diskonPesan")||0;
  const totalAfterDiskon=diskonPesan>0?Math.round(data.total-data.total*diskonPesan/100):data.total;
  const grand=totalAfterDiskon+data.ongkir;
  const nonce=generatePaymentNonce();
  const grandTampil=grand+nonce;

  document.getElementById("checkoutTotal").innerHTML=`
    <div class="checkout-total">
      <div class="cart-total-row"><span>Subtotal</span><span>Rp ${data.total.toLocaleString("id")}</span></div>
      ${diskonPesan>0?`<div class="cart-total-row diskon-row"><span>< Diskon ${diskonPesan}%</span><span>-Rp ${Math.round(data.total*diskonPesan/100).toLocaleString("id")}</span></div>`:""}
      <div class="cart-total-row"><span>= Ongkir</span><span>${data.ongkir?"Rp "+data.ongkir.toLocaleString("id"):"GRATIS"}</span></div>
      <div class="cart-total-row cart-grand"><span>= Total Bayar</span><span>Rp ${grandTampil.toLocaleString("id")}</span></div>
      <div class="pay-nonce-row"><span>= Kode unik akhir</span><span class="nonce-badge">#${nonce}</span></div>
      <div class="pay-hint">3 digit terakhir adalah kode anti-pemalsuan.<br>Owner akan verifikasi saat konfirmasi.</div>
    </div>`;

  const qris=localStorage.getItem("qris");
  document.getElementById("qrisBox").innerHTML=qris
    ?`<div class="qris-wrap"><p>Scan QRIS untuk bayar:</p><img src="${qris}" class="qris-img"></div>`
    :`<div class="qris-empty">QRIS belum tersedia</div>`;
  document.getElementById("checkoutModal").style.display="flex";
  document.getElementById("cartModal").style.display="none";
}

function closeCheckout(){ document.getElementById("checkoutModal").style.display="none"; }

/* ================= ORDER MESSAGE ================= */
async function buildOrderMessage(nama, waP, alamat, extraFields={}){
  const cart    = getCart(), data = calculateCart();
  const storeName  = localStorage.getItem("storeName")||"Toko WA";
  const diskonPesan= +localStorage.getItem("diskonPesan")||0;
  const totalAfterDiskon = diskonPesan>0 ? Math.round(data.total-data.total*diskonPesan/100) : data.total;
  const grand   = totalAfterDiskon + data.ongkir;
  const inv     = await saveTransaction(cart, {total:data.total, ongkir:data.ongkir, grand}, {...extraFields, source:"web", nama:extraFields.nama||"", hp:extraFields.hp||""});
  const cfg     = getConfig();
  const nonce   = generatePaymentNonce();
  const tgl     = new Date().toLocaleString("id");

  // Payload yang di-sign: invoice + grand + nonce + tanggal-pendek
  const sigPayload = {
    inv  : inv||"noInv",
    grand: grand,
    nonce: nonce,
    tgl  : new Date().toLocaleDateString("id")
  };
  const sig = await generateOrderSignature(sigPayload);
  const grandTampil = grand + nonce;   // total tampil = bayar + nonce (3 digit akhir bukti asli)

  const products = ensureProductIndex(getProducts());
  let itemLines = "";
  cart.forEach(i=>{
    const real  = products._map[i.id];
    if(!real) return;
    const pNama = pField(real,"name") || "";
    const harga = getHarga(real, products);
    itemLines  += `" ${pNama} (${i.qty}x) = Rp ${(harga*i.qty).toLocaleString("id")}\n`;
  });

  let msg = `🛍️ *PESANAN BARU - ${storeName}*\n`;
msg += `📄 Invoice: *${inv||"-"}*\n`;
msg += `📅 ${tgl}\n\n`;

msg += `👤 *${nama}*\n📞 ${waP}\n📍 ${alamat}\n\n`;

msg += `🧾 *PESANAN*\n${itemLines}\n`;

msg += `💰 *RINGKASAN*\n`;
msg += `Subtotal: Rp ${data.total.toLocaleString("id")}\n`;

if(diskonPesan>0){
  msg += `Diskon: -Rp ${Math.round(data.total*diskonPesan/100).toLocaleString("id")}\n`;
}

msg += `🚚 Ongkir: ${data.ongkir ? "Rp "+data.ongkir.toLocaleString("id") : "GRATIS"}\n`;

msg += `\n💳 *TOTAL: Rp ${grandTampil.toLocaleString("id")}*\n`;
msg += `🔐 Kode: *${sig}* (#${nonce})\n`;

msg += `\nTerima kasih 🙏`;

return { msg, inv, grand: grandTampil, sig };
}

async function sendWA(){
  const wa=localStorage.getItem("ownerWa"); if(!wa){showToast("❌ No WA belum diset");return;}
  const paymentMethod = document.getElementById("cPaymentMethod")?.value || "WA";

  const inNama = document.getElementById("cNama").value || "Pelanggan";
  const inWa = document.getElementById("cWa").value || "-";
  const inAlamat = document.getElementById("cAlamat").value || "-";

  const result=await buildOrderMessage(
    inNama,
    inWa,
    inAlamat,
    { paymentMethod: paymentMethod, status: "wait", nama: inNama, hp: inWa, alamat: inAlamat }
  );
  window.open("https://wa.me/"+wa+"?text="+encodeURIComponent(result.msg));
  saveCart([]); closeCheckout(); updateCartUI();
  if(window.App && window.App.renderFull) App.renderFull();
  showToast("✅ Pesanan dikirim via WA");
  if(window.Admin && Admin.renderAkuntansi) Admin.renderAkuntansi();
  if(window.Admin && Admin.renderTable) Admin.renderTable();
}

async function sendEmail(){
  const email=localStorage.getItem("ownerEmail"); if(!email){showToast("❌  Email owner belum diset");return;}
  const storeName=localStorage.getItem("storeName")||"Toko WA";
  const result=await buildOrderMessage(
    document.getElementById("cNama").value||"Pelanggan",
    document.getElementById("cWa").value||"-",
    document.getElementById("cAlamat").value||"-"
  );
  window.open(`mailto:${email}?subject=${encodeURIComponent("Pesanan Baru  "+storeName+"  "+new Date().toLocaleDateString("id"))}&body=${encodeURIComponent(result.msg)}`);
  saveCart([]); closeCheckout(); updateCartUI();
  showToast("📧 Draft email dibuka");
  if(window.Admin) Admin.renderAkuntansi&&Admin.renderAkuntansi();
}

const chatWA=()=>{ const wa=localStorage.getItem("ownerWa"); if(!wa){showToast("❌  No WA belum diset");return;} window.open("https://wa.me/"+wa); };

/* ================= OWNER KATEGORI ================= */
function getKategoriList(){
  const dariProduk=[...new Set(getProducts().map(p=>(pField(p,"kategori")||"Umum")).filter(Boolean))];
  const tersimpan=getKategoriTersimpan().filter(Boolean);
  return [...new Set([...tersimpan,...dariProduk])];
}

function renderOwnerKategoriSelect(selected=""){
  const sel=document.getElementById("pKategori"); if(!sel) return;
  const list=getKategoriList();
  const current=selected||sel.value||"";
  sel.innerHTML='<option value="">Pilih kategori...</option>'+list.map(k=>`<option value="${k}">${k}</option>`).join("");
  if(current&&list.includes(current)) sel.value=current;
}

function openTambahKategoriModal(){
  const m=document.getElementById("tambahKategoriModal"); if(!m) return;
  const input=document.getElementById("newKategoriInput"); if(input) input.value="";
  m.style.display="flex";
}
function closeTambahKategoriModal(){ const m=document.getElementById("tambahKategoriModal"); if(m) m.style.display="none"; }

function simpanKategoriBaru(){
  const input=document.getElementById("newKategoriInput"); if(!input) return;
  const nama=input.value.trim(); if(!nama){showToast("❌  Nama kategori kosong");return;}
  const limit=getLimit(), list=getKategoriList();
  if(!list.includes(nama)&&limit.k<999999&&list.length>=limit.k){
    showToast(`⚠️ Limit ${limit.k} kategori tercapai`); return;
  }
  if(!list.includes(nama)){ list.push(nama); saveKategoriTersimpan(list); }
  renderOwnerKategoriSelect(nama);
  closeTambahKategoriModal();
  showToast("✅ Kategori ditambahkan");
}

function closeKategoriPicker(){ const m=document.getElementById("katPickerModal"); if(m) m.style.display="none"; }

function addNewKategori(){
  const input=document.getElementById("katNewInput"); if(!input) return;
  const nama=input.value.trim(); if(!nama){showToast("❌  Nama kosong");return;}
  const list=getKategoriList(), limit=getLimit();
  if(!list.includes(nama)&&limit.k<999999&&list.length>=limit.k){
    showToast(`⚠️Limit ${limit.k} kategori tercapai`); return;
  }
  if(!list.includes(nama)){ list.push(nama); saveKategoriTersimpan(list); }
  renderOwnerKategoriSelect(nama);
  input.value="";
  showToast("✅ Kategori ditambahkan");
}

/* ================= FIRST PIN ================= */
function openChangePinModal(){
  const m = document.getElementById("changePinModal");
  if(m) m.style.display="flex";
}

async function saveFirstPin(){
  const pin=document.getElementById("firstPin").value.trim();
  if(pin.length!==6||isNaN(pin)){alert("PIN harus 6 angka");return;}
  const hash=await hashPIN(pin);
  localStorage.setItem("ownerPinHash",hash);
  localStorage.setItem("pinInitialized","1");
  document.getElementById("changePinModal").style.display="none";
  switchToOwner();
}
window.saveFirstPin=saveFirstPin;

// openDevAccess removed  console-injectable method is a security risk.
// Dev mode is triggered via 00990099 + BACKSPACEx3 keyboard sequence (core.js).

/* ================= EXPORT ================= */
window.App = {
  render: renderFull,
  renderFull,
  changeQty,
  openCart, closeCart, checkout, closeCheckout, sendWA, sendEmail,
  selectKategori, openKategoriPopup, closeKategoriPopup,
  renderOwnerKategoriSelect,
  openTambahKategoriModal, closeTambahKategoriModal, simpanKategoriBaru,
  closeKategoriPicker, addNewKategori,
  chatWA, getLimit,
  updateCartUI,
  openPOS, closePOS, posBayar, posClearCart, posPrintReceipt, _posQtyDelta,
  handleCartTap, renderHeroPromo, loadStoreHeaderLogo
  ,saveHeroPromoHybrid, loadHeroPromoHybrid
  ,reduceStockForTx
};
App.getLimit=getLimit;

/* ================= POS KASIR MODE ================= */
let _posKategori = "Semua";
let _posSearch   = "";

/*  Helpers  */
function _getOngkirDefault(){
  const v = +localStorage.getItem("ongkirDefault");
  // Default 0 (gratis ongkir) unless explicitly set
  return (isNaN(v)||v===undefined) ? 0 : v;
}

function _getPOSDiskon(){
  return { global: +localStorage.getItem("diskonGlobal")||0,
           pesan:  +localStorage.getItem("diskonPesan")||0 };
}

/*  Customer memory  */
function _getCustomers(){ try{ return JSON.parse(localStorage.getItem("_customers")||"{}"); }catch(e){ return {}; } }
function _saveCustomers(obj){ localStorage.setItem("_customers", JSON.stringify(obj)); }

function _normalizeHP(raw){
  let s = raw.replace(/\D/g,"");
  if(s.startsWith("0")) s = "62" + s.slice(1);
  if(!s.startsWith("62")) s = "62" + s;
  return s;
}

function _isValidHP(hp){
  const s = hp.replace(/\D/g,"");
  return s.length >= 10;
}

function _titleCase(str){
  return str.toLowerCase().replace(/(?:^|\s)\S/g, c=>c.toUpperCase());
}

/*  License badge in POS  */
function _updatePOSLicBadge(){
  const el = document.getElementById("posLicBadge"); if(!el) return;
  const tier = window.Core ? Core.getCurrentTier() : "free";
  const t = tier.toLowerCase();
  const label = t.toUpperCase();
  const colors = { free:"#64748b", basic:"#3b82f6", pro:"#5cf17b", premium:"#eab308", ultimate:"#a855f7", developer:"#f59e0b" };
  el.textContent = label;
  el.style.background = (colors[t]||"#64748b") + "22";
  el.style.color = colors[t]||"#64748b";
  el.style.borderColor = (colors[t]||"#64748b") + "55";
}

function openPOS(){
  const el = document.getElementById("posView");
  if(!el) return;
  el.style.display = "block";
  document.getElementById("ownerView").style.display = "none";
  document.getElementById("buyerView").style.display = "none";

  localStorage.setItem("activeView", "pos");

  _updatePOSLicBadge();
  _posRenderKategoriChips();
  _posRenderGrid();
  _posRenderCart();
  _posSetupCustomerFields();

  setTimeout(()=>{ document.getElementById("posSearchInput")?.focus(); }, 80);

  // Back button (owner only)
  if(!posFromBuyer && !document.getElementById("posBackBtn")){
    const backBtn = document.createElement("button");
    backBtn.id = "posBackBtn";
    backBtn.className = "pos-overlay-back";
    backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg> Kembali`;
    backBtn.onclick = closePOS;
    document.body.appendChild(backBtn);
  } else if(!posFromBuyer) {
    document.getElementById("posBackBtn").style.display = "flex";
  } else {
    const btn = document.getElementById("posBackBtn");
    if(btn) btn.style.display = "none";
  }
}

function closePOS(){
  document.getElementById("posView").style.display = "none";
  if(posFromBuyer){
    document.getElementById("buyerView").style.display = "block";
    document.getElementById("ownerView").style.display = "none";
  } else {
    document.getElementById("ownerView").style.display = "block";
    document.getElementById("buyerView").style.display = "none";
  }
  posFromBuyer = false;
  localStorage.setItem("activeView", "buyer");
  const backBtn = document.getElementById("posBackBtn");
  if(backBtn) backBtn.style.display = "none";
}

function handleCartTap(e){
  if(e) e.preventDefault();
  cartTapCount++;
  clearTimeout(cartTapTimer);
  cartTapTimer = setTimeout(()=>{
    if(cartTapCount < 3) openCart();
    cartTapCount = 0;
  }, 260);
  if(cartTapCount >= 3){
    cartTapCount = 0;
    clearTimeout(cartTapTimer);
    openPinOverlay("cashier");
  }
}

/*  Kategori chips  */
function _posRenderKategoriChips(){
  const wrap = document.getElementById("posKategoriChips"); if(!wrap) return;
  const products = getProducts();
  const kats = ["Semua", ...new Set(products.map(p=>pField(p,"kategori")||"Umum"))];
  wrap.innerHTML = kats.map(k=>
    `<div class="pos-chip${k===_posKategori?" active":""}" data-kat="${k}">${k}</div>`
  ).join("");
}

/*  Product grid  */
async function _posRenderGrid(){
  const el = document.getElementById("posProductGrid"); if(!el) return;
  let products = getProducts();
  if(!products || products.length === 0) {
    if(window.Core && Core.idbGetAll) {
        products = await Core.idbGetAll("products");
    }
  }

  const cart = getCart();
  const q = _posSearch.toLowerCase();

  const filtered = products.filter(p=>{
    const k = pField(p,"kategori")||"Umum";
    const n = (pField(p,"name")||"").toLowerCase();
    return (_posKategori==="Semua"||k===_posKategori) && (!q||n.includes(q));
  });

  if(!filtered.length){
    el.innerHTML=`<div class="pos-cart-empty" style="grid-column:1/-1"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><div>Produk tidak ditemukan</div></div>`;
    return;
  }

  el.innerHTML = filtered.map(p=>{
    const id    = pField(p,"id")||p.i;
    const name  = pField(p,"name")||p.n||"";
    const price = getHarga(p);
    const img   = pField(p,"img")||p.g||"";
    const stok  = p.stok;
    const cartItem = cart.find(x=>x.id===id);
    const qty = cartItem?cartItem.qty:0;
    const inCart = qty>0;

    const imgHtml = img
      ? `<img src="${img}" loading="lazy" onerror="this.parentNode.innerHTML='x:'">`
      : `x:`;

    const cfg2 = getConfig();
    const diskonGPos = cfg2.diskonGlobal||0;
    const originalPrice = p.p||p.price||0;
    const hasDiskon = diskonGPos > 0 && originalPrice > price;

    const stokNum = typeof stok === "number" ? stok : null;
    const stokHtml = stokNum !== null
      ? stokNum <= 0
        ? `<div class="pos-card-stok habis">❌ Habis</div>`
        : stokNum < 5
          ? `<div class="pos-card-stok low">a ${stokNum}</div>`
          : `<div class="pos-card-stok ok">Stok ${stokNum}</div>`
      : "";

    // Cart quantity stepper vs single + button
    const qtyCtrl = inCart
      ? `<div class="pos-card-stepper">
           <button class="stepper-btn" onclick="event.stopPropagation();App._posQtyDelta('${id}',-1)">-</button>
           <span class="stepper-num">${qty}</span>
           <button class="stepper-btn" onclick="event.stopPropagation();App._posQtyDelta('${id}',1)">+</button>
         </div>`
      : `<button class="pos-card-add-btn" onclick="event.stopPropagation();App._posQtyDelta('${id}',1)">+</button>`;

    return `
      <div class="pos-card${inCart?" in-cart":""}${stokNum<=0?" out-of-stock":""}" ${stokNum<=0?"style=\"opacity:0.6;pointer-events:none;\"":""} data-pos-id="${id}">
        <div class="pos-card-img">
          ${imgHtml}
          ${qty>0?`<div class="pos-card-qty-badge">${qty}</div>`:""}
        </div>
        <div class="pos-card-body">
          <div class="pos-card-name">${name}</div>
          <div class="pos-card-price-wrap">
            ${hasDiskon?`<div class="pos-card-price-ori">Rp ${originalPrice.toLocaleString("id")}</div>`:""}
            <div class="pos-card-price">Rp ${price.toLocaleString("id")}</div>
            ${hasDiskon?`<span class="pos-card-diskon-badge">-${diskonGPos}%</span>`:""}
          </div>
          ${stokHtml}
          ${qtyCtrl}
        </div>
      </div>`;
  }).join("");
}

function _posQtyDelta(id, delta){
  const products = getProducts();
  const p = products.find(x=>x.id===id);
  if(p && p.stok <= 0) return; // Prevent adding if out of stock
  let cart = getCart();
  const idx = cart.findIndex(x => String(x.id) === String(id));
  if(delta > 0){
    if(idx >= 0) cart[idx].qty += delta;
    else cart.push({ id: String(id), qty: delta });
  } else {
    if(idx >= 0){
      cart[idx].qty += delta;
      if(cart[idx].qty <= 0) cart.splice(idx, 1);
    }
  }
  saveCart(cart);
  _posRenderGrid();
  _posRenderCart();
  updateCartUI();
}

/*  Cart render with full breakdown  */
function _posRenderCart(){
  const el = document.getElementById("posCartItems"); if(!el) return;
  const cart = getCart();
  const badge    = document.getElementById("posCartBadge");
  const totalEl  = document.getElementById("posTotalAmount");
  const bayarBtn = document.getElementById("posBayarBtn");
  const summaryEl= document.getElementById("posSummary");
  const fieldsEl = document.getElementById("posCheckoutFields");
  const products = ensureProductIndex(getProducts());
  const cfg      = getConfig();
  const diskonG  = cfg.diskonGlobal||0;
  const diskonP  = +localStorage.getItem("diskonPesan")||0;
  const ongkir   = _getOngkirDefault();

  if(!cart.length){
    el.innerHTML=`<div class="pos-cart-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <div>Keranjang kosong</div>
      <small>Klik produk untuk menambah</small>
    </div>`;
    if(badge) badge.textContent="0";
    if(totalEl) totalEl.textContent="Rp 0";
    if(bayarBtn){ bayarBtn.disabled=true; }
    if(summaryEl) summaryEl.style.display="none";
    if(fieldsEl) fieldsEl.style.display="none";
    return;
  }

  // Build items list
  let subtotal=0, totalItems=0;
  const rows = cart.map(i=>{
    const real = products._map[i.id]; if(!real) return "";
    const nama  = pField(real,"name")||"";
    const harga = getHarga(real,products);
    const sub   = harga*i.qty;
    subtotal += sub;
    totalItems += i.qty;
    return `
      <div class="pos-cart-item" data-cart-id="${i.id}">
        <div class="pos-cart-item-info">
          <div class="pos-cart-item-name">${nama}</div>
          <div class="pos-cart-item-meta">Rp ${harga.toLocaleString("id")} x ${i.qty} = <b>Rp ${sub.toLocaleString("id")}</b></div>
        </div>
        <div class="pos-cart-stepper">
          <button data-id="${i.id}" data-delta="-1">-</button>
          <span>${i.qty}</span>
          <button data-id="${i.id}" data-delta="1">+</button>
        </div>
      </div>`;
  }).join("");

  el.innerHTML = rows;

  // Summary
  const diskonNominal = diskonG>0 ? Math.round(subtotal*diskonG/100) : 0;
  const afterGlobal   = subtotal - diskonNominal;
  const diskonPNominal= diskonP>0 ? Math.round(afterGlobal*diskonP/100) : 0;
  const afterAll      = afterGlobal - diskonPNominal;
  const totalDiskon   = diskonNominal + diskonPNominal;
  const grand         = afterAll + ongkir;

  if(badge) badge.textContent = String(totalItems);
  if(totalEl) totalEl.textContent = "Rp "+grand.toLocaleString("id");
  if(bayarBtn) bayarBtn.disabled = false;
  if(summaryEl) summaryEl.style.display="block";
  if(fieldsEl)  fieldsEl.style.display="block";

  // Attach payment method listener (safe to call multiple times)
  if(typeof _posAttachPayListener === "function"){
    _posAttachPayListener();
  }

  // Update summary rows (single paint to avoid stale node issues)
  if(summaryEl){
    const diskonLabel = `Diskon ${diskonG>0?diskonG+"%":""}${diskonG>0&&diskonP>0?" + ":""}${diskonP>0?diskonP+"% pesan":""}`.trim() || "Diskon";
    summaryEl.innerHTML = `
      <div class="pos-sum-row"><span>Subtotal</span><span>Rp ${subtotal.toLocaleString("id")}</span></div>
      <div class="pos-sum-row diskon"><span>${diskonLabel}</span><span>- Rp ${totalDiskon.toLocaleString("id")}</span></div>
      <div class="pos-sum-row"><span>Ongkir</span><span>${ongkir===0 ? "GRATIS" : "Rp "+ongkir.toLocaleString("id")}</span></div>
      <div class="pos-sum-divider"></div>
      <div class="pos-sum-row grand"><span>TOTAL</span><span>Rp ${grand.toLocaleString("id")}</span></div>
    `;
  }

  // Keep footer total in sync with summary for clear reading
  if(totalEl) totalEl.textContent = "Rp "+grand.toLocaleString("id");
}

/*  Customer fields: ENTER flow + auto-lookup  */
function _posSetupCustomerFields(){
  const flow = ["posNama","posHp","posAlamat"];

  flow.forEach((id, idx)=>{
    const el = document.getElementById(id);
    if(!el) return;

    // Remove old listeners (clone trick)
    const fresh = el.cloneNode(true);
    el.parentNode.replaceChild(fresh, el);
    const input = document.getElementById(id);

    input.addEventListener("keydown", e=>{
      if(e.key !== "Enter") return;
      e.preventDefault();
      // Auto-format on blur
      _posFmtField(id);
      const next = flow[idx+1];
      if(next){ document.getElementById(next)?.focus(); }
      else { App.posBayar(); }
    });

    input.addEventListener("blur", ()=>_posFmtField(id));

    // HP: lookup customer
    if(id==="posHp"){
      input.addEventListener("input", ()=>{
        const hp = input.value.trim();
        if(hp.length>=10) _posLookupCustomer(hp);
        else {
          const cfEl = document.getElementById("posCustomerFound");
          if(cfEl) cfEl.style.display="none";
        }
      });
    }
  });

  // Payment method change  JS listener (more reliable than onchange attr)
  const payEl = document.getElementById("posPayMethod");
  if(payEl){
    // Remove old listener via clone
    const freshPay = payEl.cloneNode(true);
    payEl.parentNode.replaceChild(freshPay, payEl);
    document.getElementById("posPayMethod").addEventListener("change", function(){
      _posOnPayMethodChange(this.value);
    });
    // Reset to Tunai on open
    _posOnPayMethodChange("Tunai");
  }
}

function _posFmtField(id){
  const el = document.getElementById(id); if(!el) return;
  let v = el.value.trim();
  if(!v) return;
  if(id==="posNama") el.value = _titleCase(v);
  if(id==="posAlamat") el.value = v.charAt(0).toUpperCase() + v.slice(1);
  if(id==="posHp"){
    if(!_isValidHP(v)){
      el.style.borderColor="var(--red)";
    } else {
      el.style.borderColor="";
      el.value = _normalizeHP(v);
    }
  }
}

function _posLookupCustomer(rawHp){
  const hp = _normalizeHP(rawHp);
  const customers = _getCustomers();
  const found = customers[hp];
  const cfEl = document.getElementById("posCustomerFound");
  if(!found||!cfEl){ if(cfEl) cfEl.style.display="none"; return; }
  cfEl.style.display="flex";
  cfEl.innerHTML=`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Pelanggan ditemukan: <b>${found.nama||hp}</b>`;
  // Auto-fill
  const namaEl = document.getElementById("posNama");
  const alamatEl = document.getElementById("posAlamat");
  if(namaEl && !namaEl.value) namaEl.value = found.nama||"";
  if(alamatEl && !alamatEl.value) alamatEl.value = found.alamat||"";
}

/*  BAYAR (process transaction + send WA)  */
async function posBayar(){
  const cart = getCart();
  if(!cart.length){ showToast("Keranjang kosong"); return; }

  // Debounce
  if(posBayar._lock){ return; }
  posBayar._lock = true;
  setTimeout(()=>{ posBayar._lock=false; }, 1500);

  let payMethod = document.getElementById("posPayMethod")?.value||"Tunai";

  // Jika QRIS admin di-disable, perlakukan QRIS sebagai Tunai
  const qrisEnabled = localStorage.getItem("qrisEnabled") !== "false";
  if(payMethod === "QRIS" && !qrisEnabled){
      payMethod = "Tunai";
  }

  // QRIS: timer 3 detik sebelum proses otomatis
  if(payMethod === "QRIS" && !posBayar._qrisValidated){
    const qrisSrc = localStorage.getItem("qrisImg")||localStorage.getItem("qris")||"";
    if(!qrisSrc) {
        showToast("QRIS belum diupload di menu Toko");
        posBayar._lock = false;
        return;
    }


    // Tampilkan overlay QRIS
    const qrisOverlay = document.getElementById("posQrisOverlay");
    if(qrisOverlay) qrisOverlay.style.display = "flex";

    const oldBtnText = document.getElementById("posBayarBtn").innerHTML;
    document.getElementById("posBayarBtn").innerHTML = "<b style='color:#fff'>Tunggu 3 Detik...</b>";
    document.getElementById("posBayarBtn").disabled = true;
    document.getElementById("posBayarBtn").style.backgroundColor = "#dc2626"; // Merah
    document.getElementById("posBayarBtn").style.borderColor = "#b91c1c";

    showToast("⚠️ CEK PEMBAYARAN! Tunggu 3 Detik...", 3000, {background: "#dc2626", color: "#fff", fontWeight: "bold"});
    setTimeout(()=>{
      posBayar._qrisValidated = true;
      posBayar._lock = false;
      document.getElementById("posBayarBtn").disabled = false;
      document.getElementById("posBayarBtn").innerHTML = oldBtnText;
      document.getElementById("posBayarBtn").style.backgroundColor = ""; // Reset
      document.getElementById("posBayarBtn").style.borderColor = "";
      showToast("✅ Validasi OK! Silakan klik BAYAR kembali", 3000, {background: "#16a34a", color: "#fff", fontWeight: "bold"});
    }, 3000);

    return;
  }

  // Sembunyikan QRIS setelah user klik tombol Bayar yang kedua (proses validasi lolos)
  const qrisOverlayFinal = document.getElementById("posQrisOverlay");
  if(qrisOverlayFinal) qrisOverlayFinal.style.display = "none";

  if(payMethod !== "QRIS") {
    const qrisMini = document.getElementById("posQrisMini");
    if(qrisMini) qrisMini.style.display = "none";
  }


  if(payMethod !== "QRIS") {
    const qrisMini = document.getElementById("posQrisMini");
    if(qrisMini) qrisMini.style.display = "none";
  }

  posBayar._qrisValidated = false;

  // Get customer data
  const namaRaw   = document.getElementById("posNama")?.value.trim()||"";
  const hpRaw     = document.getElementById("posHp")?.value.trim()||"";
  const alamatRaw = document.getElementById("posAlamat")?.value.trim()||"";

  const nama   = namaRaw   ? _titleCase(namaRaw)   : "Pelanggan";
  const alamat = alamatRaw ? alamatRaw.charAt(0).toUpperCase()+alamatRaw.slice(1) : "-";
  const hp     = hpRaw && _isValidHP(hpRaw) ? _normalizeHP(hpRaw) : "";

  // Validate HP if filled
  if(hpRaw && !_isValidHP(hpRaw)){
    showToast("No HP tidak valid (min 10 digit)");
    document.getElementById("posHp")?.focus();
    posBayar._lock=false;
    return;
  }

  // Calc totals
  const products = ensureProductIndex(getProducts());
  const cfg      = getConfig();
  const diskonG  = cfg.diskonGlobal||0;
  const diskonP  = +localStorage.getItem("diskonPesan")||0;
  const ongkir   = _getOngkirDefault();
  const storeName= localStorage.getItem("storeName")||"Toko WA";
  const ownerWa  = localStorage.getItem("ownerWa")||"";
  const noRek    = localStorage.getItem("noRekBank")||"";
  const qrisData = localStorage.getItem("qrisImg")||localStorage.getItem("qris")||"";  // base64 or URL

  let subtotal=0;
  let itemLines="";
  cart.forEach(i=>{
    const real=products._map[i.id]; if(!real) return;
    const harga = getHarga(real,products);
    const sub   = harga*i.qty;
    subtotal += sub;
    const n = pField(real,"name")||"";
    itemLines += "- "+n+" ("+i.qty+"x) = Rp "+sub.toLocaleString("id")+"\n";
  });

  const diskonNominal = diskonG>0 ? Math.round(subtotal*diskonG/100) : 0;
  const afterGlobal   = subtotal - diskonNominal;
  const diskonPNominal= diskonP>0 ? Math.round(afterGlobal*diskonP/100) : 0;
  const afterAll      = afterGlobal - diskonPNominal;
  const grand         = afterAll + ongkir;

  // Save transaction
  const inv = await saveTransaction(cart,
    { total: subtotal, ongkir, grand },
    { paymentMethod: payMethod,
      status: (payMethod==="Transfer"||payMethod==="COD") ? "wait" : "paid",
      source:"kasir", nama, hp, alamat }
  );

  // Save customer
  if(hp){
    const customers = _getCustomers();
    customers[hp] = { nama, alamat, lastSeen: Date.now() };
    _saveCustomers(customers);
  }

  // Generate signature + nonce
  const nonce = generatePaymentNonce();
  const tgl   = new Date().toLocaleString('id');
  const sigPayload = { inv: inv||'noInv', grand, nonce, tgl: new Date().toLocaleDateString('id') };
  const sig   = await generateOrderSignature(sigPayload);
  const grandBayar = grand + nonce;  // unique display total

  // Payment info string
  let payInfo = payMethod;
  if(payMethod==='Transfer' && noRek) payInfo = 'Transfer - No Rek: '+noRek;
  if(payMethod==='QRIS') payInfo = 'QRIS';

  // Build WA message (owner)
  let msg  = '[KASIR] *TRANSAKSI - '+storeName+'*\n';
  msg += 'Invoice: *'+(inv||'--')+'*\n';
  msg += 'Tgl: '+tgl+'\n';
  msg += '\nPelanggan: *'+nama+'*\n';
  if(hp)     msg += 'HP: '+hp+'\n';
  if(alamat&&alamat!=='-') msg += 'Alamat: '+alamat+'\n';
  msg += '\n--- PESANAN ---\n'+itemLines;
  msg += '\n--- RINGKASAN ---\n';
  msg += 'Subtotal  : Rp '+subtotal.toLocaleString('id')+'\n';
  if(diskonNominal>0) msg += 'Diskon    : -Rp '+diskonNominal.toLocaleString('id')+'\n';
  if(diskonPNominal>0) msg += 'Dis.Pesan : -Rp '+diskonPNominal.toLocaleString('id')+'\n';
  msg += 'Ongkir    : '+(ongkir>0?'Rp '+ongkir.toLocaleString('id'):'GRATIS')+'\n';
  msg += '\nTOTAL BAYAR: *Rp '+grandBayar.toLocaleString('id')+'*\n';
  msg += 'Metode    : '+payInfo+'\n';
  msg += '\nKode Verif: *'+sig+'* | #'+nonce+'\n';
  msg += '_Kode ini bukti transaksi asli._\nTerima kasih!';

  // Send to OWNER
  if(ownerWa){ window.open('https://wa.me/'+ownerWa+'?text='+encodeURIComponent(msg)); }

  // Send to BUYER (if HP given)
  if(hp){
    let bm  = '[STRUK] *Terima kasih, '+nama+'!*\n';
    bm += 'Pesanan di '+storeName+' telah diproses.\n';
    bm += 'Invoice: *'+(inv||'--')+'*\n';
    bm += 'Tgl: '+tgl+'\n';
    bm += '\n--- ITEM ---\n'+itemLines;
    bm += '\nTOTAL: *Rp '+grandBayar.toLocaleString('id')+'*\n';
    bm += 'Metode: '+payInfo+'\n';
    bm += '\nKode Verif: *'+sig+'* | #'+nonce+'\n';
    bm += '_Simpan sebagai bukti pembayaran._';
    setTimeout(()=>{ window.open('https://wa.me/'+hp+'?text='+encodeURIComponent(bm)); }, 700);
  }

  // Success flash + clear
  _posShowSuccess(nama, grandBayar, inv||'--');
  saveCart([]);
  updateCartUI();
  _posRenderGrid();
  _posRenderCart();
  _posClearFields();
  _posUpdatePrintBtn();
  if(window.Admin) Admin.renderAkuntansi&&Admin.renderAkuntansi();
  if(window.Admin) Admin.renderTable&&Admin.renderTable();
}

function _posClearFields(){
  ["posNama","posHp","posAlamat"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  const cfEl=document.getElementById("posCustomerFound");
  if(cfEl) cfEl.style.display="none";
  // Reset payment method panels
  _posOnPayMethodChange("Tunai");
  const sel=document.getElementById("posPayMethod"); if(sel) sel.value="Tunai";
}

/*  Payment method change: show QRIS image or bank info  */
function _posOnPayMethodChange(method){
  const qrisOverlay  = document.getElementById("posQrisOverlay");
  const qrisImgLeft  = document.getElementById("posQrisImgLeft");
  const transferInfo = document.getElementById("posTransferInfo");
  const transferDet  = document.getElementById("posTransferDetail");
  const waitInfo     = document.getElementById("posWaitInfo");

  if(qrisOverlay){
    if(method === "QRIS"){
      const qrisSrc = localStorage.getItem("qrisImg")||localStorage.getItem("qris")||"";
      if(qrisSrc && qrisImgLeft){
        qrisImgLeft.src = qrisSrc;
        qrisOverlay.style.display = "flex";
      } else {
        qrisOverlay.style.display = "none";
        showToast("QRIS belum diupload di menu Toko");
      }
    } else {
      qrisOverlay.style.display = "none";
    }
  }

  if(transferInfo) transferInfo.style.display = (method==="Transfer") ? "block" : "none";
  if(waitInfo)     waitInfo.style.display     = (method==="Transfer"||method==="COD") ? "flex" : "none";

  if(method==="Transfer" && transferDet){
    const rek = localStorage.getItem("noRekBank")||"";
    transferDet.textContent = rek || "(Rekening belum diset di menu Toko)";
    transferDet.style.color = rek ? "" : "var(--text3)";
  }
}

function _posShowSuccess(nama, grand, inv){
  // Remove old if any
  const old=document.getElementById("posSuccessFlash"); if(old) old.remove();
  const div=document.createElement("div");
  div.id="posSuccessFlash";
  div.className="pos-success-flash";
  div.innerHTML=`
    <div class="pos-success-icon"></div>
    <div class="pos-success-title">Transaksi Berhasil!</div>
    <div class="pos-success-sub">${nama}  Rp ${grand.toLocaleString("id")}</div>
    <div class="pos-success-inv">Invoice: ${inv}</div>`;
  document.getElementById("posView")?.appendChild(div);
  setTimeout(()=>{ div.classList.add("fade-out"); setTimeout(()=>div.remove(),400); }, 2200);
}

/*  POS clear cart  */
function posClearCart(){
  if(!getCart().length) return;
  if(!confirm("Kosongkan keranjang?")) return;
  saveCart([]);
  updateCartUI();
  _posRenderGrid();
  _posRenderCart();
  _posClearFields();
  showToast("🔥 Keranjang dikosongkan");
}

/*  Safe POS sync  */
function _posSyncUI(){
  if(document.getElementById("posView")?.style.display!=="none"){
    _posRenderGrid();
    _posRenderCart();
  }
}

/*  POS event delegation (document-level)  */
document.addEventListener("click", e=>{
  const chip = e.target.closest("#posKategoriChips .pos-chip");
  if(chip){
    _posKategori = chip.dataset.kat;
    _posRenderKategoriChips();
    _posRenderGrid();
    return;
  }
  const posGrid = e.target.closest("#posProductGrid");
  if(posGrid){
    const card = e.target.closest(".pos-card");
    if(card && card.dataset.posId){
      const id = +card.dataset.posId;
      changeQty(id, 1);
      _posSyncUI();
    }
    return;
  }
  const posCart = e.target.closest("#posCartItems");
  if(posCart){
    const btn = e.target.closest("button[data-id]");
    if(btn){
      const id=+btn.dataset.id, delta=+btn.dataset.delta;
      if(!isNaN(id)&&!isNaN(delta)){ changeQty(id,delta); _posSyncUI(); }
    }
  }
});

document.addEventListener("input", e=>{
  if(e.target.id==="posSearchInput"){
    _posSearch = e.target.value;
    _posRenderGrid();
  }
});

/* ================= KEYBOARD SHORTCUTS ================= */
(function _initKeyboard(){
  function isTextInput(el){
    if(!el) return false;
    const tag = el.tagName;
    if(tag==="TEXTAREA") return true;
    if(tag==="INPUT"){
      const t = (el.type||"").toLowerCase();
      return !["checkbox","radio","submit","button","reset"].includes(t);
    }
    return el.isContentEditable;
  }
  function isPinActive(){
    const pin = document.getElementById("pinOverlay");
    return pin && pin.style.display !== "none";
  }
  function isPOSVisible(){
    const pos = document.getElementById("posView");
    return pos && pos.style.display !== "none";
  }
  function isCheckoutOpen(){
    const m = document.getElementById("checkoutModal");
    return m && m.style.display !== "none";
  }
  function isCartOpen(){
    const m = document.getElementById("cartModal");
    return m && m.style.display !== "none";
  }

  let _enterLock = false;

  document.addEventListener("keydown", e=>{
    if(isPinActive()) return;
    const key = e.key;
    const active = document.activeElement;
    const inText = isTextInput(active);

    // POS mode shortcuts
    if(isPOSVisible()){
      // ENTER in POS fields is handled by _posSetupCustomerFields
      // Only intercept ENTER when NOT in a field
      if(key==="Enter" && !inText){
        e.preventDefault();
        if(_enterLock) return;
        _enterLock=true; setTimeout(()=>_enterLock=false, 800);
        posBayar();
        return;
      }

      // Map keys to payment methods
      if((key==="1" || key==="t" || key==="T") && !inText){
          document.getElementById('posPayMethod').value='Tunai';
          posBayar(); return;
      }
      if((key==="2" || key==="q" || key==="Q") && !inText){
          document.getElementById('posPayMethod').value='QRIS';
          posBayar(); return;
      }
      if((key==="3" || key==="r" || key==="R") && !inText){
          document.getElementById('posPayMethod').value='Transfer';
          posBayar(); return;
      }
      if((key==="4" || key==="c" || key==="C") && !inText){
          document.getElementById('posPayMethod').value='COD';
          posBayar(); return;
      }
      if(key==="Escape"){
        e.preventDefault();
        // ESC = clear cart (no confirm needed if just 1 item, confirm if more)
        const cart=getCart();
        if(!cart.length){ closePOS(); return; }
        saveCart([]);
        updateCartUI();
        _posSyncUI();
        _posClearFields();
        showToast("🔥 Keranjang dikosongkan");
        return;
      }
      if(!inText){
        if(key==="+"||key==="="){
          const cart=getCart();
          if(cart.length) changeQty(cart[cart.length-1].id, 1);
          return;
        }
        if(key==="-"){
          const cart=getCart();
          if(cart.length) changeQty(cart[cart.length-1].id, -1);
          return;
        }
      }
      return;
    }

    // Cart modal ENTER = checkout
    if(isCartOpen() && !inText && key==="Enter"){
      e.preventDefault();
      if(_enterLock) return;
      _enterLock=true; setTimeout(()=>_enterLock=false,600);
      checkout();
      return;
    }
    // Checkout modal fallback
    if(isCheckoutOpen() && !inText && key==="Enter"){
      e.preventDefault();
      if(_enterLock) return;
      _enterLock=true; setTimeout(()=>_enterLock=false,1000);
      sendWA();
      return;
    }
    // Escape closes modals
    if(key==="Escape"){
      if(isCheckoutOpen()){ closeCheckout(); return; }
      if(isCartOpen()){ closeCart(); return; }
    }
  }, true);
})();

/* ================= INIT ================= */
function _appInit(){
  _initTapListener();
  initMode();
  loadHeroPromoHybrid();
  renderHeroPromo();
  loadStoreHeaderLogo();
  renderOwnerKategoriSelect();

  if(localStorage.getItem("activeView") === "pos"){
    openPOS();
  }

  console.log("APP v4.2 READY xa");
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", _appInit);
} else {
  _appInit();
}

// Keep buyer/POS layout stable when browser is resized
let _resizeT = null;
window.addEventListener("resize", ()=>{
  clearTimeout(_resizeT);
  _resizeT = setTimeout(()=>{
    if(document.getElementById("buyerView")?.style.display !== "none"){
      renderFull();
      _updateProductCards();
    }
    if(document.getElementById("posView")?.style.display !== "none"){
      _posRenderGrid();
      _posRenderCart();
    }
  }, 120);
});

// Checkout modal: ENTER on last input field triggers sendWA
document.addEventListener("DOMContentLoaded", ()=>{
  if(typeof autoCancelExpiredOrders === "function") autoCancelExpiredOrders();
  ["cNama","cWa","cAlamat"].forEach((id, idx, arr)=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("keydown", e=>{
      if(e.key !== "Enter") return;
      e.preventDefault();
      const next = arr[idx+1];
      if(next){ document.getElementById(next)?.focus(); }
      else    { sendWA(); }
    });
  });
});

window.debugApp = { getProducts, getCart, calculateCart };


window.invalidateAppTxCache = function() { _appTxCache = null; };
window.invalidateAppProductCache = function() { /* App relies on getProducts() from core/admin, so we may not need to do much, but we could re-render */ };
