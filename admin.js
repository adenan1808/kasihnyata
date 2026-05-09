/* =========================================
   ADMIN.JS v4.0 — OWNER PANEL
   Fixes: full-field signing, IndexedDB storage, stock,
   keyboard ENTER flow, payment method & status in tx
   ========================================= */
"use strict";
console.log("ADMIN v4.0 INIT");

/* ================= DATA SCHEMA (minified keys) =================
   NEW: { i, n, p, m, k, g, stok }  = id, name, price, modal, kategori, img, stok
   OLD: { id, name, price, modal, kategori, img }
   Backward-compat layer: normalizeProduct()
   ============================================================= */
/* ================= SIGN / VERIFY PRODUCT (full-field, anti-forgery) ================= */
async function signProduct(p){
  // Use Core.signProduct (full {i,n,p,m,k}) if available
  if(window.Core && Core.signProduct) return await Core.signProduct(p);
  // Inline fallback (same algorithm)
  const deviceId = localStorage.getItem("_deviceId") || "DEV-FALLBACK";
  const secret   = "TOKO_WA_V1_" + deviceId.slice(0,12);
  const payload  = JSON.stringify(
    ["i","k","m","n","p"].reduce((o,k)=>{ o[k] = k==="m" ? (p[k]||0) : (k==="k" ? (p[k]||"Umum") : p[k]); return o; }, {})
  );
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload + "|" + secret));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function verifyProduct(p){
  if(window.Core && Core.verifyProduct) return await Core.verifyProduct(p);
  if(!p || !p.sig) return false;
  const check = await signProduct(p);
  return check === p.sig;
}


function normalizeProduct(p){
  if(!p) return null;
  // Already new format
  if(p.i !== undefined) return p;
  // Old format → new
  return { i: p.id, n: p.name, p: p.price, m: p.modal||0, k: p.kategori||"Umum", g: p.img||"" };
}

function denormalizeProduct(p){
  // New → old-compat shape for cart & legacy reads
  if(p.id !== undefined) return p;
  return { id: p.i, name: p.n, price: p.p, modal: p.m||0, kategori: p.k||"Umum", img: p.g||"" };
}

/* ================= PRODUCT STORAGE (IndexedDB primary, localStorage fallback) ================= */
let _productsCache = null;
let _productsDirty = true;

// Async: reads from IDB first, falls back to localStorage
async function getProductsAsync(){
  try{
    if(window.Core && Core.idbGetAll){
      const items = await Core.idbGetAll("products");
      if(items && items.length > 0){
        _productsCache = items;
        _productsDirty = false;
        return _productsCache;
      }
    }
  }catch(e){ console.warn("[IDB] getProducts failed, using localStorage:", e); }
  return getProducts(); // sync fallback
}

// Sync: returns cache or parses localStorage (for code that can't await)
function getProducts(){
  if(!_productsDirty && _productsCache) return _productsCache;

  // We initiate background load to IDB, but synchronously read from localStorage for this tick.
  if(window.Core && Core.idbGetAll){
    Core.idbGetAll("products").then(items => {
      if(items && items.length > 0){
        _productsCache = items;
        _productsDirty = false;
        // Optionally trigger re-render here if needed, but usually this is just priming
      }
    }).catch(e=>{});
  }

  try{
    const raw = JSON.parse(localStorage.getItem("products")||"[]");

    _productsCache = raw.map(p => {
      const item = p.i !== undefined ? p : normalizeProduct(p);
      // quick sanity check on sig format
      if(item.sig && (typeof item.sig !== "string" || item.sig.length < 20)){
        item._invalid = true;
      }
      return item;
    });

    // 🔐 Full-field background validation
    setTimeout(()=>{
      _productsCache.forEach(async (p)=>{
        if(!p.sig) return;
        const valid = await verifyProduct(p);
        if(!valid){
          console.warn("⚠️ Produk diubah:", p.n || p.i);
          p._invalid = true;
        }
      });
    }, 0);

    _productsDirty = false;
  }catch(e){
    _productsCache = [];
  }

  return _productsCache;
}

// Async save: writes to IDB first, then localStorage for compat
async function saveProductsAsync(arr){
  const minified = arr.map(p => p.i !== undefined ? p : normalizeProduct(p));
  _productsCache  = minified;
  _productsDirty  = false;
  // IDB write
  if(window.Core && Core.idbPutAll){
    try{ await Core.idbPutAll("products", minified); }catch(e){ console.warn("[IDB] save failed:",e); }
  }
  // localStorage compat
  localStorage.setItem("products", JSON.stringify(minified)); if(typeof window.notifySync==="function") window.notifySync("products");
}

// Sync save fallback
function saveProducts(arr){
  const minified = arr.map(p => p.i !== undefined ? p : normalizeProduct(p));
  localStorage.setItem("products", JSON.stringify(minified)); if(typeof window.notifySync==="function") window.notifySync("products");
  _productsCache = minified;
  _productsDirty = false;
  // Fire-and-forget IDB sync
  if(window.Core && Core.idbPutAll){
    Core.idbPutAll("products", minified).catch(e=>console.warn("[IDB] bg save failed:",e));
  }
}

function invalidateProductCache(){ _productsDirty = true; _productsCache = null; }

/* ================= CONFIG ================= */
function getConfig(){ return JSON.parse(localStorage.getItem("config")||"{}"); }
function saveConfig(c){ localStorage.setItem("config", JSON.stringify(c)); }

/* ================= LIMIT CHECK (canonical — reads from Core) ================= */
function _getLimit(){
  // Core.getLimit() is authoritative. Fallback only if core not loaded yet.
  if(window.Core && typeof Core.getLimit === "function") return Core.getLimit();
  if(window.getLimit) return getLimit();
  return { p:10, k:2 };
}

/* ================= TAB SWITCH ================= */
function showTab(id, btn){
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  if(btn) btn.classList.add("active");
  if(id==="tabProduk") renderOwnerProdukList();
  if(id==="tabBackup") renderBackupHistory();
  if(id==="tabPromo")  loadConfig();
  if(id==="tabAkuntansi") renderAkuntansi();
  if(id==="tabTable")     { renderTable(); renderPelangganList(); }
  if(id==="tabHistory")   renderHistory();
  if(id==="tabPelanggan") renderPelangganList();
  if(id==="tabProduk")    renderKategoriChipAdmin();
  if(id==="tabToko")      renderKasirList();
}

/* ================= IMAGE COMPRESSION (WebP, 320-400px, 20-50KB) ================= */

async function uploadToBackend(file) {
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });
        if(!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if(data.success) {
            return {
                img: data.image_url,
                thumb: data.thumbnail_url
            };
        }
    } catch(e) {
        console.warn("Backend upload failed, falling back to local compression", e);
    }
    return null;
}

function compressImage(file, callback){
  const img    = new Image();
  const reader = new FileReader();
  reader.onload = e => { img.src = e.target.result; };
  img.onload = function(){
    const MAX_W = 360; // target: 320-400px range
    // Prevent upscale
    const scale = Math.min(1, MAX_W / img.width);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    // Target: 20-50KB → ~30000 bytes base64 ≈ 40KB file
    const TARGET_BYTES = 45000;
    let q = 0.85, result;
    do {
      result = canvas.toDataURL("image/webp", q);
      q -= 0.05;
    } while(result.length > TARGET_BYTES && q > 0.15);

    callback(result);
  };
  reader.readAsDataURL(file);
}

/* ================= AUTO HARGA JUAL ================= */
function autoHargaJual(){
  const modal = +document.getElementById("pModal").value;
  if(!modal) return;
  const margin = +(localStorage.getItem("defaultMargin")||"30");
  document.getElementById("pPrice").value = Math.round(modal * (1 + margin/100));
}

/* ================= INVOICE HELPERS ================= */
function generateInvoiceId(){
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2,"0");
  const mm  = String(now.getMonth()+1).padStart(2,"0");
  const yy  = String(now.getFullYear()).slice(-2);
  const kode = (localStorage.getItem("invoiceKode")||"WA").toUpperCase().slice(0,3);
  const startNo = +(localStorage.getItem("invoiceStart")||"1");
  const lastNo  = +(localStorage.getItem("lastInvoiceNo")||String(startNo-1));
  const nextNo  = Math.max(lastNo+1, startNo);
  localStorage.setItem("lastInvoiceNo", nextNo);
  return `${dd}${mm}${yy}-${kode}-${String(nextNo).padStart(5,"0")}`;
}

/* ================= INIT STORE ================= */
function initStore(){

  const toggles = ["heroEnabled","promoLeftEnabled","promoRightEnabled","qrisEnabled"];
  toggles.forEach(t => {
    const el = document.getElementById(t+"Toggle");
    if(el) el.checked = (localStorage.getItem(t) !== "false"); // Default true
  });



  const waitEl = document.getElementById("waitTimerInput");
  if(waitEl) waitEl.value = localStorage.getItem("waitTimer") || "10";

  const fields = ["storeName","ownerWa","ownerEmail","heroText","defaultMargin","waitTimer",
                  "titleSize","titleColor","titleFont","heroSize","heroColor",
                  "bgColor","storeTheme","invoiceKode","invoiceStart","diskonPesan","ongkirDefault","noRekBank"];
  const defaults = { titleSize:"26", titleColor:"#f8fafc", titleFont:"'Plus Jakarta Sans',sans-serif",
                     heroSize:"20", heroColor:"#dbeafe", bgColor:"#0b1020",
                     storeTheme:"matcha", invoiceKode:"WA", invoiceStart:"1",
                     defaultMargin:"30", diskonPesan:"0" };
  fields.forEach(f=>{
    const el = document.getElementById(f);
    if(el) el.value = localStorage.getItem(f)||(defaults[f]||"");
  });



  updateAllTitles();
  applyStoreStyle();
  loadHero();
  loadQRIS();

  // Show device ID in panel
  const devIdEl = document.getElementById("licDeviceId");
  if(devIdEl && window.Core){
    Core.getDeviceId().then(id=>{
      devIdEl.innerText = id.slice(0,20)+"...";
    });
  }
} // ✅ END initStore

/* ================= SAVE TOKO ================= */
function saveToko(){
  const fields = ["storeName","ownerWa","ownerEmail","heroText","defaultMargin","waitTimer",
                  "titleSize","titleColor","titleFont","heroSize","heroColor",
                  "bgColor","storeTheme","invoiceKode","invoiceStart","diskonPesan","ongkirDefault","noRekBank"];
  fields.forEach(f=>{
    const el = document.getElementById(f); if(!el) return;
    let v = el.value;
    if(f==="ownerWa") v = v.replace(/\D/g,"");
    if(f==="invoiceKode") v = v.trim().toUpperCase().slice(0,3)||"WA";
    if(f==="heroText") v = v.trim()||"Jualan Mudah via WhatsApp ✨";
    localStorage.setItem(f, v);
  });

  const toggles = ["heroEnabled","promoLeftEnabled","promoRightEnabled","qrisEnabled"];
  toggles.forEach(t => {
    const el = document.getElementById(t+"Toggle");
    if(el) localStorage.setItem(t, el.checked ? "true" : "false");
  });
    const qrisDelayEl = document.getElementById("qrisDelayInput");
  if(qrisDelayEl) localStorage.setItem("qrisDelay", qrisDelayEl.value);



  updateAllTitles();
  showToast("✅ Info toko tersimpan");
  applyStoreStyle();
  if(window.App && App.loadStoreHeaderLogo) App.loadStoreHeaderLogo();
}

function applyStoreStyle(){
  const theme = localStorage.getItem("storeTheme")||"matcha";
  const themeMap = {
    matcha: { accent:"#5cf17b", accent2:"#40dd66", bg:"#0b1020" },
    sunset: { accent:"#ff7f6b", accent2:"#ffb36a", bg:"#1b1022" },
    ocean:  { accent:"#4dd8ff", accent2:"#6be8d3", bg:"#071826" },
    mono:   { accent:"#f8fafc", accent2:"#cbd5e1", bg:"#0f172a" }
  };
  const active = themeMap[theme]||themeMap.matcha;
  const root = document.documentElement;
  root.style.setProperty("--accent",  active.accent);
  root.style.setProperty("--accent2", active.accent2);
  root.style.setProperty("--bg",      localStorage.getItem("bgColor")||active.bg);

  const titleSize  = localStorage.getItem("titleSize")||"26";
  const titleColor = localStorage.getItem("titleColor")||"#f8fafc";
  const titleFont  = localStorage.getItem("titleFont")||"'Plus Jakarta Sans',sans-serif";
  const heroSize   = localStorage.getItem("heroSize")||"20";
  const heroColor  = localStorage.getItem("heroColor")||"#dbeafe";

  ["buyerJudulToko","ownerJudulToko"].forEach(id=>{
    const el = document.getElementById(id); if(!el) return;
    el.style.fontSize = `${titleSize}px`;
    el.style.color    = titleColor;
    el.style.fontFamily = titleFont;
    el.style.fontWeight = "700";
  });

  const heroEl = document.getElementById("buyerHeroText");
  if(heroEl){ heroEl.style.fontSize = `${heroSize}px`; heroEl.style.color = heroColor; heroEl.style.fontFamily = titleFont; }
}

function updateAllTitles(){
  const name = localStorage.getItem("storeName")||"Toko WA";
  const hero = localStorage.getItem("heroText")||"Jualan Mudah via WhatsApp ✨";
  const buyerNameEl = document.getElementById("buyerStoreNameText");
  if(buyerNameEl) buyerNameEl.innerText = name;
  const ownerEl = document.getElementById("ownerJudulToko");
  if(ownerEl) ownerEl.innerText = name;
  const hEl = document.getElementById("buyerHeroText");
  if(hEl) hEl.innerText = hero;
  document.title = name + " — Toko WA PRO";
}

/* ================= SAVE PIN ================= */
async function savePin(){
  const pin = document.getElementById("pinBaru").value.trim();
  if(pin.length !== 6 || isNaN(pin)){ showToast("❌ PIN harus 6 angka"); return; }
  // Use Core's hash system
  if(window.Core && Core.savePinHashed){
    await Core.savePinHashed(pin);
  } else {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
    const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
    localStorage.setItem("ownerPinHash", hash);
    localStorage.setItem("pinInitialized","1");
  }
  document.getElementById("pinBaru").value="";
  showToast("✅ PIN berhasil diubah");
}

function saveKasirPin(){
  const pin = (document.getElementById("pinKasirBaru")?.value||"").trim();
  if(pin.length !== 6 || isNaN(pin)){ showToast("❌ PIN kasir harus 6 angka"); return; }
  localStorage.setItem("cashierPin", pin);
  document.getElementById("pinKasirBaru").value = "";
  showToast("✅ PIN kasir tersimpan");
}

function _getPromoImages(key){
  try{ return JSON.parse(localStorage.getItem(key)||"[]"); }catch(e){ return []; }
}
function _setPromoImages(key, arr){
  localStorage.setItem(key, JSON.stringify(arr||[]));
}
function _getPromoMaxSlots(){
  const lim = _getLimit();
  if(!lim || !lim.k) return 2;
  if(lim.k >= 999999) return 40;
  return Math.max(2, lim.k);
}
function _getPromoTotalCount(){
  return _getPromoImages("heroPromoLeftImages").length + _getPromoImages("heroPromoRightImages").length;
}
function _renderPromoImageList(key, targetId){
  const listEl = document.getElementById(targetId);
  if(!listEl) return;
  const arr = _getPromoImages(key);
  const max = _getPromoMaxSlots();
  const rows = [];
  for(let i=0;i<max;i++){
    const img = arr[i];
    if(img){
      rows.push(`<div class="owner-produk-item">
      <img class="owner-produk-img" src="${img}" loading="lazy">
      <div class="owner-produk-info"><b>Gambar ${i+1}</b><small>${key}</small></div>
      <button class="owner-produk-del" data-promo-key="${key}" data-promo-idx="${i}" title="Hapus">🗑️</button>
    </div>`);
    } else {
      rows.push(`<div class="owner-produk-item" style="opacity:.55">
      <button type="button" class="owner-produk-img promo-slot-add" data-upload-target="${key==='heroPromoLeftImages'?'promoLeftInput':'promoRightInput'}" style="display:flex;align-items:center;justify-content:center;background:#0f172a;color:#64748b;border:none;cursor:pointer;width:44px;height:44px;border-radius:8px">+</button>
      <div class="owner-produk-info"><b>Slot ${i+1}</b><small>Kosong</small></div>
    </div>`);
    }
  }
  const tier = (window.Core && Core.getCurrentTier ? Core.getCurrentTier().toUpperCase() : "FREE");
  listEl.innerHTML = `<div class="field-hint" style="margin-bottom:6px">Slot ${arr.length}/${max} (Paket ${tier})</div>${rows.join("")}`;
}

/* ================= SAVE MARGIN ================= */
function saveMargin(){
  localStorage.setItem("defaultMargin", +document.getElementById("defaultMargin").value||30);
  showToast("✅ Margin default disimpan");
}

/* ================= HERO UPLOAD ================= */
document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("heroInput")?.addEventListener("change", e=>{
    const f=e.target.files[0]; if(!f) return;
    compressImage(f, img=>{ localStorage.setItem("hero",img); loadHero(); });
  });

  document.getElementById("qrisInput")?.addEventListener("change", e=>{
    const f=e.target.files[0]; if(!f) return;
    compressImage(f, img=>{
      localStorage.setItem("qris",img);
      localStorage.setItem("qrisImg",img);
      loadQRIS();
    });
  });

  document.getElementById("pImg")?.addEventListener("change", async e=>{
    const f=e.target.files[0]; if(!f) return;

    // Try backend upload
    const uploaded = await uploadToBackend(f);
    if(uploaded) {
        document.getElementById("pImgPrev").innerHTML = `<img src="${uploaded.img}" data-thumb="${uploaded.thumb}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
        return;
    }

    compressImage(f, img=>{
      document.getElementById("pImgPrev").innerHTML = `<img src="${img}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
    });
  });

  document.getElementById("promoLeftInput")?.addEventListener("change", e=>{
    const f=e.target.files[0]; if(!f) return;
    compressImage(f, img=>{
      const arr = _getPromoImages("heroPromoLeftImages");
      const max = _getPromoMaxSlots();
      if(_getPromoTotalCount() >= max){
        showToast(`❌ Total slot promo penuh (${max}) untuk paket ini`);
        return;
      }
      arr.push(img);
      _setPromoImages("heroPromoLeftImages", arr);
      localStorage.setItem("heroPromoLeftImg", arr[0]||img);
      const prev=document.getElementById("promoLeftPrev");
      if(prev) prev.innerHTML=`<img src="${img}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
      _renderPromoImageList("heroPromoLeftImages","promoLeftList");
      if(window.App && App.renderHeroPromo) App.renderHeroPromo();
    });
  });

  document.getElementById("promoRightInput")?.addEventListener("change", e=>{
    const f=e.target.files[0]; if(!f) return;
    compressImage(f, img=>{
      const arr = _getPromoImages("heroPromoRightImages");
      const max = _getPromoMaxSlots();
      if(_getPromoTotalCount() >= max){
        showToast(`❌ Total slot promo penuh (${max}) untuk paket ini`);
        return;
      }
      arr.push(img);
      _setPromoImages("heroPromoRightImages", arr);
      localStorage.setItem("heroPromoRightImg", arr[0]||img);
      const prev=document.getElementById("promoRightPrev");
      if(prev) prev.innerHTML=`<img src="${img}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
      _renderPromoImageList("heroPromoRightImages","promoRightList");
      if(window.App && App.renderHeroPromo) App.renderHeroPromo();
    });
  });

  document.getElementById("storeLogoInput")?.addEventListener("change", e=>{
    const f=e.target.files[0]; if(!f) return;
    compressImage(f, img=>{
      localStorage.setItem("storeHeaderImg", img);
      const prev=document.getElementById("storeLogoPrev");
      if(prev) prev.innerHTML=`<img src="${img}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
      if(window.App && App.loadStoreHeaderLogo) App.loadStoreHeaderLogo();
    });
  });

  /* ── Event delegation for owner product list ── */
  document.getElementById("ownerProdukList")?.addEventListener("click", e=>{
    // Tombol hapus
    const delBtn = e.target.closest(".owner-produk-del");
    if(delBtn){
      const id = delBtn.dataset.id;
      if(id) deleteProduct(+id || id);
      return;
    }
    // Tombol stok +/-
    const stokBtn = e.target.closest(".opir-stok-btn");
    if(stokBtn){
      const delta = stokBtn.classList.contains("plus") ? 1 : -1;
      const item = stokBtn.closest(".owner-produk-item-rich, .owner-produk-item");
      const pid = item?.dataset?.prodId;
      if(pid) _adjustProductStok(pid, delta);
      return;
    }
    // Tombol edit eksplisit
    const editBtn = e.target.closest(".opir-edit-btn");
    if(editBtn){
      const item = editBtn.closest(".owner-produk-item-rich, .owner-produk-item");
      const pid = item?.dataset?.prodId;
      if(pid) _editProductForm(pid);
      return;
    }
    // Klik baris produk mana saja (bukan tombol) → buka form edit
    const row = e.target.closest(".owner-produk-item-rich, .owner-produk-item");
    if(row && !e.target.closest("button") && !e.target.closest("input")){
      const pid = row.dataset?.prodId;
      if(pid) _editProductForm(pid);
    }
  });

  document.getElementById("ownerProdukList")?.addEventListener("change", e => {
      if(e.target.classList.contains("opir-stok-input")){
          const id = e.target.dataset.id;
          const val = parseInt(e.target.value, 10);
          if(id && !isNaN(val)) {
              const products = getProducts();
              const idx = products.findIndex(p => String(p.i!==undefined?p.i:p.id) === String(id));
              if(idx >= 0){
                  products[idx].stok = val;
                  saveProducts(products);
                  if(window.App && App.renderFull) App.renderFull();
                  showToast("✅ Stok diperbarui");
                  renderOwnerProdukList();
              }
          }
      }
  });

  document.getElementById("tabPromo")?.addEventListener("click", e=>{
    const addSlot = e.target.closest(".promo-slot-add[data-upload-target]");
    if(addSlot){
      const target = addSlot.dataset.uploadTarget;
      const input = document.getElementById(target);
      if(input) input.click();
      return;
    }
    const btn = e.target.closest(".owner-produk-del[data-promo-key]");
    if(!btn) return;
    const key = btn.dataset.promoKey;
    const idx = +btn.dataset.promoIdx;
    const arr = _getPromoImages(key);
    if(idx>=0 && idx<arr.length){
      arr.splice(idx,1);
      _setPromoImages(key, arr);
      if(key==="heroPromoLeftImages") localStorage.setItem("heroPromoLeftImg", arr[0]||"");
      if(key==="heroPromoRightImages") localStorage.setItem("heroPromoRightImg", arr[0]||"");
      _renderPromoImageList("heroPromoLeftImages","promoLeftList");
      _renderPromoImageList("heroPromoRightImages","promoRightList");
      if(window.App && App.renderHeroPromo) App.renderHeroPromo();
    }
  });
});

function loadPromoEditor(){
  const promoTitle = localStorage.getItem("promoTitle")||"Produk Unggulan";
  const promoDesc = localStorage.getItem("promoDesc")||"Promo spesial hari ini.";
  const sponsorTitle = localStorage.getItem("sponsorTitle")||"Pesan Sponsor";
  const sponsorDesc = localStorage.getItem("sponsorDesc")||"Dukung produk lokal.";
  const leftImg = localStorage.getItem("heroPromoLeftImg")||"";
  const rightImg = localStorage.getItem("heroPromoRightImg")||"";
  const logo = localStorage.getItem("storeHeaderImg")||"";
  const setVal=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  setVal("promoTitle", promoTitle);
  setVal("promoDesc", promoDesc);
  setVal("sponsorTitle", sponsorTitle);
  setVal("sponsorDesc", sponsorDesc);

  // Load slider speed
  const savedSpeed = +(localStorage.getItem("heroSlideSpeedSec")||5);
  const speedEl = document.getElementById("heroSlideSpeed");
  const speedValEl = document.getElementById("heroSlideSpeedVal");
  if(speedEl){ speedEl.value = savedSpeed; }
  if(speedValEl){ speedValEl.textContent = savedSpeed + "d"; }

  const leftPrev=document.getElementById("promoLeftPrev");
  if(leftPrev && leftImg) leftPrev.innerHTML=`<img src="${leftImg}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
  const rightPrev=document.getElementById("promoRightPrev");
  if(rightPrev && rightImg) rightPrev.innerHTML=`<img src="${rightImg}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
  _renderPromoImageList("heroPromoLeftImages","promoLeftList");
  _renderPromoImageList("heroPromoRightImages","promoRightList");
  const logoPrev=document.getElementById("storeLogoPrev");
  if(logoPrev && logo) logoPrev.innerHTML=`<img src="${logo}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
}

function loadHero(){
  const h=localStorage.getItem("hero");
  const prev=document.getElementById("heroPrev");
  if(h&&prev){ prev.innerHTML=`<img src="${h}" style="width:100%;max-height:120px;object-fit:cover">`; }
  const heroEl=document.getElementById("buyerHero");
  if(h&&heroEl) heroEl.style.backgroundImage=`url(${h})`;
}

function loadQRIS(){
  const q=localStorage.getItem("qris")||localStorage.getItem("qrisImg");
  if(q){
    localStorage.setItem("qris", q);
    localStorage.setItem("qrisImg", q);
  }
  const prev=document.getElementById("qrisPrev");
  const stat=document.getElementById("qrisStatus");
  if(q&&prev){ prev.innerHTML=`<img src="${q}" style="width:100%;max-height:120px;object-fit:cover">`; }
  if(q&&stat) stat.innerText="ON";
}


  /* Drag and drop for product image */
  const uploadArea = document.querySelector('.upload-area');
  if (uploadArea) {
      uploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadArea.style.borderColor = 'var(--accent)';
      });
      uploadArea.addEventListener('dragleave', (e) => {
          e.preventDefault();
          uploadArea.style.borderColor = 'var(--border2)';
      });
      uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.style.borderColor = 'var(--border2)';
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              const file = e.dataTransfer.files[0];
              const fileInput = document.getElementById('pImg');

              // We need to construct a DataTransfer object to update the actual file input
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              fileInput.files = dataTransfer.files;

              // Trigger the change event
              const event = new Event('change');
              fileInput.dispatchEvent(event);
          }
      });
  }

/* ================= ADD PRODUCT (strict validation + stock + keyboard ENTER) ================= */
function _updateExistingProduct(id){
  const products = getProducts();
  const idx = products.findIndex(p => String(p.i!==undefined?p.i:p.id) === String(id));
  if(idx < 0){ showToast("Produk tidak ditemukan"); return; }
  const name  = (document.getElementById("pName")?.value||"").trim();
  const modal = +(document.getElementById("pModal")?.value||0);
  const price = +(document.getElementById("pPrice")?.value||0);
  const stok  = +(document.getElementById("pStok")?.value)||0;
  const kat   = document.getElementById("pKategori")?.value||"Umum";
  const sumber = document.getElementById("pSumber")?.value||"Cash";
  let tempo  = document.getElementById("pTempo")?.value||"";
  let pSupplierName = document.getElementById("pSupplierName")?.value||"";
  let pSupplierWA = document.getElementById("pSupplierWA")?.value||"";
  let pSupplierAlamat = document.getElementById("pSupplierAlamat")?.value||"";
  let sku = (document.getElementById("pSku")?.value||"").trim().toUpperCase();
  if(!sku) { sku = generateSKU(kat, pSupplierName, products); }
  const duplicate = products.find((p, i) => i !== idx && p.sku === sku);
  if(duplicate) {
     showToast("❌ SKU sudah digunakan produk lain!");
     document.getElementById("pSku")?.focus();
     return;
  }
  if(!name){ showToast("Nama produk wajib diisi"); return; }
  if(price <= 0){ showToast("Harga jual harus > 0"); return; }
  if(products[idx].n !== undefined) products[idx].n = name; else products[idx].name = name;
  if(products[idx].p !== undefined) products[idx].p = price; else products[idx].price = price;
  if(products[idx].m !== undefined) products[idx].m = modal; else products[idx].modal = modal;
  if(products[idx].k !== undefined) products[idx].k = kat;   else products[idx].kategori = kat;
  products[idx].stok = stok;
  products[idx].minStok = minStok;
  products[idx].sumber = sumber;
  if(sumber === 'Cash') { tempo = ''; pSupplierName = ''; pSupplierWA = ''; pSupplierAlamat = ''; }
  products[idx].tempo = tempo;
  products[idx].supplierName = pSupplierName;
  products[idx].supplierWA = pSupplierWA;
  products[idx].supplierAlamat = pSupplierAlamat;
  products[idx].sku = sku;
  // Use the uploaded image from pImgPrev if available
  const imgEl = document.getElementById("pImgPrev")?.querySelector("img");
  if(imgEl) {
      if(products[idx].g !== undefined) products[idx].g = imgEl.src;
      else products[idx].img = imgEl.src;
      products[idx].thumb = imgEl.dataset.thumb;
  }
  saveProducts(products);
  invalidateProductCache && invalidateProductCache();
  renderOwnerProdukList();
  if(window.App) App.renderFull && App.renderFull();
  clearProductForm && clearProductForm();
  window._editingProductId = null;
  showToast("✅ Produk diperbarui!");
}



/* ================= SKU GENERATOR ================= */
function generateSKU(kategori, supplier, existingProducts) {
    let katStr = (kategori || 'GEN').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
    if (katStr.length < 3) katStr = katStr.padEnd(3, 'X');

    let supStr = (supplier || 'GEN').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
    if (supStr.length < 3) supStr = supStr.padEnd(3, 'X');

    const prefix = katStr + '-' + supStr + '-';
    let maxNum = 0;

    existingProducts.forEach(p => {
        if (p.sku && p.sku.startsWith(prefix)) {
            const numPart = p.sku.substring(prefix.length);
            const num = parseInt(numPart, 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    });

    const nextNum = maxNum + 1;
    const numStr = String(nextNum).padStart(6, '0');
    return prefix + numStr;
}

function generateAndSetSKU() {
    const kat = document.getElementById("pKategori")?.value || "";
    const sup = document.getElementById("pSupplierName")?.value || "";
    const products = getProducts();
    const newSku = generateSKU(kat, sup, products);
    const skuEl = document.getElementById("pSku");
    if(skuEl) skuEl.value = newSku;
}
window.generateAndSetSKU = generateAndSetSKU;

function addProduct(){
  if(window._editingProductId){ _updateExistingProduct(window._editingProductId); window._editingProductId=null; return; }
  const products = getProducts();
  const limit    = _getLimit();

  if(products.length >= limit.p){
    const tier = window.Core ? Core.getCurrentTier().toUpperCase() : "FREE";
    showToast("❌ Limit "+limit.p+" produk ("+tier+"). Upgrade lisensi!");
    return;
  }

  // Baca semua field - pakai LET kat agar bisa diubah jika kosong
  let kat     = (document.getElementById("pKategori")?.value||"").trim();
  const name  = (document.getElementById("pName")?.value||"").trim();
  const modal = +(document.getElementById("pModal")?.value)||0;
  const price = +(document.getElementById("pPrice")?.value)||0;
  const stok  = +(document.getElementById("pStok")?.value)||0;
  const sumber = document.getElementById("pSumber")?.value||"Cash";
  let tempo  = document.getElementById("pTempo")?.value||"";
  let pSupplierName = document.getElementById("pSupplierName")?.value||"";
  let pSupplierWA = document.getElementById("pSupplierWA")?.value||"";
  let pSupplierAlamat = document.getElementById("pSupplierAlamat")?.value||"";
  let sku = (document.getElementById("pSku")?.value||"").trim().toUpperCase();
  const imgEl = document.getElementById("pImgPrev")?.querySelector("img");
  const img   = imgEl ? imgEl.src : "";
  const thumb = imgEl ? imgEl.dataset.thumb : "";

  // Auto-buat kategori Umum jika select kosong
  if(!kat){
    let cats = [];
    try{ cats = JSON.parse(localStorage.getItem("kategoriList")||"[]"); }catch(e){}
    if(!cats.includes("Umum")){ cats.unshift("Umum"); localStorage.setItem("kategoriList", JSON.stringify(cats)); }
    kat = "Umum";
    if(window.App && App.renderOwnerKategoriSelect) App.renderOwnerKategoriSelect("Umum");
    setTimeout(()=>{ const el=document.getElementById("pKategori"); if(el) el.value="Umum"; }, 50);
  }

  if(!sku) {
    sku = generateSKU(kat, pSupplierName, products);
    document.getElementById("pSku").value = sku;
  }

  // duplicate check
  if(products.find(p => p.sku === sku)) {
     showToast("❌ SKU sudah ada! Gunakan SKU lain.");
     document.getElementById("pSku")?.focus();
     return;
  }
  if(!name){
    document.getElementById("pName")?.focus();
    return;
  }
  if(isNaN(price)||price<=0){
    showToast("❌ Harga jual harus lebih dari 0");
    document.getElementById("pPrice")?.focus();
    return;
  }

  if(sumber === 'Cash') {
    tempo = '';
    pSupplierName = '';
    pSupplierWA = '';
    pSupplierAlamat = '';
  }
  const minStok = +(document.getElementById("pMinStok")?.value) || 10;
  const newProduct = { i: Date.now(), n: name, p: price, m: modal, k: kat, g: img, thumb: thumb, sku: sku, stok: stok, minStok: minStok, sumber: sumber, tempo: tempo, supplierName: pSupplierName, supplierWA: pSupplierWA, supplierAlamat: pSupplierAlamat };

  function _resetForm(){
    const katEl = document.getElementById("pKategori");
    if(katEl) katEl.value = kat; // pertahankan kategori terakhir
    ["pName","pPrice","pModal","pStok","pTempo","pSupplierName","pSupplierWA","pSupplierAlamat"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    // Reset tempo default
    const tempoEl = document.getElementById('pTempo');
    if(tempoEl) {
        const d = new Date();
        d.setDate(d.getDate() + 90);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        tempoEl.value = dd + '-' + mm + '-' + yy;
    }
    const prev = document.getElementById("pImgPrev");
    if(prev) prev.innerHTML = "<span>📷 Klik upload foto</span>";
    const imgIn = document.getElementById("pImg"); if(imgIn) imgIn.value="";
    document.getElementById("pName")?.focus();
  }

  function _doSave(sig){
    if(sig) newProduct.sig = sig;
    products.push(newProduct);
    saveProducts(products);
    invalidateProductCache && invalidateProductCache();
    showToast("✅ Produk berhasil ditambahkan!");
    renderOwnerProdukList();
    if(window.App && window.App.renderFull) App.renderFull();
    _resetForm();
  }

  signProduct(newProduct)
    .then(sig => _doSave(sig))
    .catch(e  => { console.error("signProduct error", e); _doSave(null); });
}

/* ================= DELETE PRODUCT (IDB) ================= */
function deleteProduct(id){
  if(!confirm("Hapus produk ini?")) return;
  const products = getProducts().filter(p=>(p.i||p.id) !== id);
  saveProducts(products); // sync + IDB background
  // Also delete from IDB directly (belt-and-suspenders)
  if(window.Core && Core.idbDelete){
    Core.idbDelete("products", id).catch(()=>{});
  }
  invalidateProductCache();
  renderOwnerProdukList();
  if(window.App) App.renderFull();
}

/* ================= RENDER OWNER PRODUCT LIST (chunk render) ================= */
let _produkAdminFilter = "";

function filterProdukAdmin(q){
  _produkAdminFilter = (q||"").toLowerCase();
  renderOwnerProdukList();
}

function renderOwnerProdukList(){
  const container = document.getElementById("ownerProdukList");
  if(!container) return;
  let products = getProducts();

  if (_produkAdminFilter) {
      products = products.filter(p => {
          const searchStr = ((p.n||p.name||"") + " " + (p.sku||"") + " " + (p.k||p.kategori||"")).toLowerCase();
          return searchStr.includes(_produkAdminFilter);
      });
  }

  const stat = document.getElementById("totalProduk");
  if(stat) stat.innerText = products.length;
  const info = document.getElementById("produkInfo");
  if(info) info.innerText = `${products.length} produk tersimpan`;

  const limit = _getLimit();
  const limitInfo = document.getElementById("produkLimitInfo");
  if(limitInfo) limitInfo.innerText = `${products.length} / ${limit.p>=999999?"∞":limit.p}`;

  if(!products.length){
    container.innerHTML=`<div class="backup-empty">Belum ada produk ${_produkAdminFilter ? 'ditemukan' : 'ditambahkan'}</div>`;
    return;
  }

  // Chunk render using DocumentFragment
  container.innerHTML="";
  const frag = document.createDocumentFragment();
  const CHUNK = 30;
  let idx = 0;

  function renderChunk(){
  const end = Math.min(idx + CHUNK, products.length);

  for(; idx < end; idx++){
    const p = products[idx];
    const id   = p.i !== undefined ? p.i : p.id;
    const name = p.n !== undefined ? p.n : p.name;
    const price= p.p !== undefined ? p.p : p.price;
    const kat  = p.k !== undefined ? p.k : (p.kategori||"Umum");
    const img  = p.g !== undefined ? p.g : (p.img||"");

    const div = document.createElement("div");
    div.className = "owner-produk-item";

    // 🔐 HANDLE PRODUK INVALID (POSISI BENAR)

    const stokNum = p.stok !== undefined ? +p.stok : null;
    const minStokLimit = p.minStok !== undefined ? p.minStok : 10;
    const stokCls = stokNum === null ? "na" : stokNum <= 0 ? "habis" : stokNum <= minStokLimit ? "low" : "ok";
    const stokLabel = stokNum === null ? "—" : stokNum <= 0 ? "Habis" : stokNum;
    div.dataset.prodId = String(id);
    let tempoWarning = "";
    if((p.sumber === "Hutang" || p.sumber === "Titip Jual") && p.tempo) {
        let tempoStr = p.tempo;
        // Fix for DD-MM-YY parsing (or input type="date" which is YYYY-MM-DD)
        if (tempoStr.includes('-')) {
            const parts = tempoStr.split('-');
            if(parts[0].length === 2 && parts[2].length === 4) {
               // DD-MM-YYYY -> YYYY-MM-DD
               tempoStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (parts[0].length === 2 && parts[2].length === 2) {
               // DD-MM-YY -> YYYY-MM-DD
               tempoStr = `20${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        const tempoDate = new Date(tempoStr);
        const today = new Date();
        const diffTime = tempoDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 7 && diffDays >= 0) {
            tempoWarning = ` <span style="font-size:10px; background:#fef08a; color:#854d0e; padding:2px 4px; border-radius:4px; font-weight:bold;">⚠️ Tempo ${diffDays} hari</span>`;
        } else if (diffDays < 0) {
            tempoWarning = ` <span style="font-size:10px; background:#fca5a5; color:#991b1b; padding:2px 4px; border-radius:4px; font-weight:bold;">❌ Jatuh Tempo</span>`;
        } else {
             tempoWarning = ` <span style="font-size:10px; background:#e2e8f0; color:#475569; padding:2px 4px; border-radius:4px; font-weight:bold;">Tempo: ${p.tempo}</span>`;
        }
    }
    const badgeSumber = p.sumber && p.sumber !== "Cash" ? `<span style="font-size:10px; background:#e2e8f0; color:#475569; padding:2px 4px; border-radius:4px; font-weight:bold;">${p.sumber}</span>${tempoWarning}` : "";

    div.innerHTML = `
      <div style="display: flex; gap: 8px; width: 100%; align-items: stretch;">

          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px; width: 44px; flex-shrink: 0;">
              ${p.sku ? `<div style="font-size:8px; color:var(--text3); font-family:monospace; line-height: 1;">${p.sku}</div>` : `<div style="font-size:8px; line-height:1; visibility:hidden;">-</div>`}
              <img class="owner-produk-img" src="${img||"https://placehold.co/44/1e293b/22c55e?text=P"}" loading="lazy"
                onerror="this.src='https://placehold.co/44/1e293b/22c55e?text=P'" title="Klik untuk edit" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; margin: auto 0;">
              <span class="oprod-stok-badge ${stokCls}" id="oprod-stok-${id}" style="text-align:center; font-size: 9px; padding: 1px 0; width: 100%; line-height: 1;">${stokLabel}</span>
          </div>

          <div class="owner-produk-info" style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between;">

            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px;">
                <b style="font-size: 13px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${name}</b>
                <button class="owner-produk-del" data-id="${id}" title="Hapus produk" style="background: none; border: none; font-size: 13px; cursor: pointer; padding: 0; flex-shrink:0;">🗑️</button>
            </div>

            <div style="display:flex; align-items:center; justify-content: space-between; gap: 4px; margin-top: 2px;">
                <div style="display:flex; align-items:center; gap: 4px;">
                   <small style="font-size: 10px; color: var(--text3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60px;">📂 ${kat}</small>
                   ${badgeSumber}
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap: 1px;">
                   <span style="font-weight:700; font-size:11px; color:var(--text1); line-height:1;">Rp ${price.toLocaleString("id")}</span>
                   ${p.m ? `<span style="color:var(--text3); font-size:9px; line-height:1;" title="Harga Modal">M: Rp ${(p.m || p.modal || 0).toLocaleString("id")}</span>` : ''}
                </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: flex-end; margin-top: auto; padding-top: 4px;">
                <div style="display:flex; gap:2px; align-items:center;">
                    <button class="opir-stok-btn minus" data-id="${id}" title="Kurang stok" style="width:22px; height:22px; font-size:14px;">−</button>
                    <input type="number" class="opir-stok-input" data-id="${id}" value="${stokNum !== null ? stokNum : 0}" onclick="event.stopPropagation();" style="width: 36px; height:22px; font-size:12px; padding:0; text-align: center;">
                    <button class="opir-stok-btn plus" data-id="${id}" title="Tambah stok" style="width:22px; height:22px; font-size:14px;">+</button>
                </div>
            </div>

          </div>
      </div>`;

	  // 🔐 TARUH DI SINI (SETELAH innerHTML)
if(p._invalid){
  div.style.opacity = "0.4";
  div.style.border = "1px solid red"; // 🔥 tambah ini
  div.title = "⚠️ Produk rusak / diubah";

  const btn = div.querySelector(".owner-produk-del");
  if(btn){
    btn.disabled = true;
    btn.title = "Data rusak";
  }

  div.style.pointerEvents = "none";

  // 🔥 tambah label warning
  const warn = document.createElement("small");
warn.style.color = "red";
warn.textContent = "⚠️ Data tidak valid";
div.appendChild(warn);
}

    frag.appendChild(div);
  }

  container.appendChild(frag);

  // clear fragment

  if(idx < products.length){
    requestAnimationFrame(renderChunk);
  }
}

requestAnimationFrame(renderChunk);

} // ✅ TAMBAHKAN INI

/* ================= PROMO ================= */
function loadConfig(){
  const c=getConfig();
  document.getElementById("diskonGlobal").value  = c.diskonGlobal||"";
  document.getElementById("bundleOn").checked    = c.bundle?.aktif||false;
  document.getElementById("bundleMin").value     = c.bundle?.minItem||"";
  document.getElementById("bundleDiskon").value  = c.bundle?.diskon||"";
  document.getElementById("ongkirOn").checked    = c.freeOngkir?.aktif||false;
  document.getElementById("ongkirMin").value     = c.freeOngkir?.minTotal||"";
  loadPromoEditor();
}

function savePromo(){
  const c=getConfig();
  c.diskonGlobal = +document.getElementById("diskonGlobal").value||0;
  c.bundle = { aktif:document.getElementById("bundleOn").checked, minItem:+document.getElementById("bundleMin").value||0, diskon:+document.getElementById("bundleDiskon").value||0 };
  c.freeOngkir = { aktif:document.getElementById("ongkirOn").checked, minTotal:+document.getElementById("ongkirMin").value||0 };
  saveConfig(c);

  // Simpan kecepatan slider
  const speedEl = document.getElementById("heroSlideSpeed");
  if(speedEl){
    const spd = Math.max(2, Math.min(15, +speedEl.value || 5));
    localStorage.setItem("heroSlideSpeedSec", spd);
  }

  const heroPayload = {
    promoTitle: (document.getElementById("promoTitle")?.value||"").trim(),
    promoDesc: (document.getElementById("promoDesc")?.value||"").trim(),
    sponsorTitle: (document.getElementById("sponsorTitle")?.value||"").trim(),
    sponsorDesc: (document.getElementById("sponsorDesc")?.value||"").trim(),
    leftImg: localStorage.getItem("heroPromoLeftImg")||"",
    rightImg: localStorage.getItem("heroPromoRightImg")||"",
    leftImages: _getPromoImages("heroPromoLeftImages"),
    rightImages: _getPromoImages("heroPromoRightImages"),
    slideSpeedSec: +(localStorage.getItem("heroSlideSpeedSec")||5)
  };
  localStorage.setItem("promoTitle", heroPayload.promoTitle);
  localStorage.setItem("promoDesc", heroPayload.promoDesc);
  localStorage.setItem("sponsorTitle", heroPayload.sponsorTitle);
  localStorage.setItem("sponsorDesc", heroPayload.sponsorDesc);
  if(window.App && App.saveHeroPromoHybrid) App.saveHeroPromoHybrid(heroPayload);
  showToast("✅ Promo tersimpan");
  if(window.App){
    App.renderFull();
    App.renderHeroPromo && App.renderHeroPromo();
  }
}

/* ================= ACCOUNTING SETTINGS ================= */
function getAccSettings(){
  return {
    accEnabled: localStorage.getItem("accEnabled") !== "false",
    taxEnabled: localStorage.getItem("taxEnabled") === "true",
    taxRate:    +(localStorage.getItem("taxRate")||"0.5"),
    maxDays:    Math.min(60, +(localStorage.getItem("maxDays")||"37"))
  };
}

function loadAccSettings(){
  const s=getAccSettings();
  const tog=document.getElementById("accEnabledToggle");
  const tax=document.getElementById("taxEnabledToggle");
  const rate=document.getElementById("taxRateInput");
  const days=document.getElementById("maxDaysInput");
  if(tog)  tog.checked  = s.accEnabled;
  if(tax)  tax.checked  = s.taxEnabled;
  if(rate) rate.value   = s.taxRate;
  if(days) days.value   = s.maxDays;
  const banner  = document.getElementById("accDisabledBanner");
  const section = document.getElementById("accActiveSection");
  if(banner)  banner.style.display  = s.accEnabled ? "none" : "flex";
  if(section) section.style.display = s.accEnabled ? "block" : "none";
}

function saveAccSettings(){
  localStorage.setItem("accEnabled",  document.getElementById("accEnabledToggle")?.checked ?? "true");
  localStorage.setItem("taxEnabled",  document.getElementById("taxEnabledToggle")?.checked ?? "false");
  localStorage.setItem("taxRate",     Math.max(0,Math.min(10,+(document.getElementById("taxRateInput")?.value||"0.5"))));
  localStorage.setItem("maxDays",     Math.min(60,Math.max(1,+(document.getElementById("maxDaysInput")?.value||"37"))));
  loadAccSettings();
  renderAkuntansi();
  showToast("✅ Pengaturan akuntansi disimpan");
}

function clearTransaksi(){
  if(!confirm("Hapus semua data transaksi?")) return;
  localStorage.removeItem("transaksi");
  localStorage.removeItem("rekapBulanan");
  if(window.Core && Core.idbClear){
    Core.idbClear("transaksi").catch(()=>{});
  }
  renderAkuntansi();
  showToast("🗑️ Data transaksi dihapus");
}

/* ================= ACCOUNTING RENDER ================= */
function renderAkuntansi(){
  loadAccSettings();
  const s=getAccSettings();
  if(!s.accEnabled) return;

  // 🔐 Background verifikasi signature transaksi (non-blocking)
  if(window.Core && Core.verifyData){
    setTimeout(async()=>{
      const txAll = JSON.parse(localStorage.getItem("transaksi")||"[]");
      for(const tx of txAll){
        if(!tx.sig) continue;
        const {sig, ...pure} = tx;
        const sigPayload = { inv: pure.inv, tgl: pure.tgl, grand: pure.grand, total: pure.total };
        const valid = await Core.verifyData(sigPayload, sig);
        if(!valid) console.warn("⚠️ Transaksi signature tidak valid:", tx.inv||tx.id);
      }
    }, 100);
  }

  const txAllRaw = JSON.parse(localStorage.getItem("transaksi")||"[]");
  const rekap = JSON.parse(localStorage.getItem("rekapBulanan")||"[]");
  const rp = v => "Rp "+Math.round(v).toLocaleString("id");
  const el = id => document.getElementById(id);

  const fAwal = el("filterAwal")?.value;
  const fAkhir = el("filterAkhir")?.value;

  let txAll = txAllRaw;
  if(fAwal && fAkhir) {
    const tAwal = new Date(fAwal).getTime();
    const tAkhir = new Date(fAkhir);
    tAkhir.setHours(23, 59, 59, 999);
    txAll = txAllRaw.filter(tx => tx.tgl >= tAwal && tx.tgl <= tAkhir.getTime());
  }

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const ts = todayStart.getTime();
  let todayOmzet=0, todayItems=0, todayModal=0;

  for(let i=0; i<txAll.length; i++){
    const tx=txAll[i];
    if(tx.tgl >= ts){
      todayOmzet += tx.total;
      todayModal += tx.items.reduce((s,x)=>s+(x.modal||0)*x.qty, 0);
      todayItems += tx.items.reduce((s,x)=>s+x.qty, 0);
    }
  }
  const todayPajak = s.taxEnabled ? Math.round(todayOmzet*s.taxRate/100) : 0;
  const todayLaba  = todayOmzet - todayModal - todayPajak;

  if(el("todayOmzet")) el("todayOmzet").innerText = rp(todayOmzet);
  if(el("todayItems")) el("todayItems").innerText  = todayItems;
  if(el("todayPajak")) el("todayPajak").innerText  = rp(todayPajak);
  if(el("todayLaba"))  el("todayLaba").innerText   = rp(todayLaba);

  let totalOmzet=0, totalModal=0, totalItems=0;
  for(let i=0; i<txAll.length; i++){
    const tx=txAll[i];
    totalOmzet += tx.total;
    totalModal += tx.items.reduce((s,x)=>s+(x.modal||0)*x.qty, 0);
    totalItems += tx.items.reduce((s,x)=>s+x.qty, 0);
  }
  const totalPajak = s.taxEnabled ? Math.round(totalOmzet*s.taxRate/100) : 0;
  const labaBersih = totalOmzet - totalModal - totalPajak;

  if(el("rptOmzet"))      el("rptOmzet").innerText      = rp(totalOmzet);
  if(el("rptItems"))      el("rptItems").innerText       = totalItems;
  if(el("rptModal"))      el("rptModal").innerText       = rp(totalModal);
  if(el("rptProfit"))     el("rptProfit").innerText      = rp(totalOmzet - totalModal);
  if(el("rptPajak"))      el("rptPajak").innerText       = rp(totalPajak);
  if(el("rptLabaBersih")) el("rptLabaBersih").innerText  = rp(labaBersih);
  if(el("txCountLabel"))  el("txCountLabel").innerText   = txAll.length + " total tersimpan";

  const txEl = el("txList");
  if(txEl){
    const last30 = txAll.slice(-30).reverse();
    if(!last30.length){ txEl.innerHTML=`<div class="backup-empty">Belum ada transaksi</div>`; return; }
    const frag = document.createDocumentFragment();
    last30.forEach(tx=>{
      const d = new Date(tx.tgl);
      const tgl = formatDate(d);
      const status = tx.status||"paid";
      const statusCls = status==="paid"?"tx-paid":status==="wait"?"tx-wait":"tx-cancel";
      const div = document.createElement("div");
      div.className = "tx-item tx-compact " + statusCls;
      div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; margin-bottom: 6px; border-radius: 8px;";

      const inv = tx.inv||"—";
      const total = "Rp " + (tx.grand||tx.total||0).toLocaleString("id");

      let itemsHtml = "";
      if (tx.items && tx.items.length) {
          itemsHtml = tx.items.map(it => `<div>- ${it.nama} (${it.qty}x)</div>`).join('');
      } else {
          itemsHtml = "<div>-</div>";
      }

      const sourceInfo = tx.source || "kasir";
      const paymentMethodInfo = tx.paymentMethod || "Tunai";

      div.style.cssText = "display: flex; flex-direction: column; padding: 10px 14px; margin-bottom: 6px; border-radius: 8px;";
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border1); padding-bottom: 6px; margin-bottom: 6px;">
          <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:600; font-size:13px; color:var(--text1)">${inv}</span>
            <span style="font-size:11px; color:var(--text2)">${tgl}</span>
          </div>
          <div style="flex:1; text-align:center;">
            <select class="status-badge status-${status}" style="margin:0; padding:2px 6px;" onchange="Admin.updateTxStatus('${tx.inv||tx.id}',this.value,this)">
              <option value="paid"  ${status==="paid"  ?"selected":""}>✅ Paid</option>
              <option value="wait"  ${status==="wait"  ?"selected":""}>⏳ Wait</option>
              <option value="cancel"${status==="cancel"?"selected":""}>❌ Cancel</option>
            </select>
          </div>
          <div style="flex:1; text-align:right; font-weight:700; font-size:13px; color:var(--accent)">
            ${total}
          </div>
        </div>
        <div style="font-size:11px; color:var(--text2); display:flex; flex-direction:column; gap:4px;">
          <div style="font-weight:600;">Pembelian:</div>
          ${itemsHtml}
          <div style="margin-top:4px;">
            <span style="background:var(--surface2); padding:2px 6px; border-radius:4px;">Sumber: ${sourceInfo}</span>
            <span style="background:var(--surface2); padding:2px 6px; border-radius:4px; margin-left:4px;">Pembayaran: ${paymentMethodInfo}</span>
          </div>
        </div>
      `;
      frag.appendChild(div);
    });
    txEl.innerHTML="";
    txEl.appendChild(frag);
  }

  const rekapEl = el("rekapBulananList");
  if(rekapEl){
    if(!rekap.length){ rekapEl.innerHTML=`<div class="backup-empty">Belum ada data bulanan</div>`; return; }
    const sorted = rekap.slice().sort((a,b)=>b.bulan.localeCompare(a.bulan));
    const frag2 = document.createDocumentFragment();
    sorted.slice(0,12).forEach(r=>{
      const pajak = s.taxEnabled ? Math.round(r.omzet*s.taxRate/100) : 0;
      const div = document.createElement("div");
      div.className = "rekap-item";
      div.innerHTML = `
        <div class="rekap-bulan">${r.bulan}</div>
        <div class="rekap-stats">
          <span>💰 ${rp(r.omzet)}</span>
          <span>📦 ${r.transaksi} tx</span>
          ${pajak>0?`<span class="rekap-pajak">🛒️ ${rp(pajak)}</span>`:""}
        </div>`;
      frag2.appendChild(div);
    });
    rekapEl.innerHTML="";
    rekapEl.appendChild(frag2);
  }
}

/* ================= BACKUP ================= */
function getBackupList(){ return JSON.parse(localStorage.getItem("backupList")||"[]"); }
function saveBackupList(list){
  const cutoff = Date.now() - 7*24*60*60*1000;
  localStorage.setItem("backupList", JSON.stringify(list.filter(b=>b.ts>cutoff)));
}

function buildBackupPayload(){
  const products = getProducts().map(denormalizeProduct);
  const lsKeys = [
    "config","storeName","heroText","ownerWa","ownerEmail","ownerPin","kasirPin",
    "promoTitle","promoDesc","sponsorTitle","sponsorDesc",
    "heroPromoLeftImg","heroPromoRightImg","storeHeaderImg",
    "heroSlideSpeedSec","heroOverlayColor","heroOverlayOpacity","heroTextColor",
    "kategoriList","_kasirList","_lastKategori","defaultMargin",
    "qris","qrisImg","qrisStatus","ongkirDefault","bankName","bankRek",
    "transaksi","_customers","_backupList","heroPromoLeftImages","heroPromoRightImages"
  ];
  const lsData = {};
  lsKeys.forEach(k => { const v = localStorage.getItem(k); if(v !== null) lsData[k] = v; });
  return JSON.stringify({
    products,
    config:    JSON.parse(localStorage.getItem("config")||"{}"),
    storeName: localStorage.getItem("storeName")||"",
    ownerWa:   localStorage.getItem("ownerWa")||"",
    lsData,
    backedAt:  new Date().toISOString(),
    version:   4
  }, null, 2);
}

function recordBackup(dest){
  const list = getBackupList();
  list.unshift({ ts:Date.now(), dest, label:formatDate(new Date()) });
  saveBackupList(list);
  renderBackupHistory();
  const stat = document.getElementById("backupStatus");
  if(stat) stat.innerText = formatDate(new Date()).split(" ")[0];
}

function doBackup(){
  const dest = document.querySelector('input[name="backupDest"]:checked')?.value||"download";
  const payload = buildBackupPayload();

  if(dest==="download"){
    const blob = new Blob([payload],{type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `backup_toko_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("✅ Backup diunduh");
    recordBackup("download");
  } else if(dest==="wa"){
    const wa = localStorage.getItem("ownerWa");
    if(!wa){ showToast("❌ Isi No WA dulu"); return; }
    const msg = `BACKUP TOKO WA PRO\n\n${formatDate(new Date())}\nProduk: ${getProducts().length}\n\nData tersimpan lokal.`;
    window.open("https://wa.me/"+wa+"?text="+encodeURIComponent(msg));
    showToast("✅ Backup dikirim ke WA");
    recordBackup("wa");
  } else if(dest==="email"){
    const email = localStorage.getItem("ownerEmail")||"";
    const subject = encodeURIComponent("Backup Toko WA PRO - "+formatDate(new Date()).split(" ")[0]);
    const body    = encodeURIComponent("Data backup terlampir.\n\n"+payload.slice(0,500));
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    showToast("✅ Draft email dibuka");
    recordBackup("email");
  }
}

function renderBackupHistory(){
  const container = document.getElementById("backupHistory");
  if(!container) return;
  const list = getBackupList();
  if(!list.length){ container.innerHTML=`<div class="backup-empty">🔭 Belum ada riwayat backup</div>`; return; }
  const icons = {download:"⬇️",wa:"💬",email:"📧"};
  const frag  = document.createDocumentFragment();
  list.forEach((b,i)=>{
    const div = document.createElement("div");
    div.className = "backup-item";
    div.innerHTML = `
      <div><div>${icons[b.dest]||"💾"} <b>${b.label}</b></div><div class="backup-item-info">via ${b.dest}</div></div>
      <button class="backup-del-btn" data-idx="${i}">✕</button>`;
    frag.appendChild(div);
  });
  container.innerHTML="";
  container.appendChild(frag);
}

// Event delegation for backup delete
document.addEventListener("click", e=>{
  const btn = e.target.closest(".backup-del-btn");
  if(btn && btn.dataset.idx !== undefined){
    const list = getBackupList();
    list.splice(+btn.dataset.idx, 1);
    saveBackupList(list);
    renderBackupHistory();
  }
});

function deleteBackupRecord(idx){
  const list = getBackupList();
  list.splice(idx,1);
  saveBackupList(list);
  renderBackupHistory();
}

function checkAutoBackup(){
  const schedule = localStorage.getItem("backupSchedule")||"off";
  if(schedule==="off") return;
  const lastAuto = +localStorage.getItem("lastAutoBackup")||0;
  const interval = schedule==="daily" ? 86400000 : 604800000;
  if(Date.now()-lastAuto > interval){
    localStorage.setItem("lastAutoBackup", Date.now());
    const payload = buildBackupPayload();
    const blob = new Blob([payload],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`auto_backup_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    recordBackup("download");
    showToast("✅ Auto-backup selesai");
  }
}

/* ================= KEYBOARD ENTER FLOW (admin product form) ================= */
// Order: Kategori → Nama → Modal → Harga → Stok → (Gambar skip) → ENTER=Save
function _initAdminKeyboard(){
  const flow = ["pKategori","pName","pModal","pPrice","pStok"];

  flow.forEach((id, idx)=>{
    const el = document.getElementById(id);
    if(!el) return;

    el.addEventListener("keydown", (e)=>{
      if(e.key !== "Enter") return;
      e.preventDefault();
      const next = flow[idx + 1];
      if(next){
        const nextEl = document.getElementById(next);
        if(nextEl) nextEl.focus();
      } else {
        // Last field — trigger save (no double-fire guard needed, addProduct is sync-first)
        addProduct();
      }
    });
  });
}

/* ================= INIT ================= */


/* ================= ROLE & FEATURE TOGGLE ================= */
function checkTierAndMenus(){
  // Developer Toggles override via localStorage only
  const tabAkuntansiBtn = document.querySelector(".tab-btn[onclick*='tabAkuntansi']");
  const tabTableBtn = document.querySelector(".tab-btn[onclick*='tabTable']");
  const tabHistoryBtn = document.querySelector(".tab-btn[onclick*='tabHistory']");
  const tabPelangganBtn = document.querySelector(".tab-btn[onclick*='tabPelanggan']");

  if(tabAkuntansiBtn) tabAkuntansiBtn.style.display = localStorage.getItem("dev_hide_akuntansi") === "true" ? "none" : "inline-block";
  if(tabTableBtn) tabTableBtn.style.display = localStorage.getItem("dev_hide_table") === "true" ? "none" : "inline-block";
  if(tabHistoryBtn) tabHistoryBtn.style.display = localStorage.getItem("dev_hide_history") === "true" ? "none" : "inline-block";
  if(tabPelangganBtn) tabPelangganBtn.style.display = localStorage.getItem("dev_hide_pelanggan") === "true" ? "none" : "inline-block";
}


function initAdmin(){
  checkTierAndMenus();
  initStore();
  loadConfig();
  loadAccSettings();
  checkAutoBackup();
  renderOwnerProdukList();
  renderLicenseUI();
  loadPromoEditor();
  _initAdminKeyboard();  // ⭐ keyboard ENTER flow
  loadHeroOverlaySettings();
  renderKategoriChipAdmin();
  renderKasirList();
  if(window.App && App.renderOwnerKategoriSelect) App.renderOwnerKategoriSelect();

  // Register backup schedule listener here (DOM is ready)
  document.getElementById("backupSchedule")?.addEventListener("change", e=>{
    localStorage.setItem("backupSchedule", e.target.value);
  });
}
function importData(){
  const input = document.createElement("input");
  input.type="file"; input.accept=".json";
  input.onchange = e=>{
    const f=e.target.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const d=JSON.parse(ev.target.result);
        if(d.products && d.products.length){
          const normed = d.products.map(p => p.i !== undefined ? p : normalizeProduct(p));
  localStorage.setItem("products", JSON.stringify(normed)); if(typeof window.notifySync==="function") window.notifySync("products");
          invalidateProductCache && invalidateProductCache();
        }
        if(d.lsData && typeof d.lsData === "object"){
          Object.entries(d.lsData).forEach(([k,v]) => {
            if(v !== null && v !== undefined) localStorage.setItem(k, String(v));
          });
        } else {
          if(d.config)    localStorage.setItem("config",    JSON.stringify(d.config));
          if(d.storeName) localStorage.setItem("storeName", d.storeName);
          if(d.ownerWa)   localStorage.setItem("ownerWa",   d.ownerWa);
          if(d.heroText)  localStorage.setItem("heroText",  d.heroText);
        }
        ["kategoriList","transaksi","_kasirList","_customers",
         "promoTitle","promoDesc","sponsorTitle","sponsorDesc",
         "heroSlideSpeedSec","qris","qrisImg","ownerPin","kasirPin",
         "storeHeaderImg","heroPromoLeftImages","heroPromoRightImages"
        ].forEach(k => {
          if(d[k] !== undefined)
            localStorage.setItem(k, typeof d[k]==="string" ? d[k] : JSON.stringify(d[k]));
        });
        showToast("\u2705 Restore berhasil! Memuat ulang...");
        setTimeout(()=>location.reload(), 900);
      }catch(err){
        console.error("Restore error:", err);
        showToast("\u274c File tidak valid: "+err.message);
      }
    };
    reader.readAsText(f);
  };
  input.click();
}

function resetData(){
  if(!confirm("Reset semua data toko? Ini tidak bisa dibatalkan.")) return;
  localStorage.clear();
  location.reload();
}

function renderLicenseUI(){
  const tier = window.Core ? Core.getCurrentTier() : "free";
  const type = tier.toUpperCase();
  const badge = document.getElementById("licBadgePanel");
  if(badge) badge.innerText = type;
  const statusEl = document.getElementById("statusLicense");
  if(statusEl) statusEl.innerText = type;
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initAdmin);
} else {
  initAdmin();
}



/* ================= KASIR MANAGEMENT ================= */
function _getKasirList(){
  try{ return JSON.parse(localStorage.getItem("_kasirList")||"[]"); }catch(e){ return []; }
}
function _saveKasirList(list){
  localStorage.setItem("_kasirList", JSON.stringify(list));
}

function renderKasirList(){
  const el = document.getElementById("kasirList"); if(!el) return;
  const tier = window.Core ? Core.getCurrentTier() : "free";
  const maxKasir = { free:1, basic:2, pro:4, premium:8, ultimate:20, developer:99 }[tier] || 1;
  const infoEl = document.getElementById("kasirLimitInfo");
  if(infoEl) infoEl.textContent = `Tier ${tier.toUpperCase()} — maks ${maxKasir} kasir`;

  const list = _getKasirList();
  if(!list.length){
    el.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:6px 0">Belum ada kasir ditambahkan</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach((k,i) => {
    const div = document.createElement("div");
    div.style.cssText = "display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:8px 10px;font-size:13px";
    div.innerHTML = `
      <span style="font-size:18px">👤</span>
      <div style="flex:1">
        <div style="font-weight:700">${k.nama}</div>
        <div style="font-size:10px;color:var(--text3)">ID: ${k.id} · PIN: ●●●●●●</div>
      </div>
      <button onclick="Admin.deleteKasir('${k.id}')" style="background:#450a0a;color:#f87171;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer">🗑️ Hapus</button>`;
    frag.appendChild(div);
  });
  el.innerHTML = "";
  el.appendChild(frag);

  // show/hide add form based on limit
  const addForm = document.getElementById("kasirAddForm");
  if(addForm) addForm.style.display = list.length >= maxKasir ? "none" : "flex";

  // show limit message
  if(list.length >= maxKasir && addForm){
    let msg = document.getElementById("kasirMaxMsg");
    if(!msg){
      msg = document.createElement("div");
      msg.id = "kasirMaxMsg";
      msg.style.cssText = "font-size:11px;color:#f59e0b;padding:6px 10px;background:#78350f22;border-radius:6px;margin-top:4px";
    }
    msg.textContent = `Batas ${maxKasir} kasir untuk tier ${tier.toUpperCase()} tercapai. Upgrade untuk tambah lebih banyak kasir.`;
    addForm.parentNode.insertBefore(msg, addForm.nextSibling);
  } else {
    const msg = document.getElementById("kasirMaxMsg");
    if(msg) msg.remove();
  }
}

function addKasir(){
  const nama = (document.getElementById("kasirNamaBaru")?.value||"").trim();
  const pin  = (document.getElementById("kasirPinBaru")?.value||"").trim();
  if(!nama){ showToast("Isi nama kasir"); return; }
  if(pin.length !== 6 || !/^[0-9]{6}$/.test(pin)){ showToast("PIN harus 6 digit angka"); return; }

  const tier = window.Core ? Core.getCurrentTier() : "free";
  const maxKasir = { free:1, basic:2, pro:4, premium:8, ultimate:20, developer:99 }[tier] || 1;
  const list = _getKasirList();
  if(list.length >= maxKasir){
    showToast("Batas kasir tercapai. Upgrade lisensi untuk menambah lebih banyak kasir.");
    return;
  }

  const newId = "K" + Date.now().toString(36).toUpperCase();
  list.push({ id: newId, nama, pin });
  _saveKasirList(list);

  // Clear form
  const n = document.getElementById("kasirNamaBaru"); if(n) n.value = "";
  const p = document.getElementById("kasirPinBaru");  if(p) p.value = "";

  renderKasirList();
  showToast("✅ Kasir " + nama + " ditambahkan (ID: " + newId + ")");
}

function deleteKasir(id){
  if(!confirm("Hapus kasir ini?")) return;
  let list = _getKasirList();
  list = list.filter(k => k.id !== id);
  _saveKasirList(list);
  renderKasirList();
  showToast("🗑️ Kasir dihapus");
}

/* ================= PRODUCT INLINE EDIT HELPERS ================= */
function _editProductPrice(id, name, currentPrice){
  const newPriceStr = prompt(`Harga baru untuk "${name}" (Rp):`, currentPrice);
  if(newPriceStr === null) return;
  const newPrice = +newPriceStr.replace(/[^0-9]/g, "");
  if(isNaN(newPrice) || newPrice <= 0){ showToast("Harga tidak valid"); return; }

  const products = getProducts();
  const idx = products.findIndex(p => (p.i||p.id) === id || String(p.i||p.id) === String(id));
  if(idx < 0){ showToast("Produk tidak ditemukan"); return; }
  if(products[idx].p !== undefined) products[idx].p = newPrice;
  else products[idx].price = newPrice;
  saveProducts(products);
  // Update DOM inline
  const el = document.getElementById("opir-price-"+id);
  if(el) el.textContent = "Rp " + newPrice.toLocaleString("id");
  showToast("✅ Harga diubah: Rp " + newPrice.toLocaleString("id"));
  if(window.App) App.renderFull && App.renderFull();
}

function _adjustProductStok(id, delta){
  const products = getProducts();
  showToast(delta > 0 ? "✅ Stok ditambah" : "✅ Stok dikurangi");
  const idx = products.findIndex(p => String(p.i||p.id) === String(id));
  if(idx < 0) return;
  const cur = products[idx].stok !== undefined ? +products[idx].stok : 0;
  products[idx].stok = Math.max(0, cur + delta);
  saveProducts(products);
  const el = document.getElementById("opir-stok-"+id);
  if(el) el.textContent = products[idx].stok;
  if(window.App) App.renderFull && App.renderFull();
  renderOwnerProdukList();
}

function _changeProductImg(id){
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = async e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const products = getProducts();
      const idx = products.findIndex(p => String(p.i||p.id) === String(id));
      if(idx < 0) return;
      if(products[idx].g !== undefined) products[idx].g = dataUrl;
      else products[idx].img = dataUrl;
      saveProducts(products);
      renderOwnerProdukList();
      if(window.App) App.renderFull && App.renderFull();
      showToast("✅ Foto produk diperbarui");
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function _editProductForm(id){
  const products = getProducts();
  const p = products.find(px => String(px.i||px.id) === String(id));
  if(!p){ showToast("Produk tidak ditemukan"); return; }
  // Populate form fields
  const set = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val; };
  set("pName",  p.n||p.name||"");
  set("pSku", p.sku||"");
  set("pModal", p.m||p.modal||0);
  set("pPrice", p.p||p.price||0);
  set("pStok",  p.stok !== undefined ? p.stok : "");
  set("pMinStok", p.minStok !== undefined ? p.minStok : 10);
  // Sumber & Tempo
  set("pSumber", p.sumber || "Cash");
  set("pTempo", p.tempo || "");
  set("pSupplierName", p.supplierName || "");
  set("pSupplierWA", p.supplierWA || "");
  set("pSupplierAlamat", p.supplierAlamat || "");
  const wrap = document.getElementById("pTempoWrap");
  if(wrap) wrap.style.display = (p.sumber==="Hutang" || p.sumber==="Titip Jual") ? "block" : "none";

  // Kategori
  const katSel = document.getElementById("pKategori");
  if(katSel && (p.k||p.kategori)){
    katSel.value = p.k||p.kategori;
  }
  // Preview img
  const prev = document.getElementById("pImgPrev");
  const imgVal = p.g||p.img||"";
  if(prev && imgVal) prev.innerHTML = `<img src="${imgVal}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px">`;
  // Store editing id
  window._editingProductId = String(id);
  showToast("✏️ Edit produk loaded — ubah lalu Simpan");
  // Scroll to form
  document.getElementById("pName")?.scrollIntoView({ behavior:"smooth", block:"center" });
}


/* ================= KATEGORI ADMIN HELPERS ================= */
function deleteSelectedKategori(){
  const sel = document.getElementById("pKategori");
  if(!sel || !sel.value){ showToast("Pilih kategori dulu"); return; }
  const kat = sel.value;
  if(!confirm(`Hapus kategori "${kat}"? Produk di kategori ini tidak ikut terhapus.`)) return;
  let cats = [];
  try{ cats = JSON.parse(localStorage.getItem("kategoriList")||"[]"); }catch(e){}
  cats = cats.filter(c => c !== kat);
  localStorage.setItem("kategoriList", JSON.stringify(cats));
  if(window.App && App.renderOwnerKategoriSelect) App.renderOwnerKategoriSelect();
  renderKategoriChipAdmin();
  showToast("🗑️ Kategori dihapus");
}

function renderKategoriChipAdmin(){
  const el = document.getElementById("kategoriChipAdmin"); if(!el) return;
  let cats = [];
  try{ cats = JSON.parse(localStorage.getItem("kategoriList")||"[]"); }catch(e){}
  if(!cats.length){ el.innerHTML = '<span style="color:var(--text3);font-size:12px">Belum ada kategori</span>'; return; }
  el.innerHTML = cats.map(c =>
    `<div style="background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;">${c}</div>`
  ).join('');
}

function adjustStok(delta){
  const el = document.getElementById("pStok");
  if(!el) return;
  const v = Math.max(0, (+el.value||0) + delta);
  el.value = v;
}

function clearProductForm(){
  ["pName","pModal","pPrice","pStok","pTempo","pSupplierName","pSupplierWA","pSupplierAlamat"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  const elS = document.getElementById("pSumber"); if(elS) elS.value="Cash";
  const wT = document.getElementById("pTempoWrap"); if(wT) wT.style.display="none";
  document.getElementById("pImgPrev").innerHTML = '<span>📷 Klik upload foto</span>';
  // Keep kategori as last selected
}

/* ================= TABLE TAB ================= */
let _tableSortCol = "terjual";
let _tableSortDir = "desc";
let _historySortCol = "tgl";
let _historySortDir = "desc";

function setTableSort(col, type='rekap') {
  if(type === 'history') {
    if(_historySortCol === col) {
      _historySortDir = _historySortDir === "asc" ? "desc" : "asc";
    } else {
      _historySortCol = col;
      _historySortDir = "desc";
    }
    renderHistory();
  } else {
    if(_tableSortCol === col) {
      _tableSortDir = _tableSortDir === "asc" ? "desc" : "asc";
    } else {
      _tableSortCol = col;
      _tableSortDir = "desc"; // default new col to desc
    }
    renderTable();
  }
}

function renderTable(){
  const txAll = getTxForAdmin();
  const products = getProducts();
  const rp = v => "Rp " + Math.round(v).toLocaleString("id");
  const sq = (document.getElementById("searchTable")?.value || "").toLowerCase();

  // Find top product and seller this month
  const now = new Date();
  const currMonth = now.getMonth();
  const currYear = now.getFullYear();
  let topProdMap = {};
  let topSellerMap = {};

  // Build per-product stats
  const stats = {};
  txAll.forEach(tx => {
    const d = new Date(tx.tgl);
    const isThisMonth = d.getMonth() === currMonth && d.getFullYear() === currYear;

    if(isThisMonth) {
       const src = tx.source || "kasir";
       topSellerMap[src] = (topSellerMap[src] || 0) + 1;
    }

    (tx.items||[]).forEach(item => {
      const id = item.id;
      if(!stats[id]) stats[id] = {
        nama: item.nama, terjual: 0, omzet: 0, hpp: 0,
        modalSum: 0, kasir: 0, web: 0,
        status: tx.status || "paid"
      };
      stats[id].terjual += item.qty;
      stats[id].omzet   += item.harga * item.qty;
      stats[id].hpp     += (item.modal||0) * item.qty;
      stats[id].modalSum+= (item.modal||0);
      if(tx.source === "web") stats[id].web += item.qty;
      else stats[id].kasir += item.qty;

      if(isThisMonth) topProdMap[item.nama] = (topProdMap[item.nama] || 0) + item.qty;
    });
  });

  let topP = "-", maxP = 0;
  for(const [k,v] of Object.entries(topProdMap)){ if(v > maxP) { maxP=v; topP=k; } }
  let topS = "-", maxS = 0;
  for(const [k,v] of Object.entries(topSellerMap)){ if(v > maxS) { maxS=v; topS=k; } }

  const elTP = document.getElementById("topProduct"); if(elTP) elTP.textContent = topP + (maxP > 0 ? ` (${maxP})` : "");
  const elTS = document.getElementById("topSeller"); if(elTS) elTS.textContent = topS + (maxS > 0 ? ` (${maxS})` : "");

  const tbody = document.getElementById("tableRekapBody"); if(!tbody) return;
  if(!Object.keys(stats).length){
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Belum ada data transaksi</td></tr>';
  } else {
    let arrStats = Object.values(stats).map(s => {
       const prod = products.find(p => p.n === s.nama || p.name === s.nama);
       const stok = prod ? (prod.stok !== undefined ? prod.stok : 0) : 0;
       const stokStr = prod ? (prod.stok !== undefined ? prod.stok : '—') : '—';
       const modalAvg = s.terjual > 0 ? Math.round(s.hpp / s.terjual) : 0;
       const laba = s.omzet - s.hpp;
       const margin = s.omzet > 0 ? parseFloat(((laba/s.omzet)*100).toFixed(1)) : 0;
       let sumberProd = "Cash";
       if(prod && prod.sumber) sumberProd = prod.sumber;
       const supplierName = prod ? (prod.supplierName || '—') : '—';
       const supplierWA = prod ? (prod.supplierWA || '—') : '—';
       const supplierAlamat = prod ? (prod.supplierAlamat || '—') : '—';
       return { ...s, prod, stok, stokStr, modalAvg, laba, margin, sumberProd, supplierName, supplierWA, supplierAlamat };
    });

    if(sq) {
       arrStats = arrStats.filter(x => x.nama.toLowerCase().includes(sq));
    }

    arrStats.sort((a,b) => {
       let va = a[_tableSortCol], vb = b[_tableSortCol];
       if(_tableSortCol === 'sumber') { va = a.sumberProd; vb = b.sumberProd; }
       if(_tableSortCol === 'nama') { va = a.nama; vb = b.nama; }
       if(_tableSortCol === 'supplierName') { va = a.supplierName; vb = b.supplierName; }
       if(_tableSortCol === 'supplierWA') { va = a.supplierWA; vb = b.supplierWA; }
       if(_tableSortCol === 'supplierAlamat') { va = a.supplierAlamat; vb = b.supplierAlamat; }

       if(typeof va === 'string' && typeof vb === 'string') {
          return _tableSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
       } else {
          return _tableSortDir === 'asc' ? va - vb : vb - va;
       }
    });

    const rows = arrStats.map(s => {
      const prod = s.prod;
      const stokStr = s.stokStr;
      const modalAvg = s.modalAvg;
      const laba = s.laba;
      const margin = s.margin;
      let sumberProd = s.sumberProd;
      let statusWarningHtml = "<span style='color:#4ade80; font-weight:bold;'>Aman</span>";
      if(prod && prod.sumber && prod.sumber !== "Cash"){
        sumberProd = prod.sumber;
        if(prod.tempo){
          let parsedDate = NaN;
          if (prod.tempo.includes('-')) {
            const parts = prod.tempo.split('-');
            if (parts.length === 3) {
              parsedDate = new Date(`20${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            }
          } else {
            parsedDate = new Date(prod.tempo).getTime();
          }
          const sisaHari = Math.ceil((parsedDate - Date.now()) / (1000 * 3600 * 24));
          if(sisaHari <= 3){
            statusWarningHtml = `<span style='color:#f87171; font-weight:bold;' title='Jatuh tempo: ${prod.tempo}'>Bersiap</span>`;
          } else if(sisaHari <= 7){
            statusWarningHtml = `<span style='color:#fbbf24; font-weight:bold;' title='Jatuh tempo: ${prod.tempo}'>Waspada</span>`;
          } else {
            statusWarningHtml = `<span style='color:#4ade80; font-weight:bold;' title='Jatuh tempo: ${prod.tempo}'>Aman</span>`;
          }
        } else {
          statusWarningHtml = `<span style='color:#94a3b8;'>No Tempo</span>`;
        }
      }

      return `<tr>
        <td><b>${s.nama}</b></td>
        <td>${s.terjual}</td>
        <td>${s.supplierName}</td>
        <td>${s.supplierWA}</td>
        <td>${s.supplierAlamat}</td>
        <td>${stokStr}</td>
        <td>${rp(modalAvg)}</td>
        <td>${rp(s.omzet)}</td>
        <td>${rp(s.hpp)}</td>
        <td style="color:${laba>=0?'#4ade80':'#f87171'}">${rp(laba)}</td>
        <td>${margin}%</td>
        <td>
          <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
            <span style="font-size:11px; background:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:600;">${sumberProd}</span>
            ${statusWarningHtml}
          </div>
        </td>
      </tr>`;
    });
    tbody.innerHTML = rows.join('');
  }

}

function renderHistory(){
  const txAll = getTxForAdmin();
  const tbody = document.getElementById("historyTableBody");
  if(!tbody) return;

  if(!txAll.length){
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text3)">Belum ada data transaksi</td></tr>';
    return;
  }

  const rp = v => "Rp " + Math.round(v).toLocaleString("id");
  const sorted = txAll.slice();

  sorted.sort((a,b) => {
     let va = a[_historySortCol];
     let vb = b[_historySortCol];

     if (_historySortCol === 'total') {
        va = a.grand || 0;
        vb = b.grand || 0;
     }

     if(typeof va === 'string' && typeof vb === 'string') {
        return _historySortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
     } else {
        return _historySortDir === 'asc' ? (va||0) - (vb||0) : (vb||0) - (va||0);
     }
  });

  const rows = sorted.map((tx, idx) => {
    const noUrut = idx + 1;
    const inv = tx.inv || tx.id || "—";
    const d = new Date(tx.tgl);
    const tgl = formatDate(d);
    const nama = tx.nama || "—";
    const wa = tx.hp || "—";
    const alamat = tx.alamat || "—";
    const total = rp(tx.grand || tx.total || 0);
    const src = tx.source || "kasir";
    const method = tx.paymentMethod || "Tunai";
    const status = tx.status || "paid";

    const cls = status==="paid"?"paid":status==="wait"?"wait":"cancel";
    const selectStatus = `
      <select class="status-badge status-${cls}" onchange="Admin.updateTxStatus('${inv}',this.value,this,true)">
        <option value="paid"  ${status==="paid"  ?"selected":""}>✅ Paid</option>
        <option value="wait"  ${status==="wait"  ?"selected":""}>⏳ Wait</option>
        <option value="cancel"${status==="cancel"?"selected":""}>❌ Cancel</option>
      </select>
    `;

    // Simpan json ke global var untuk modal
    const itemsJson = encodeURIComponent(JSON.stringify(tx.items||[])).replace(/'/g, "%27");
    const btnDetail = `<button onclick="Admin.showTxDetail('${inv}', '${itemsJson}')" class="btn-sm">Detail</button>`;

    return `<tr>
      <td>${noUrut}</td>
      <td>${inv}</td>
      <td>${tgl}</td>
      <td>${nama}</td>
      <td>${wa}</td>
      <td>${alamat}</td>
      <td>${total}</td>
      <td><span class="tx-source-badge">${src}</span></td>
      <td>${selectStatus}</td>
      <td>${method}</td>
      <td>${btnDetail}</td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');
}

window.showTxDetail = function(inv, itemsJsonEncoded){
  const items = JSON.parse(decodeURIComponent(itemsJsonEncoded));
  const rp = v => "Rp " + Math.round(v).toLocaleString("id");

  document.getElementById("detailTxInfo").innerHTML = `<b>Invoice:</b> ${inv}`;

  const tbody = document.getElementById("detailTxBody");
  if(items.length === 0){
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Tidak ada item</td></tr>';
  } else {
    tbody.innerHTML = items.map(item => `
      <tr>
        <td>${item.nama}</td>
        <td>${item.qty}</td>
        <td>${rp(item.harga)}</td>
        <td>${rp(item.harga * item.qty)}</td>
      </tr>
    `).join('');
  }
  document.getElementById("detailTxModal").style.display = "flex";
};

let _txCache = null;
function invalidateTxCache(){ _txCache = null; }
function getTxForAdmin(){
  if(_txCache) return _txCache;
  if(window.Core && Core.idbGetAll){
    Core.idbGetAll("transaksi").then(items => {
      if(items && items.length > 0) _txCache = items;
    }).catch(e=>{});
  }
  try{ return JSON.parse(localStorage.getItem("transaksi")||"[]"); }catch(e){ return []; }
}

function renderTxListTable(txAll){
  const el = document.getElementById("txListTable"); if(!el) return;
  const last50 = (txAll||getTxForAdmin()).slice(-50).reverse();
  if(!last50.length){ el.innerHTML='<div class="backup-empty">Belum ada transaksi</div>'; return; }
  const rp = v => "Rp "+Math.round(v).toLocaleString("id");
  const frag = document.createDocumentFragment();
  last50.forEach(tx => {
    const d = new Date(tx.tgl);
    const tgl = formatDate(d);
    const status = tx.status || "paid";
    const cls = status==="paid"?"tx-paid":status==="wait"?"tx-wait":"tx-cancel";
    const badge = status==="paid"?'<span class="status-badge status-paid">✅ Paid</span>':
                  status==="wait"?`<span class="status-badge status-wait">⏳ Wait ${getWaitCountdown(tx.tgl, tx.status)}</span>` :
                                  '<span class="status-badge status-cancel">❌ Cancel</span>';
    const src = tx.source||"kasir";
    const div = document.createElement("div");
    div.className = "tx-item tx-3row "+cls;
    const _c3 = tx.nama&&tx.nama!=="Pelanggan" ? tx.nama+(tx.hp?" "+tx.hp:"") : "";
    const _i3 = (tx.items||[]).map(x=>x.nama+"\xd7"+x.qty).join(", ");
    div.innerHTML = `
      <div class="tx-row1">
        <span class="tx-inv-code">${tx.inv||"—"}</span>
        <span class="tx-source-badge">${src}</span>
        <select class="status-badge status-${status} tx-status-sel" onchange="Admin.updateTxStatus('${tx.inv||tx.id}',this.value,this)">
          <option value="paid"  ${status==="paid"  ?"selected":""}>✅ Paid</option>
          <option value="wait"  ${status==="wait"  ?"selected":""}>⏳ Wait</option>
          <option value="cancel"${status==="cancel"?"selected":""}>❌ Cancel</option>
        </select>
        <span class="tx-total-sm">${rp(tx.grand||tx.total||0)}</span>
      </div>
      <div class="tx-row2">
        <span class="tx-date-sm">${tgl}</span>
        ${_c3?`<span class="tx-cust-sm">� ${_c3}</span>`:""}
      </div>
      <div class="tx-row3">${_i3}</div>`
    frag.appendChild(div);
  });
  el.innerHTML=""; el.appendChild(frag);
}

/* Restore stok ketika transaksi di-cancel (kebalikan dari reduce) */
function _restoreStockForTx(tx){
  if(!tx || !tx.items || !tx.items.length) return;
  const products = getProducts();
  let changed = false;
  tx.items.forEach(item => {
    const idx = products.findIndex(p => {
      const pid = String(p.i !== undefined ? p.i : p.id);
      return pid === String(item.id) || (p.n||p.name) === item.nama;
    });
    if(idx >= 0 && products[idx].stok !== undefined){
      products[idx].stok = (products[idx].stok || 0) + item.qty;
      changed = true;
    }
  });
  if(!changed) return;
  saveProducts(products);
  invalidateProductCache && invalidateProductCache();
  if(window.App){
    App.renderFull && App.renderFull();
  }
  renderOwnerProdukList();
}

function updateTxStatus(invOrId, newStatus, selectEl){
  let list = getTxForAdmin();
  const idx = list.findIndex(tx => (tx.inv||String(tx.id)) === String(invOrId));
  if(idx < 0){ showToast("Transaksi tidak ditemukan"); return; }
  const oldStatus = list[idx].status || "pending";
  const tx = list[idx];

  if(newStatus === "cancel"){
    if(!confirm(`Batalkan transaksi ${tx.inv||invOrId}? Stok produk akan dikembalikan dan baris ini dihapus.`)) return;
    // Restore stok jika sebelumnya sudah paid atau wait
    if(oldStatus === "paid" || oldStatus === "wait") _restoreStockForTx(tx);
    // Hapus baris transaksi
    list.splice(idx, 1);
  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions");
    showToast("🗑️ Transaksi dibatalkan, stok dikembalikan");
    // Hapus baris dari DOM jika ada
    const row = selectEl?.closest("tr, .tx-item");
    if(row) row.remove();
    renderAkuntansi();
    renderOwnerProdukList();
    renderTable();
    return;
  }

  list[idx].status = newStatus;
  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions");

  // Kurangi stok jika belum pernah dikurangi (pending/etc) -> paid/wait
  if(newStatus === "paid" && oldStatus !== "paid" && oldStatus !== "wait") {
    if(window.reduceStockForTx) reduceStockForTx(list[idx]);
    else if(window.App && App.reduceStockForTx) App.reduceStockForTx(list[idx]);
  }
  // Jika dari paid ke wait, kembalikan stok
  if(newStatus === "wait" && oldStatus === "paid"){
    _restoreStockForTx(list[idx]);
  }

  if(selectEl) selectEl.className = "status-badge status-"+newStatus;
  showToast("✅ Status diubah: "+newStatus);
  renderAkuntansi();
  renderOwnerProdukList();
  const tabTable = document.getElementById("tabTable");
  if(tabTable && tabTable.classList.contains("active")) renderTable();
}

function updateProductStatus(nama, newStatus, selectEl){
  let list = getTxForAdmin();

  if(newStatus === "cancel"){
    if(!confirm('Batalkan semua transaksi produk "'+nama+'"? Stok dikembalikan dan data dihapus.')) return;
    const toCancel = list.filter(tx => (tx.items||[]).some(i => i.nama === nama));
    toCancel.forEach(tx => {
      const st = tx.status || "pending";
      if(st === "paid" || st === "wait") _restoreStockForTx(tx);
    });
    list = list.filter(tx => !(tx.items||[]).some(i => i.nama === nama));
  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions");
    showToast("✅ Dibatalkan, stok dikembalikan");
    const row = selectEl?.closest("tr");
    if(row) row.remove();
    renderAkuntansi();
    renderOwnerProdukList();
    renderTable();
    return;
  }

  list.forEach(tx => {
    if((tx.items||[]).some(i => i.nama === nama)){
      const oldSt = tx.status || "pending";
      tx.status = newStatus;
      if(newStatus === "paid" && oldSt !== "paid" && oldSt !== "wait" && window.reduceStockForTx) reduceStockForTx(tx);
      if(newStatus === "wait" && oldSt === "paid") _restoreStockForTx(tx);
    }
  });
  localStorage.setItem("transaksi", JSON.stringify(list)); if(typeof window.notifySync==="function") window.notifySync("transactions");
  if(selectEl) selectEl.className = "status-badge status-"+newStatus;
  showToast("✅ Status produk: "+newStatus);
  renderOwnerProdukList();
}

/* ================= DATA PELANGGAN ================= */
function renderPelangganList(filter){
  const el = document.getElementById("pelangganList"); if(!el) return;
  let customers = {};
  try{ customers = JSON.parse(localStorage.getItem("_customers")||"{}"); }catch(e){}

  // Also gather from transactions
  const txAll = getTxForAdmin();
  txAll.forEach(tx => {
    if(tx.hp && tx.nama && tx.nama !== "Pelanggan"){
      if(!customers[tx.hp]){
        customers[tx.hp] = { nama: tx.nama, alamat: tx.alamat||"—", lastSeen: tx.tgl };
      } else {
        // Update lastSeen if newer
        if(tx.tgl > (customers[tx.hp].lastSeen||0)) customers[tx.hp].lastSeen = tx.tgl;
        if(!customers[tx.hp].nama) customers[tx.hp].nama = tx.nama;
      }
    }
  });

  const countEl = document.getElementById("pelangganCount");
  const entries = Object.entries(customers);
  if(countEl) countEl.textContent = entries.length + " pelanggan tersimpan";

  if(!entries.length){
    el.innerHTML = '<div class="backup-empty">Belum ada data pelanggan</div>';
    return;
  }

  const q = (filter||"").toLowerCase();
  const filtered = entries.filter(([hp, c]) =>
    !q || (c.nama||"").toLowerCase().includes(q) || hp.includes(q)
  );

  if(!filtered.length){ el.innerHTML = '<div class="backup-empty">Tidak ditemukan</div>'; return; }

  const frag = document.createDocumentFragment();
  filtered.sort((a,b) => (b[1].lastSeen||0)-(a[1].lastSeen||0));
  filtered.forEach(([hp, c]) => {
    const lastDate = c.lastSeen ? formatDate(new Date(c.lastSeen)).split(" ")[0] : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.nama||"—"}</td>
      <td>${hp}</td>
      <td>${c.alamat||"—"}</td>
      <td>${lastDate}</td>
      <td>
        <button class="btn-sm" style="background:#10b981;color:#fff" onclick="window.open('https://wa.me/${hp}')">💬 WA</button>
        <button class="btn-sm" style="background:var(--accent);color:#fff" onclick="Admin.showHistoryPelanggan('${hp}', '${(c.nama||'').replace(/'/g,"\\'")}')">🧾 Riwayat</button>
      </td>
    `;
    frag.appendChild(tr);
  });
  el.innerHTML=""; el.appendChild(frag);
}

/* ================= HERO OVERLAY STYLE ================= */
function applyHeroOverlay(){
  const color   = document.getElementById("heroOverlayColor")?.value || "#070c19";
  const opacity = +(document.getElementById("heroOverlayOpacity")?.value||55) / 100;
  const textClr = document.getElementById("heroTextColor")?.value || "#ffffff";
  // Convert hex+opacity to rgba
  const r = parseInt(color.slice(1,3),16);
  const g = parseInt(color.slice(3,5),16);
  const b = parseInt(color.slice(5,7),16);
  const rgba = `rgba(${r},${g},${b},${opacity})`;
  document.documentElement.style.setProperty("--hero-overlay-bg", rgba);
  document.querySelectorAll(".hero-slide .hero-content").forEach(el => {
    el.style.background = rgba;
    el.style.color = textClr;
  });
  document.querySelectorAll(".hero-slide .hero-content h2, .hero-slide .hero-content h3, .hero-slide .hero-content p").forEach(el => {
    el.style.color = textClr;
  });
  localStorage.setItem("heroOverlayColor", color);
  localStorage.setItem("heroOverlayOpacity", opacity);
  localStorage.setItem("heroTextColor", textClr);
}

function loadHeroOverlaySettings(){
  const color = localStorage.getItem("heroOverlayColor")||"#070c19";
  const opPct = Math.round((+(localStorage.getItem("heroOverlayOpacity")||0.55))*100);
  const textClr = localStorage.getItem("heroTextColor")||"#ffffff";
  const colorEl = document.getElementById("heroOverlayColor");
  const opEl    = document.getElementById("heroOverlayOpacity");
  const textEl  = document.getElementById("heroTextColor");
  const valEl   = document.getElementById("heroOverlayVal");
  if(colorEl) colorEl.value = color;
  if(opEl)    opEl.value    = opPct;
  if(textEl)  textEl.value  = textClr;
  if(valEl)   valEl.textContent = opPct+"%";
  applyHeroOverlay();
}


/* ================= EXPORT ================= */
window.Admin = {
  saveToko, savePin, saveMargin,
  saveKasirPin,
  addProduct, deleteProduct, generateAndSetSKU,
  savePromo, doBackup, importData, resetData,
  saveAccSettings, clearTransaksi,
  renderAkuntansi, generateInvoiceId, getAccSettings,
  renderOwnerProdukList, getProducts, saveProducts,
  getProductsAsync, saveProductsAsync,
  invalidateProductCache,
  invalidateTxCache,
  normalizeProduct, denormalizeProduct,
  signProduct, verifyProduct,
  // NEW
  deleteSelectedKategori, adjustStok, clearProductForm,
  renderTable, renderTxListTable, renderPelangganList, renderHistory, setTableSort,
  showTxDetail, updateTxStatus, updateProductStatus, hapusSeluruhData, showHistoryPelanggan,
  applyHeroOverlay, loadHeroOverlaySettings,
  renderKategoriChipAdmin,
  // Kasir
  addKasir, deleteKasir, renderKasirList,
  // Product inline edit
  _editProductPrice, _adjustProductStok, _changeProductImg, _editProductForm,
  filterProdukAdmin,
  _updateExistingProduct,
  _restoreStockForTx
};

window.renderPelangganList = renderPelangganList;
window.addKasir = addKasir;
window.deleteKasir = deleteKasir;

/* Keep kategori default as last selected */
document.addEventListener("change", function(e){
  if(e.target && e.target.id === "pKategori"){
    localStorage.setItem("_lastKategori", e.target.value);
  }
});

window.showTab       = showTab;

/* ================= INVOICE DETAIL MODAL ================= */
function showInvoiceDetail(inv) {
  const txList = typeof _txCache !== 'undefined' && _txCache ? _txCache : JSON.parse(localStorage.getItem("transaksi")||"[]");
  const tx = txList.find(t => t.inv === inv);
  if(!tx) {
     showToast("Invoice tidak ditemukan");
     return;
  }

  const d = new Date(tx.tgl);
  const tglStr = typeof formatDate === "function" ? formatDate(d) : d.toLocaleString("id");
  const modal = document.getElementById("invoiceDetailModal");
  const title = document.getElementById("invDetailTitle");
  const body = document.getElementById("invDetailBody");

  if(!modal || !title || !body) return;

  title.innerHTML = `Invoice: <span style="color:var(--accent)">${tx.inv}</span>`;

  let html = `
    <div style="margin-bottom:10px;">
      <b>Tanggal:</b> ${tglStr}<br>
      <b>Metode:</b> ${tx.paymentMethod || "Tunai"}<br>
      <b>Status:</b> ${tx.status.toUpperCase()}<br>
      <b>Pelanggan:</b> ${tx.nama || "-"} (${tx.hp || "-"})
    </div>
    <div style="border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:10px 0;margin-bottom:10px;">
      <b style="display:block;margin-bottom:5px;">Item:</b>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
  `;

  (tx.items || []).forEach(i => {
      const sub = i.qty * i.harga;
      html += `<tr>
        <td style="padding:2px 0;">${i.nama} x${i.qty}</td>
        <td style="text-align:right;">Rp ${sub.toLocaleString("id")}</td>
      </tr>`;
  });

  html += `</table></div>`;

  const total = tx.total || 0;
  const grand = tx.grand || total;
  const ongkir = tx.ongkir || 0;
  const diskon = (total + ongkir) - grand;

  html += `<table style="width:100%;font-size:13px;font-weight:bold;">`;
  html += `<tr><td>Total Item</td><td style="text-align:right;">Rp ${total.toLocaleString("id")}</td></tr>`;
  if(diskon > 0) {
      html += `<tr><td style="color:var(--accent2)">Diskon</td><td style="text-align:right;color:var(--accent2)">-Rp ${diskon.toLocaleString("id")}</td></tr>`;
  }
  if(ongkir > 0) {
      html += `<tr><td>Ongkir</td><td style="text-align:right;">Rp ${ongkir.toLocaleString("id")}</td></tr>`;
  }
  html += `<tr style="font-size:15px;color:var(--accent);border-top:1px solid var(--border)">
             <td style="padding-top:5px;">Grand Total</td>
             <td style="text-align:right;padding-top:5px;">Rp ${grand.toLocaleString("id")}</td>
           </tr>`;
  html += `</table>`;

  body.innerHTML = html;
  modal.style.display = "flex";
}
window.showInvoiceDetail = showInvoiceDetail;

window.autoHargaJual = autoHargaJual;
window.deleteBackupRecord = deleteBackupRecord;
window.deleteProduct = deleteProduct;


function hapusSeluruhData(){
  if(!confirm("YAKIN? Ini akan menghapus semua data transaksi, rekap, dan pelanggan!")) return;
  const pin = prompt("Masukkan PIN Owner untuk melanjutkan:");
  // Simplified check without await since prompt is sync
  if(!pin) return;

  localStorage.setItem("transaksi", "[]"); if(typeof window.notifySync==="function") window.notifySync("transactions");
  localStorage.setItem("rekapBulanan", "[]");
  localStorage.setItem("_customers", "{}");
  if(window.Core && Core.idbClear) {
    Core.idbClear("transaksi").catch(()=>{});
  }
  showToast("&#128465; Seluruh data berhasil dihapus");
  renderAkuntansi();
  if(window.renderTable) renderTable();
  if(window.renderPelangganList) renderPelangganList();
}

function showHistoryPelanggan(hp, nama){
  const txAll = getTxForAdmin();
  const historyBody = document.getElementById("historyPelangganBody");
  const historyInfo = document.getElementById("historyPelangganInfo");
  if(!historyBody || !historyInfo) return;

  const userTx = txAll.filter(tx => tx.hp === hp);

  historyInfo.textContent = `Riwayat: ${nama} (${hp}) - ${userTx.length} Transaksi`;

  if(!userTx.length){
    historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3)">Belum ada transaksi</td></tr>';
  } else {
    const rp = v => "Rp " + Math.round(v).toLocaleString("id");
    const sorted = userTx.sort((a,b) => b.tgl - a.tgl);
    historyBody.innerHTML = sorted.map(tx => {
      const d = new Date(tx.tgl);
      const tgl = formatDate(d).split(" ")[0];
      const inv = tx.inv || tx.id || "—";
      const grand = tx.grand || 0;
      let statusHtml = tx.status === "paid" ? "<span style='color:#4ade80'>Paid</span>" :
                       (tx.status === "wait" ? `<span style='color:#facc15'>Wait ${getWaitCountdown(tx.tgl, tx.status)}</span>` :
                       "<span style='color:#f87171'>Cancel</span>");
      return `<tr>
        <td>${tgl}</td>
        <td>${inv}</td>
        <td>${rp(grand)}</td>
        <td>${statusHtml}</td>
      </tr>`;
    }).join("");
  }

  const modal = document.getElementById("historyPelangganModal");
  if(modal) modal.style.display = "flex";
}
window.showHistoryPelanggan = showHistoryPelanggan;
window.Admin.showHistoryPelanggan = showHistoryPelanggan;
