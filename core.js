/* =========================================
   CORE.JS — SECURITY ENGINE v4.0
   Unified License | Single Source of Truth for getLimit()
   IndexedDB storage | Device-bound session | Full-field signing
   ========================================= */
"use strict";

/* ================= TIER LIMITS (single source of truth) ================= */
const TIER_LIMITS = {
  free:      { p: 10,     k: 2      },
  basic:     { p: 50,     k: 5      },
  pro:       { p: 100,    k: 10     },
  premium:   { p: 500,    k: 20     },
  ultimate:  { p: 1000,   k: 50     },
  developer: { p: 999999, k: 999999 }
};

/* ================= SUPABASE CONFIG ================= */
const SUPABASE_URL  = localStorage.getItem("_sb_url")  || "";
const SUPABASE_ANON = localStorage.getItem("_sb_anon") || "";

/* ================= ENV CONFIG ================= */
// 👉 ganti ke "PROD" saat rilis
const ENV = "DEV";

// [Line 11]
/* ================= DEV MODE (FINAL FIX) ================= */
// [Line 1]
let _devMode = false;

// [Line 3]
function isDevMode(){
  return ENV === "DEV" && _devMode;
}

// [Line 7]
function activateDev(){
  if(ENV !== "DEV"){
    console.warn("Dev mode disabled in production");
    return false;
  }

  if(_devMode){
    console.warn("Dev already active");
    return true;
  }

  _devMode = true;
  console.log("Developer Mode ON");
  return true;
}

// [Line 20]
function deactivateDev(){
  _devMode = false;
}


/* ================= DEVICE ID (HARDENED) ================= */
// [Line 1]
async function generateDeviceFingerprint(){
  const raw =
    navigator.userAgent +
    screen.width +
    screen.height +
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));

  return "DEV-" + Array.from(new Uint8Array(buf))
    .map(b=>b.toString(16).padStart(2,"0"))
    .join("")
    .slice(0,24)
    .toUpperCase();
}

// [Line 15]
async function getDeviceId(){
  let id = localStorage.getItem("_deviceId");
  let backup = localStorage.getItem("_deviceId_backup");

  // 🔁 kalau hilang tapi ada backup → restore
  if(!id && backup){
    localStorage.setItem("_deviceId", backup);
    return backup;
  }

  // 🆕 generate baru
  if(!id){
    id = await generateDeviceFingerprint();
    localStorage.setItem("_deviceId", id);
    localStorage.setItem("_deviceId_backup", id);
  }

  return id;
}

/* ================= SHA-256 ================= */
async function sha256(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ================= PIN ================= */
const PIN_DEFAULT_PLAIN = "123456";
async function hashPin(plain){ return await sha256("LIDOSADEGA_SALT_2025_" + plain); }

async function initPinSystem(){
  if(!localStorage.getItem("_pinHash") && !localStorage.getItem("_pinFirstRun")){
    localStorage.setItem("_pinHash", await hashPin(PIN_DEFAULT_PLAIN));
    localStorage.setItem("_pinFirstRun","pending");
  }
}

async function verifyPin(inputPin){
  return localStorage.getItem("_pinHash") === await hashPin(inputPin);
}

async function savePinHashed(newPin){
  localStorage.setItem("_pinHash", await hashPin(newPin));
  localStorage.removeItem("_pinFirstRun");
  localStorage.removeItem("ownerPin");
  showToastSafe("PIN berhasil diubah");
}

function isPinFirstRun(){ return localStorage.getItem("_pinFirstRun") === "pending"; }

/* ================= BRUTE-FORCE ================= */
const PIN_MAX_FAIL=5, PIN_LOCKOUT_MS=5*60*1000;
function getPinFailState(){ return JSON.parse(localStorage.getItem("_pinFail")||'{"count":0,"lockedAt":0}'); }
function setPinFailState(s){ localStorage.setItem("_pinFail", JSON.stringify(s)); }

function isPinLocked(){
  const s=getPinFailState();
  if(s.count>=PIN_MAX_FAIL){ if(Date.now()-s.lockedAt<PIN_LOCKOUT_MS) return true; setPinFailState({count:0,lockedAt:0}); }
  return false;
}
function recordPinFail(){ const s=getPinFailState(); s.count++; if(s.count>=PIN_MAX_FAIL) s.lockedAt=Date.now(); setPinFailState(s); }
function resetPinFail(){ setPinFailState({count:0,lockedAt:0}); }
function getPinLockRemaining(){ const s=getPinFailState(); return Math.max(0,Math.ceil((PIN_LOCKOUT_MS-(Date.now()-s.lockedAt))/1000)); }

/* ================= WA BINDING ================= */
async function bindWaToDevice(waNumber){
  const clean=waNumber.replace(/\D/g,""); if(!clean) return;
  const deviceId = await getDeviceId();
localStorage.setItem("_waBind", await sha256("WA_BIND_"+clean+"_"+deviceId));
  localStorage.setItem("_waNumber", clean);
}
async function verifyWaBind(waNumber){
  const stored=localStorage.getItem("_waBind"); if(!stored) return true;
  const deviceId = await getDeviceId();
return (await sha256("WA_BIND_"+waNumber.replace(/\D/g,"")+"_"+deviceId)) === stored;
}

/* ================= LICENSE CACHE ================= */
let _licenseCache=null;
const LICENSE_MIN_MS=6*3600*1000, LICENSE_MAX_MS=10*3600*1000;
function getNextCheckInterval(){ let s=+localStorage.getItem("_licNextInterval")||0; if(s) return s; const ms=LICENSE_MIN_MS+Math.random()*(LICENSE_MAX_MS-LICENSE_MIN_MS); localStorage.setItem("_licNextInterval",Math.round(ms)); return ms; }
function resetNextCheckInterval(){ localStorage.removeItem("_licNextInterval"); }

/* ================= LICENSE CACHE (HARDENED) ================= */

async function _syncLicenseCache(tier, extra){
  const now = Date.now();

  const base = Object.assign({
    ok: true,
    tier,
    exp: now + (7 * 24 * 60 * 60 * 1000)
  }, extra || {});

  // 🔐 SIGN DATA
  const sig = await signData(base);

  const result = {
    ...base,
    sig
  };

  _licenseCache = result;

  localStorage.setItem("_licCache", JSON.stringify(result));
  localStorage.setItem("_licCheckedAt", now);

  localStorage.setItem("license", JSON.stringify({
    type: tier,
    lastCheck: now
  }));

  updateLicenseBadge(tier);
}

/* ================= FETCH ================= */
async function fetchLicenseFromServer(licKey,deviceId){
  if(!SUPABASE_URL||!SUPABASE_ANON) return null;
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/bind_device`,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":"Bearer "+SUPABASE_ANON},body:JSON.stringify({input_key:licKey,input_device:deviceId})});
    if(!res.ok) return null;
    return await res.json();
  }catch(e){return null;}
}

/* ================= CHECK LICENSE ================= */
async function checkLicense(force=false){
  if(isDevMode()){
  await _syncLicenseCache("developer");
  return {ok:true,tier:"developer"};
}
  const licKey=localStorage.getItem("licenseKey");
  if(!licKey) return {ok:false,msg:"no_license"};
  const now=Date.now(), lastAt=+localStorage.getItem("_licCheckedAt")||0;
  if(!force&&_licenseCache&&(now-lastAt<getNextCheckInterval())) return _licenseCache;
  const result=await fetchLicenseFromServer(licKey, await getDeviceId());
  if(result){
    if(result.ok) await _syncLicenseCache(result.tier,result);
    else{ _licenseCache=result; localStorage.setItem("_licCache",JSON.stringify(result)); }
    if(!result.ok){
      const msgs={device_limit:"Perangkat melebihi batas lisensi.",expired:"Lisensi kadaluarsa.",inactive:"Lisensi tidak aktif."};
      showLicenseBlocker(msgs[result.msg]||"Lisensi tidak valid.");
    }
    return result;
  }
const cached = JSON.parse(localStorage.getItem("_licCache")||"null");

if(cached && cached.ok){
  // 🔐 VALIDASI SIGNATURE
  const {sig, ...pure} = cached;
  const valid = sig && await verifyData(pure, sig);

  if(!valid){
    console.warn("License tampered!");
    localStorage.removeItem("_licCache");
  } else if(cached.exp && cached.exp > Date.now()){
    _licenseCache = cached;
    return cached;
  } else {
    console.warn("License cache expired");
  }
}

// Tidak ada cache valid & server tidak bisa dihubungi
// Jika tier pernah ada (legacy), beri grace mode FREE
const legacyTier = (() => {
  try {
    const l = JSON.parse(localStorage.getItem("license")||"null");
    return l && l.type ? l.type.toLowerCase().trim() : null;
  } catch(e){ return null; }
})();
if(legacyTier && TIER_LIMITS[legacyTier]) {
  console.warn("[License] Offline grace: using legacy tier", legacyTier);
  return { ok:true, tier:legacyTier, offline:true };
}
return {ok:false, msg:"offline_no_cache"};
}

async function activateLicense(licKey){
  localStorage.setItem("licenseKey",licKey);
  const result=await fetchLicenseFromServer(licKey, await getDeviceId());
  if(result&&result.ok){
  await _syncLicenseCache(result.tier,result); showToastSafe("Lisensi "+(result.tier||"").toUpperCase()+" aktif!"); return true; }
  showToastSafe("Aktivasi gagal: "+(result?.msg||"server error"));
  return false;
}

/* ================= TIER & LIMITS ================= */
function getCurrentTier(){
  if(isDevMode()) return "developer";
  if(_licenseCache&&_licenseCache.ok&&_licenseCache.tier) return _licenseCache.tier;
  const nc=JSON.parse(localStorage.getItem("_licCache")||"null");
  if(nc&&nc.ok&&nc.tier) return nc.tier;
  const leg=JSON.parse(localStorage.getItem("license")||"null");
  if(leg&&leg.type) return leg.type.toLowerCase().trim();
  return "free";
}

/* THE canonical getLimit — exposed globally for admin.js & app.js */
function getLimit(){
  const tier=getCurrentTier();
  return TIER_LIMITS[tier]||TIER_LIMITS.free;
}

function updateLicenseBadge(tier){
  const t = (tier||"free").toLowerCase().trim();
  const label = t.toUpperCase();
  const icon  = {free:"🔓",basic:"🔵",pro:"✅",ultra:"⭐",developer:"👑",offline:"📴"}[t] || "🔓";
  const els   = [document.getElementById("statusLicense"), document.getElementById("licBadgePanel")];
  els.forEach(el=>{
    if(!el) return;
    el.className = `license-badge ${t}`;
    el.innerHTML = `${icon} ${label}`;
  });
}

/* ================= LICENSE BLOCKER ================= */
function showLicenseBlocker(msg){
  let div=document.getElementById("licenseBlocker"); if(div) div.remove();
  div=document.createElement("div"); div.id="licenseBlocker";
  div.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f1f5f9;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;padding:24px;";
  div.innerHTML=`<div style="font-size:48px;margin-bottom:16px">🔒</div><h2 style="margin-bottom:8px">Akses Diblokir</h2><p style="color:#94a3b8;margin-bottom:24px">${msg}</p><button onclick="document.getElementById('licenseBlocker').remove();openLicenseModal()" style="background:#5cf17b;color:#0b1020;border:none;padding:12px 24px;border-radius:10px;font-weight:700;cursor:pointer">🔑 Masukkan Lisensi</button>`;
  document.body.appendChild(div);
}

/* ================= LICENSE MODAL ================= */
function openLicenseModal(){
  let m=document.getElementById("licenseModal");
  if(m){m.style.display="flex";return;}
  m=document.createElement("div"); m.id="licenseModal";
  m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99998;display:flex;align-items:center;justify-content:center";
  m.innerHTML=`<div style="background:#121a30;border:1px solid #273251;border-radius:16px;padding:24px;width:340px;max-width:94vw"><h3 style="margin-bottom:4px">🔑 Aktivasi Lisensi</h3><p style="color:#94a3b8;font-size:13px;margin-bottom:16px">Device: <code style="color:#5cf17b;font-size:11px">${getDeviceIdSync().slice(0,20)}</code></p><input id="licKeyInput" placeholder="ABCD-EFGH-IJKL" style="width:100%;padding:10px;background:#0b1020;border:1px solid #273251;border-radius:8px;color:#fff;margin-bottom:10px;font-size:14px;text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"><button onclick="doActivateLicense()" style="width:100%;background:#5cf17b;color:#0b1020;border:none;padding:12px;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:8px">Aktifkan</button><button onclick="document.getElementById('licenseModal').style.display='none'" style="width:100%;background:transparent;border:1px solid #273251;color:#94a3b8;padding:10px;border-radius:8px;cursor:pointer">Tutup</button></div>`;
  document.body.appendChild(m);
}


function getDeviceIdSync(){
  let id = localStorage.getItem("_deviceId");

  if(!id){
    // fallback sementara
    id = "DEV-TEMP-" + crypto.getRandomValues(new Uint8Array(12))
  .map(b=>b.toString(16).padStart(2,"0"))
  .join("")
  .toUpperCase();
    localStorage.setItem("_deviceId", id);
  }

  return id;
}

async function doActivateLicense(){
  const key=(document.getElementById("licKeyInput")?.value||"").trim().toUpperCase();
  if(!key){showToastSafe("Masukkan license key");return;}
  const ok=await activateLicense(key);
  if(ok){
    const m=document.getElementById("licenseModal"); if(m) m.style.display="none";
    const b=document.getElementById("licenseBlocker"); if(b) b.remove();
  }
}

/* ================= DEVELOPER PANEL (CLEAN) ================= */

function openDevPanel(){
	  if(ENV !== "DEV"){
    console.warn("Dev panel disabled in production");
    return;
  }
  let m = document.getElementById("devPanel");
  if(m){
    m.style.display = "flex";
    return;
  }


  m = document.createElement("div");
  m.id = "devPanel";
  m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99997;display:flex;align-items:center;justify-content:center";

  // [Line 12]
  const tier = getCurrentTier();
  const limit = getLimit();
  const devActive = isDevMode();

  // [Line 16] ===== BAGIAN STATUS =====
  let statusBlock = `
    <div style="background:#121a30;border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:#94a3b8">Device ID</span>
        <code style="color:#5cf17b;font-size:11px">${getDeviceIdSync().slice(0,16)}...</code>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:#94a3b8">Mode</span>
        <b style="color:${devActive ? "#5cf17b" : "#f59e0b"}">
          ${devActive ? "DEVELOPER" : "USER ("+tier.toUpperCase()+")"}
        </b>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#94a3b8">Limit</span>
        <span style="color:#f1f5f9">
          ${limit.p>=999999?"∞":limit.p} produk /
          ${limit.k>=999999?"∞":limit.k} kategori
        </span>
      </div>
    </div>
  `;

  // [Line 40] ===== BAGIAN ACTION DEV =====
  let devBlock = devActive
    ? `
      <div style="background:#0f2a1a;border:1px solid #5cf17b;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#5cf17b">
        ✅ Developer Mode AKTIF — limit UNLIMITED
      </div>
      <button onclick="deactivateDev();document.getElementById('devPanel').remove()"
        style="width:100%;background:#ef4444;color:#fff;border:none;padding:11px;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:8px">
        🔒 Nonaktifkan Developer Mode
      </button>
    `
    : `
      <button onclick="tryActivateDev()"
        style="width:100%;background:#5cf17b;color:#0b1020;border:none;padding:11px;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:8px">
        🔓 Aktifkan Developer Mode
      </button>
    `;

  // [Line 60] ===== BAGIAN CONFIG =====
  let configBlock = `
    <div style="border-top:1px solid #273251;padding-top:12px;margin-top:4px">
      <label style="display:block;color:#94a3b8;font-size:12px;margin-bottom:6px">Supabase URL</label>
      <input id="sbUrlInput" value="${SUPABASE_URL}" placeholder="https://xxx.supabase.co"
        style="width:100%;padding:8px;background:#0b1020;border:1px solid #273251;border-radius:6px;color:#fff;margin-bottom:8px;font-size:12px">

      <label style="display:block;color:#94a3b8;font-size:12px;margin-bottom:6px">Supabase Anon Key</label>
      <input id="sbAnonInput" value="${SUPABASE_ANON}" type="password" placeholder="eyJ..."
        style="width:100%;padding:8px;background:#0b1020;border:1px solid #273251;border-radius:6px;color:#fff;margin-bottom:8px;font-size:12px">

      <button onclick="saveSupabaseConfig()"
        style="width:100%;background:#334155;color:#fff;border:none;padding:9px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">
        💾 Simpan Konfigurasi
      </button>
    </div>
  `;

  // [Line 80] ===== BAGIAN TOOLS =====
  let toolsBlock = `
    <div style="border-top:1px solid #273251;padding-top:12px;margin-top:12px">
      <button onclick="Core.checkLicense(true).then(()=>showToastSafe('Lisensi dicek ulang'))"
        style="width:100%;background:#1e3a5f;color:#4dd8ff;border:1px solid #4dd8ff;padding:9px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:6px">
        🔄 Force Check Lisensi
      </button>

      <button onclick="openLicenseModal()"
        style="width:100%;background:#1e293b;color:#94a3b8;border:1px solid #273251;padding:9px;border-radius:6px;cursor:pointer;font-size:13px">
        🔑 Ganti License Key
      </button>
    </div>
  `;

  // [Line 100] ===== FINAL RENDER =====
  m.innerHTML = `
    <div style="background:#0a1020;border:2px solid #5cf17b;border-radius:16px;padding:24px;width:400px;max-width:96vw;font-family:'Plus Jakarta Sans',sans-serif">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#5cf17b">🛠️ Developer Panel</h3>
        <button onclick="document.getElementById('devPanel').style.display='none'"
          style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">✕</button>
      </div>

      ${statusBlock}
      ${devBlock}
      ${configBlock}
      ${toolsBlock}

    </div>
  `;

  // [Line 120]
  document.body.appendChild(m);
}

function tryActivateDev(){
  if(ENV !== "DEV"){
    showToastSafe("Dev mode tidak tersedia");
    return;
  }

  activateDev();

  document.getElementById("devPanel").remove();
  showToastSafe("Developer Mode AKTIF!");
  updateLicenseBadge("developer");

  if(window.Admin && Admin.renderOwnerProdukList){
    Admin.renderOwnerProdukList();
  }
}

function saveSupabaseConfig(){
  localStorage.setItem("_sb_url",(document.getElementById("sbUrlInput")?.value||"").trim());
  localStorage.setItem("_sb_anon",(document.getElementById("sbAnonInput")?.value||"").trim());
  showToastSafe("Konfigurasi Supabase disimpan. Reload halaman.");
}

/* ================= TOAST ================= */
function showToastSafe(msg){
  if(window.showToast){showToast(msg);return;}
  const el=document.getElementById("toast");
  if(!el){console.log("TOAST:",msg);return;}
  el.innerText=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}

/* ================= SCHEDULER ================= */
let _licenseTimer=null;
function scheduleLicenseCheck(){
  if(_licenseTimer) clearTimeout(_licenseTimer);
  _licenseTimer=setTimeout(async()=>{ await checkLicense(true); resetNextCheckInterval(); scheduleLicenseCheck(); },getNextCheckInterval());
}

/* ================= INIT ================= */
async function initCore(){
  await initPinSystem();
  const oldPin=localStorage.getItem("ownerPin");
  if(oldPin&&!localStorage.getItem("_pinHash")){ localStorage.setItem("_pinHash",await hashPin(oldPin)); localStorage.removeItem("ownerPin"); }

  /* Migrate legacy license format */
  const legacyLic=JSON.parse(localStorage.getItem("license")||"null");
  if(legacyLic&&legacyLic.type&&!localStorage.getItem("_licCache")){
    const tier=legacyLic.type.toLowerCase().trim();
    if(TIER_LIMITS[tier]) await _syncLicenseCache(tier);
  }

  const result=await checkLicense();
  if(result&&result.ok) updateLicenseBadge(result.tier);
  scheduleLicenseCheck();
  const wa=localStorage.getItem("ownerWa");
  if(wa&&!localStorage.getItem("_waBind")) await bindWaToDevice(wa);
}

/* ================= DEVELOPER TRIGGER (00990099 + BACKSPACE×3) ================= */
// Hidden keyboard sequence — only active in DEV env, no PIN conflict
let _devSeqBuf = "", _devSeqTimer = null, _devBsCount = 0;
const _DEV_CODE = "00990099";

function _resetDevSeq(){
  _devSeqBuf = "";
  _devBsCount = 0;
  clearTimeout(_devSeqTimer);
}

function primeDevSequence(){
  if(ENV !== "DEV") return false;
  _devSeqBuf = _DEV_CODE;
  _devBsCount = 0;
  clearTimeout(_devSeqTimer);
  _devSeqTimer = setTimeout(_resetDevSeq, 4000);
  return true;
}

document.addEventListener("keydown", function _devKeyHandler(e){
  if(ENV !== "DEV") return; // 🔐 HARD STOP in PROD

  // Only respond when no input is focused (avoid PIN field conflict)
  const tag = document.activeElement ? document.activeElement.tagName : "";
  const isInput = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT");

  if(e.key === "Backspace"){
    if(_devSeqBuf === _DEV_CODE){
      _devBsCount++;
      clearTimeout(_devSeqTimer);
      _devSeqTimer = setTimeout(_resetDevSeq, 2000);
      if(_devBsCount >= 3){
        _resetDevSeq();
        activateDev();
        openDevPanel();
      }
      return;
    }
    _resetDevSeq();
    return;
  }

  if(isInput) return; // don't capture typing in PIN / form

  if(/^[0-9]$/.test(e.key)){
    clearTimeout(_devSeqTimer);
    _devSeqBuf += e.key;
    if(_devSeqBuf.length > _DEV_CODE.length) _devSeqBuf = _devSeqBuf.slice(-_DEV_CODE.length);
    _devSeqTimer = setTimeout(_resetDevSeq, 2000);
    _devBsCount = 0; // reset BACKSPACE counter if new digit typed
  } else {
    _resetDevSeq();
  }
});

/* ================= LICENSE INTEGRITY HELPER ================= */
async function verifyLicenseIntegrity(){
  const cached = JSON.parse(localStorage.getItem("_licCache")||"null");
  if(!cached) return { ok:false, reason:"no_cache" };
  if(!cached.sig) return { ok:false, reason:"no_sig" };
  const {sig, ...pure} = cached;
  const valid = await verifyData(pure, sig);
  if(!valid) return { ok:false, reason:"tampered" };
  if(cached.exp && cached.exp < Date.now()) return { ok:false, reason:"expired" };
  return { ok:true, tier: cached.tier };
}

/* ================= DEVICE-BOUND OWNER SESSION ================= */
// Token stored in sessionStorage; value = sha256(deviceId + secret + timestamp-bucket)
// Bucket = hourly — so token auto-expires when tab closes or after >1h idle
const _SESSION_KEY = "_ownerSessToken";
const _SESSION_SECRET = "LIDOSADEGA_SESS_V1";

async function createOwnerSession(){
  const deviceId = await getDeviceId();
  const bucket   = Math.floor(Date.now() / (60 * 60 * 1000)); // 1-hour bucket
  const raw      = _SESSION_SECRET + "|" + deviceId + "|" + bucket;
  const token    = await sha256(raw);
  sessionStorage.setItem(_SESSION_KEY, token);
  return token;
}

async function verifyOwnerSession(){
  const stored = sessionStorage.getItem(_SESSION_KEY);
  if(!stored) return false;
  const deviceId = await getDeviceId();
  // Accept current bucket OR previous bucket (grace period for hour boundary)
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000));
  for(const b of [bucket, bucket - 1]){
    const raw   = _SESSION_SECRET + "|" + deviceId + "|" + b;
    const check = await sha256(raw);
    if(check === stored) return true;
  }
  return false;
}

function destroyOwnerSession(){
  sessionStorage.removeItem(_SESSION_KEY);
}

/* ================= INDEXEDDB LAYER ================= */
const IDB_NAME    = "tokowa_db";
const IDB_VERSION = 1;
let _idb = null;

function openIDB(){
  if(_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains("products")){
        db.createObjectStore("products", { keyPath:"i" });
      }
      if(!db.objectStoreNames.contains("transaksi")){
        db.createObjectStore("transaksi", { keyPath:"id", autoIncrement:false });
      }
    };
    req.onsuccess = e=>{ _idb = e.target.result; resolve(_idb); };
    req.onerror   = e=>reject(e.target.error);
  });
}

async function idbGetAll(storeName){
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx  = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = ()=>resolve(req.result||[]);
    req.onerror   = e=>reject(e.target.error);
  });
}

async function idbPutAll(storeName, items){
  if(!items||!items.length){ await idbClear(storeName); return; }
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx    = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    items.forEach(item=>store.put(item));
    tx.oncomplete = resolve;
    tx.onerror    = e=>reject(e.target.error);
  });
}

async function idbClear(storeName){
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx  = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = resolve;
    tx.onerror    = e=>reject(e.target.error);
  });
}

async function idbDelete(storeName, key){
  const db = await openIDB();
  return new Promise((resolve, reject)=>{
    const tx  = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = resolve;
    tx.onerror    = e=>reject(e.target.error);
  });
}

/* Migrate localStorage → IndexedDB (one-time, non-destructive) */
async function migrateToIDB(){
  const migrated = localStorage.getItem("_idbMigrated");
  if(migrated) return;

  try{
    // Products
    const rawP = JSON.parse(localStorage.getItem("products")||"[]");
    if(rawP.length > 0){
      const normed = rawP.map(p => p.i !== undefined ? p : {
        i: p.id||p.i, n: p.name||p.n, p: p.price||p.p,
        m: p.modal||p.m||0, k: p.kategori||p.k||"Umum", g: p.img||p.g||""
      });
      await idbPutAll("products", normed);
    }
    // Transactions
    const rawT = JSON.parse(localStorage.getItem("transaksi")||"[]");
    if(rawT.length > 0) await idbPutAll("transaksi", rawT);

    localStorage.setItem("_idbMigrated", "1");
    console.log("[IDB] Migration complete. Products:", rawP.length, "Transactions:", rawT.length);
  }catch(e){
    console.warn("[IDB] Migration failed, will retry next load:", e);
  }
}

window.Core={
  getLimit, getCurrentTier, checkLicense, activateLicense,
  isDevMode, activateDev, deactivateDev,
  getDeviceId, verifyPin, savePinHashed, hashPin,
  isPinFirstRun, isPinLocked, recordPinFail, resetPinFail, getPinLockRemaining,
  bindWaToDevice, verifyWaBind,
  openDevPanel, openLicenseModal, updateLicenseBadge, verifyLicenseIntegrity,
  // NEW v4
  createOwnerSession, verifyOwnerSession, destroyOwnerSession,
  openIDB, idbGetAll, idbPutAll, idbClear, idbDelete,
  signData, verifyData,
  primeDevSequence,
  TIER_LIMITS
};

window.getLimit           = getLimit;
window.getCurrentTier     = getCurrentTier;
window.openDevPanel       = openDevPanel;
window.openLicenseModal   = openLicenseModal;
window.doActivateLicense  = doActivateLicense;
window.tryActivateDev     = tryActivateDev;
window.saveSupabaseConfig = saveSupabaseConfig;
window.deactivateDev      = deactivateDev;

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded", ()=>{ initCore(); migrateToIDB(); });
} else {
  initCore(); migrateToIDB();
}
console.log("CORE SECURITY ENGINE v4.0 READY");


/* ================= ANTI TAMPER (DEVICE-BOUND) ================= */
/* signData: signs arbitrary payload (license, tx, product) device-bound */
async function signData(data){
  const deviceId = await getDeviceId();
  const secret   = "TOKO_WA_V1_" + deviceId.slice(0,12);
  const sorted   = JSON.stringify(sortObject(data));
  return await sha256(sorted + "|" + secret);
}

/* signProduct: sign full product fields {i,n,p,m,k} — prevents partial-field forgery */
async function signProduct(prod){
  const payload = sortObject({ i: prod.i, n: prod.n, p: prod.p, m: prod.m||0, k: prod.k||"Umum" });
  return await signData(payload);
}

/* verifyProduct: verify full-field product signature */
async function verifyProduct(prod){
  if(!prod || !prod.sig) return false;
  const payload  = sortObject({ i: prod.i, n: prod.n, p: prod.p, m: prod.m||0, k: prod.k||"Umum" });
  return await verifyData(payload, prod.sig);
}

function sortObject(obj){
  return Object.keys(obj)
    .sort()
    .reduce((r,k)=>{
      r[k]=obj[k];
      return r;
    },{});
}

async function verifyData(data, sig){
  const check = await signData(data);
  return check === sig;
}



window.formatDate = function(d) {
  if(!(d instanceof Date)) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

window.getWaitCountdown = function(txTgl, status) {
  if(status !== "wait") return "";
  const waitMinutes = parseInt(localStorage.getItem("waitTimer") || "10", 10);
  if(waitMinutes <= 0) return "";
  const expiry = txTgl + waitMinutes * 60 * 1000;
  const now = Date.now();
  if(now > expiry) return "Expired";
  const diff = expiry - now;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};
