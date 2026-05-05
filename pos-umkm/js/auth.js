// auth.js

let currentUser = null;
let sessionTimeout = null;
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const defaultAdminPIN = "123456";

async function initAuth() {
  const adminPinSetting = await db.settings.get('admin_pin');
  if (!adminPinSetting) {
    await db.settings.put({ key: 'admin_pin', value: CryptoJS.MD5(defaultAdminPIN).toString() });
  }

  const session = localStorage.getItem('pos_session');
  if (session) {
    const data = JSON.parse(session);
    if (Date.now() < data.expiresAt) {
      currentUser = data.user;
      resetSessionTimer();
      renderApp();
      return;
    } else {
      logout();
    }
  }

  renderLogin();
}

function renderLogin() {
  const loginPage = document.getElementById('page-login');
  loginPage.innerHTML = `
    <div class="min-h-[80vh] flex flex-col justify-center items-center px-6">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-6 shadow-glow">
        <span class="text-white text-2xl font-bold">POS</span>
      </div>
      <h2 class="text-2xl font-bold text-slate-800 mb-2">Selamat Datang</h2>
      <p class="text-slate-500 text-sm mb-8 text-center">Masukkan PIN Anda untuk masuk ke aplikasi.</p>

      <div class="w-full max-w-xs">
        <div class="flex gap-2 justify-center mb-6" id="pinDots">
          <div class="w-4 h-4 rounded-full bg-slate-200"></div>
          <div class="w-4 h-4 rounded-full bg-slate-200"></div>
          <div class="w-4 h-4 rounded-full bg-slate-200"></div>
          <div class="w-4 h-4 rounded-full bg-slate-200"></div>
          <div class="w-4 h-4 rounded-full bg-slate-200"></div>
          <div class="w-4 h-4 rounded-full bg-slate-200"></div>
        </div>

        <input type="password" id="inputPIN" class="hidden" maxlength="6">

        <div class="grid grid-cols-3 gap-4 mb-6">
          ${[1,2,3,4,5,6,7,8,9].map(n =>
            `<button onclick="addPin('${n}')" class="h-14 rounded-2xl bg-white shadow-card hover:bg-indigo-50 active:scale-95 text-xl font-semibold text-slate-700 transition-all">${n}</button>`
          ).join('')}
          <button onclick="clearPin()" class="h-14 rounded-2xl bg-red-50 hover:bg-red-100 active:scale-95 text-red-500 flex items-center justify-center transition-all">
            <i data-lucide="delete"></i>
          </button>
          <button onclick="addPin('0')" class="h-14 rounded-2xl bg-white shadow-card hover:bg-indigo-50 active:scale-95 text-xl font-semibold text-slate-700 transition-all">0</button>
          <button onclick="submitPin()" class="h-14 rounded-2xl bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-glow">
            <i data-lucide="check"></i>
          </button>
        </div>
        <p class="text-xs text-center text-slate-400">Default PIN Admin: 123456</p>
      </div>
    </div>
  `;
  lucide.createIcons({ nodes: [loginPage] });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  loginPage.classList.add('active');
  document.getElementById('bottomNav').style.display = 'none';
  document.querySelector('header').style.display = 'none';
}

let currentPin = '';

function addPin(num) {
  if (currentPin.length < 6) {
    currentPin += num;
    updatePinUI();
  }
}

function clearPin() {
  currentPin = currentPin.slice(0, -1);
  updatePinUI();
}

function updatePinUI() {
  const dots = document.getElementById('pinDots').children;
  for (let i = 0; i < 6; i++) {
    if (i < currentPin.length) {
      dots[i].className = "w-4 h-4 rounded-full bg-indigo-500 shadow-glow-sm";
    } else {
      dots[i].className = "w-4 h-4 rounded-full bg-slate-200";
    }
  }
}

async function submitPin() {
  if (currentPin.length < 4) {
    showToast("PIN terlalu pendek", "warning");
    return;
  }

  const hash = CryptoJS.MD5(currentPin).toString();
  const adminPin = await db.settings.get('admin_pin');

  if (adminPin && adminPin.value === hash) {
    loginSuccess({ id: 1, name: 'Admin', role: 'admin' });
  } else {
    showToast("PIN Salah", "error");
    currentPin = '';
    updatePinUI();
  }
}

function loginSuccess(user) {
  currentUser = user;
  localStorage.setItem('pos_session', JSON.stringify({
    user: user,
    expiresAt: Date.now() + SESSION_DURATION
  }));
  resetSessionTimer();
  currentPin = '';
  showToast("Berhasil login", "success");

  document.getElementById('bottomNav').style.display = 'block';
  document.querySelector('header').style.display = 'block';
  renderApp(); // Navigate to dashboard
}

function logout() {
  currentUser = null;
  localStorage.removeItem('pos_session');
  if (sessionTimeout) clearTimeout(sessionTimeout);
  renderLogin();
}

function resetSessionTimer() {
  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => {
    showToast("Sesi berakhir, silakan login kembali", "warning");
    logout();
  }, SESSION_DURATION);
}

document.getElementById('btnLogout').addEventListener('click', logout);
