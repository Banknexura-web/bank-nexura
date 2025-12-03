function forceInfiniteBalance() {
  if (currentUser === "admin" && users["admin"]) {
    users["admin"].balance = Number.MAX_SAFE_INTEGER; // en lugar de "INF_BALANCE"
    const el = document.getElementById("userBalance") || document.getElementById("balanceView");
    if (el) el.textContent = "$∞"; // solo visual
  }
}

/* ===== Persistencia y estructura ===== */
const LS_KEY = 'simBankUsers_v3_nosms';
let users = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); // estructura en storage
let currentUser = null;
let cvvShown = false;
// Si hay usuario guardado, lo restauramos
if (localStorage.getItem("currentUser")) {
  currentUser = localStorage.getItem("currentUser");
}

// Si el usuario actual no existe más en los datos, limpiar sesión
if (currentUser && !users[currentUser]) {
  localStorage.removeItem("currentUser");
  currentUser = null;
}

function saveUsers() {
  localStorage.setItem("users", JSON.stringify(users));
}


/* UTIL: guarda todo */
function saveAll() {
  let users = JSON.parse(localStorage.getItem("users")) || {
    admin: { name: "Administrador", balance: "INF_BALANCE", transactions: [] }
  };
  let currentUser = null;

  function saveUsers() {
    localStorage.setItem("users", JSON.stringify(users));
  }

  // --- 👑 Configurar administrador con saldo infinito y Trust Wallet ---
  if (!users["admin"]) {
    users["admin"] = {
      name: "Administrador",
      pass: "1234",
      bank: "Trust Wallet",
      balance: "INF_BALANCE", // saldo infinito
      card: {
        number: "0000 0000 0000 0000",
        exp: "--/--",
        cvv: "000"
      }
    };
    saveUsers && saveUsers(); // por si existe la función
  }


  // --- 🧭 Forzar que se actualice el dashboard cuando entra el admin ---
  document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => {
      if (currentUser === "admin") {
        forceInfiniteBalance();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/* UTIL: format number groups 4 */
function fmtCard(n) {
  return n.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
function money(n) {
  if (!isFinite(n)) return "$∞";
  if (n === undefined || n === null || isNaN(n)) return "$0";
  return "$" + Number(n).toLocaleString("es-CO");
}




/* Genera tarjeta determinística usando user+doc */
function generateCardFromUser(username, doc) {
  const seed = (username + '::' + doc).split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  let num = '';
  let x = seed;
  for (let i = 0; i < 12; i++) { x = (x * 1664525 + 1013904223) >>> 0; num += String((x % 10)); }
  const last4 = (doc.replace(/\D/g, '').slice(-4).padStart(4, String((seed % 9) + 1)));
  const full = num + last4; // 16 dígitos
  const d = new Date();
  const year = d.getFullYear() + 3 + (seed % 4);
  const month = String((seed % 12) + 1).padStart(2, '0');
  const cvv = String((seed % 900) + 100);
  return { number: full, cvv: cvv, exp: month + '/' + String(year).slice(-2) };
}

/* Mostrar/ocultar vistas */
function showRegister() { document.getElementById('loginView').style.display = 'none'; document.getElementById('registerView').style.display = 'block'; }
function showLogin() { document.getElementById('registerView').style.display = 'none'; document.getElementById('loginView').style.display = 'block'; }

/* Registro: ahora requiere imagen del documento y prefijo+tel */
async function registerAccount() {
  const name = document.getElementById('rName').value.trim();
  const doc = document.getElementById('rDoc').value.trim();
  const phonePrefix = document.getElementById('rCountry').value;
  const phoneLocal = document.getElementById('rPhone').value.trim();
  const phone = phonePrefix + ' ' + phoneLocal;
  const user = document.getElementById('rUser').value.trim().toLowerCase();
  const pass = document.getElementById('rPass').value;
  const bank = document.getElementById('rBank').value;
  const fileInput = document.getElementById('rDocImage');

  if (!name || !doc || !phoneLocal || !user || !pass) { alert('Completa todos los campos.'); return; }
  if (users[user]) { alert('El usuario ya existe. Elige otro.'); return; }
  if (!fileInput.files || fileInput.files.length === 0) { alert('Por favor, sube la foto de tu documento.'); return; }

  // Leer imagen como Data URL
  const file = fileInput.files[0];
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (!validTypes.includes(file.type)) {
    alert('Formato inválido. Usa JPG o PNG.');
    return;
  }

  try {
    const dataUrl = await readFileAsDataURL(file);
    // Generar tarjeta y guardar usuario (incluye docImage)
    const card = generateCardFromUser(user, doc);
    users[user] = { name, doc, phone, pass, bank, balance: 0, card, tx: [], docImage: dataUrl };
    saveAll();
    alert('Cuenta creada con éxito. Puedes iniciar sesión.');
    // limpiar inputs
    document.getElementById('rName').value = '';
    document.getElementById('rDoc').value = '';
    document.getElementById('rPhone').value = '';
    document.getElementById('rUser').value = '';
    document.getElementById('rPass').value = '';
    document.getElementById('rDocImage').value = '';
    showLogin();
  } catch (err) {
    console.error(err);
    alert('Error al leer la imagen del documento.');
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Inicio de sesión: genera sesión local (sin SMS) */
function startLogin() {
  const user = document.getElementById('loginUser').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  if (!users[user] || users[user].pass !== pass) { alert('Usuario o contraseña incorrectos'); return; }
  currentUser = user;
  afterLogin();

}


/* Setup UI post-login */
function afterLogin() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('registerView').style.display = 'none';
  document.getElementById('actions').style.display = 'block';
  document.getElementById('status').textContent = 'offline';

  loadCurrentUser();  // <- cargar usuario e historial
  renderDashboard();  // <- actualizar tarjeta y saldo
  renderTransactions();
}

/* Render dashboard, tarjeta y txs */
function renderDashboard() {
  if (!currentUser) return;
  const u = users[currentUser];
  const wrap = document.getElementById('cardWrap');
  wrap.classList.remove('bank-A', 'bank-B', 'bank-C');
  if (u.bank.includes('Andino')) wrap.classList.add('bank-A');
  else if (u.bank.includes('Norte')) wrap.classList.add('bank-B');
  else wrap.classList.add('bank-C');

  document.getElementById('cardBankLabel').textContent = u.bank;
  // Mostrar tipo de banco o Trust Wallet
  if (currentUser === "admin") {
    document.getElementById("bankType").textContent = "Trust Wallet";
    document.getElementById("cardNumber").textContent = "Trust Wallet";
    document.getElementById("cardExp").textContent = "Cuenta verificada";
  } else {
    // aquí va lo normal del resto de usuarios
  }


  // Mostrar número de tarjeta o Trust Wallet
  if (currentUser === "admin") {
    document.getElementById("cardNumber").textContent = "Trust Wallet";
  } else if (u.card && u.card.number) {
    document.getElementById("cardNumber").textContent = fmtCard(u.card.number);
  } else {
    document.getElementById("cardNumber").textContent = "---- ---- ---- ----";
  }

  document.getElementById('cardHolder').textContent = u.name.toUpperCase();
  // Mostrar fecha de vencimiento o Trust Wallet
  if (currentUser === "admin") {
    document.getElementById("cardExp").textContent = "Cuenta verificada";
  } else if (u.card && u.card.exp) {
    document.getElementById("cardExp").textContent = "VENCE " + u.card.exp;
  } else {
    document.getElementById("cardExp").textContent = "VENCE --/--";
  }

  document.getElementById('cvvBadge').textContent =
    cvvShown && u.card && u.card.cvv
      ? ('CVV ' + u.card.cvv)
      : 'CVV •••';

  document.getElementById('welcomeName').textContent = u.name;
  document.getElementById('bankLabelSmall').textContent = u.bank;

  // Actualizar el saldo inmediatamente (no con DOMContentLoaded)
  const balanceEl = document.getElementById("userBalance") || document.getElementById("balanceView");
  if (balanceEl) {
    const userForBalance = users[currentUser];
    if (!userForBalance) {
      balanceEl.textContent = "$0";
    } else {
      balanceEl.textContent = money(userForBalance.balance);
    }
  }
  document.getElementById('docView').textContent = u.doc;

  const txList = document.getElementById('txList'); txList.innerHTML = '';
  if (!u.tx || u.tx.length === 0) {
    txList.innerHTML = '<div style="color:var(--muted); font-size:13px">Sin movimientos</div>';
  } else {
    u.tx.slice().reverse().forEach(t => {
      const el = document.createElement('div'); el.className = 'tx';
      el.innerHTML = `<div class="desc">${t.date} • ${t.type} ${t.counter ? '• ' + t.counter : ''}</div><div class="amount">${t.amountStr}</div>`;
      txList.appendChild(el);
    });
  }
  // --- Asegurar saldo infinito del admin ---
  if (currentUser === "admin") {
    forceInfiniteBalance();
  }

}

/* Mostrar CVV toggle */
function toggleCVV() { cvvShown = !cvvShown; renderDashboard(); }

/* Regenerar tarjeta */
function regenCard() {
  if (!currentUser) return;
  const u = users[currentUser];
  u.card = generateCardFromUser(currentUser, u.doc);
  saveAll();
  alert('Tarjeta regenerada (basada en tus datos).');
  renderDashboard();
}

function transfer() {
  const from = currentUser;
  if (!from || !users[from]) return alert("Usuario no autenticado.");

  const toInput = document.getElementById("transferTo").value.trim().toLowerCase();
  const amount = parseFloat(document.getElementById("transferAmount").value);
  const bank = document.getElementById("transferBank").value;
  const country = document.getElementById("country").value;

  if (!toInput || !amount) return alert("Completa todos los campos.");
  if (!bank || !country) return alert("Selecciona banco y país.");

  const sender = users[from];
  const receiverKey = Object.keys(users).find(u => u.toLowerCase() === toInput);
  if (!receiverKey) return alert("Usuario destino no existe.");

  const receiver = users[receiverKey];

  // Inicializar arrays
  if (!sender.transactions) sender.transactions = [];
  if (!receiver.transactions) receiver.transactions = [];

  // Verificación de saldo
  if (currentUser !== "admin" && sender.balance < amount) return alert("Saldo insuficiente.");

  // Actualizar balances
  if (currentUser !== "admin") sender.balance -= amount;
  receiver.balance += amount;

  const now = new Date().toLocaleString();

  // Registrar transacción del emisor (rojo)
  sender.transactions.push({
    type: "Envío",
    amount: `-$${amount.toFixed(2)}`,
    details: `A ${receiverKey}`,
    date: now,
    color: "red"
  });

  // Registrar transacción del receptor (verde)
  receiver.transactions.push({
    type: "Recepción",
    amount: `+$${amount.toFixed(2)}`,
    details: currentUser === "admin" ? "De Trust Wallet" : `De ${from}`,
    date: now,
    color: "green"
  });

  // Guardar cambios
  localStorage.setItem(LS_KEY, JSON.stringify(users));

  // Actualizar dashboard e historial
  renderDashboard();
  renderTransactions();

  alert(`✅ Transferencia exitosa a ${receiverKey} (${bank}, ${country.toUpperCase()}) por $${amount.toFixed(2)}`);
}

function loadCurrentUser() {
  if (!currentUser) return;

  const savedUsers = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  if (!savedUsers[currentUser]) return;

  // Actualizar el objeto en memoria
  users[currentUser] = savedUsers[currentUser];

  // Asegurarse de que exista el historial
  if (!users[currentUser].transactions) users[currentUser].transactions = [];
}

function loadUserData() {
  if (!currentUser) return;

  // Cargar datos actualizados desde localStorage
  const savedUsers = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  if (!savedUsers[currentUser]) return;

  // Actualizar objeto users en memoria
  users[currentUser] = savedUsers[currentUser];

  // Asegurarse de que existan los arrays de historial
  if (!users[currentUser].transactions) users[currentUser].transactions = [];
  if (!users[currentUser].tx) users[currentUser].tx = [];
}



/* Retiro */
function doWithdraw() {
  if (!currentUser) return alert('Inicia sesión.');
  const amt = Number(document.getElementById('wAmt').value);
  if (!amt || amt <= 0) return alert('Ingresa un monto válido.');
  if (users[currentUser].balance < amt) return alert('Saldo insuficiente.');
  users[currentUser].balance -= amt;
  users[currentUser].tx.push({ type: 'Retiro', amount: -amt, amountStr: '-' + money(amt), date: new Date().toLocaleString() });
  saveAll();
  renderDashboard();
  alert('Retiro exitoso.');
}

/* Logout */
function logout() {
  // Limpiar sesión
  localStorage.removeItem("currentUser");
  currentUser = null;

  // Mostrar la página principal de login
  document.getElementById("loginView").style.display = "block";   // LOGIN principal
  document.getElementById("registerView").style.display = "none"; // Ocultar registro
  document.getElementById("actions").style.display = "none";      // Ocultar dashboard/acciones

  // Resetear textos e interfaz
  document.getElementById("status").innerText = "Offline";
  document.getElementById("welcomeName").innerText = "Invitado";
  document.getElementById("balanceView").innerText = "$0.00";
  document.getElementById("docView").innerText = "-";
  document.getElementById("txList").innerHTML =
    `<div style="color:var(--muted); font-size:13px">Sin movimientos</div>`;

  // Limpiar inputs de login
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
}


// ====== BOTONES ======
document.getElementById("showRegisterBtn").addEventListener("click", () => {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("registerView").style.display = "block";
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  logout();
});

/* On load: seed sample users if empty */
(function init() {
  if (!Object.keys(users).length) {
    users['juan'] = { name: 'Juan Pérez', doc: '12345678', phone: '+57 300 123 4567', pass: '1234', bank: 'Banco Andino', balance: 0.000, card: generateCardFromUser('juan', '12345678'), tx: [], docImage: null };
    users['maria'] = { name: 'María Gómez', doc: '87654321', phone: '+57 310 999 8888', pass: 'abcd', bank: 'Finanzas Plus', balance: 0.000, card: generateCardFromUser('maria', '87654321'), tx: [], docImage: null };
    saveAll();
  }
})();
let user = JSON.parse(localStorage.getItem('users')) || {};
let current = null;

// --- CAMBIO NUEVO: guardar el usuario activo ---
function setCurrent(user) {
  current = user;
  localStorage.setItem("currentUser", user.username);
}
function showRegister() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('registerView').style.display = 'block';
}

function showLogin() {
  document.getElementById('registerView').style.display = 'none';
  document.getElementById('loginView').style.display = 'block';
}


function saveData() {
  localStorage.setItem('users', JSON.stringify(users));
}

function generateCard() {
  const number = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  const cvv = Math.floor(100 + Math.random() * 900);
  const expiry = `${Math.floor(1 + Math.random() * 12)}/${2028}`;
  return { number, cvv, expiry };
}

function register() {
  const user = ruser.value.trim().toLowerCase();
  if (users[user]) return alert('El usuario ya existe.');

  const card = generateCard();
  users[user] = {
    username: user,
    name: rname.value,
    doc: rdoc.value,
    pass: rpass.value,
    bank: rbank.value,
    balance: 1000,
    card
  };

  saveData();
  alert('Cuenta creada con éxito.');
  showLogin();
}

function login() {
  const user = userLogin.value.trim().toLowerCase();
  const pass = passLogin.value;

  if (!users[user] || users[user].pass !== pass) {
    return alert("Usuario o contraseña incorrectos");
  }

  // Guardar usuario actual
  setCurrent(users[user]);

  // 💰 Si es el admin, asignar saldo infinito ANTES de actualizar el dashboard
  if (user === "admin") {
    users["admin"].balance = Infinity;
  }

  // Actualizar la interfaz
  updateDashboard();

  // Guardar los cambios
  saveUsers();
}



function updateDashboard() {
  if (!currentUser || !users[currentUser]) return;

  const u = users[currentUser];

  // Actualizar clase de tarjeta según banco
  const wrap = document.getElementById('cardWrap');
  wrap.classList.remove('bank-A', 'bank-B', 'bank-C');
  if (u.bank.includes('Andino')) wrap.classList.add('bank-A');
  else if (u.bank.includes('Norte')) wrap.classList.add('bank-B');
  else wrap.classList.add('bank-C');

  // Tipo de banco o Trust Wallet
  const bankTypeEl = document.getElementById("bankType");
  const cardNumberEl = document.getElementById("cardNumber");
  const cardExpEl = document.getElementById("cardExp");

  if (currentUser === "admin") {
    bankTypeEl.textContent = "Trust Wallet";
    cardNumberEl.textContent = "Trust Wallet";
    cardExpEl.textContent = "Cuenta verificada";
  } else if (u.card && u.card.number) {
    bankTypeEl.textContent = u.card.number[0] === "4" ? "VISA" : "MASTERCARD";
    cardNumberEl.textContent = fmtCard(u.card.number);
    cardExpEl.textContent = "VENCE " + (u.card.exp || "--/--");
  } else {
    bankTypeEl.textContent = "VISA";
    cardNumberEl.textContent = "---- ---- ---- ----";
    cardExpEl.textContent = "VENCE --/--";
  }

  document.getElementById('cardHolder').textContent = u.name.toUpperCase();
  document.getElementById('welcomeName').textContent = u.name;
  document.getElementById('bankLabelSmall').textContent = u.bank;

  // Actualizar saldo
  const balanceEl = document.getElementById("userBalance") || document.getElementById("balanceView");
  if (balanceEl) {
    balanceEl.textContent = (u.balance === Number.MAX_SAFE_INTEGER) ? "$∞" : money(u.balance);
  }

  // Renderizar historial
  renderTransactions();
  loadCurrentUserTransactions(); 
}



// Actualiza bancos cuando el país cambia
function updateBanks() {
  const country = document.getElementById("country").value;
  const bankSelect = document.getElementById("transferBank").value;

  // Limpiar bancos anteriores
  bankSelect.innerHTML = '<option value="">Seleccione un banco</option>';

  if (country && banksByCountry[country]) {
    banksByCountry[country].forEach(bank => {
      const option = document.createElement("option");
      option.textContent = bank;
      option.value = bank;
      bankSelect.appendChild(option);
    });
  }
  // --- Mostrar saldo correctamente ---
  // Mostrar saldo de forma segura
  const balanceEl = document.getElementById("userBalance") || document.getElementById("balanceView");
  if (balanceEl) {
    const u = users[currentUser];

    if (!u) {
      balanceEl.textContent = "$0";
    } else if (currentUser === "admin") {
      // El admin siempre muestra infinito
      balanceEl.textContent = "$∞";
    } else if (u.balance === undefined || u.balance === null || isNaN(u.balance)) {
      balanceEl.textContent = "$0";
    } else {
      balanceEl.textContent = "$" + Number(u.balance).toLocaleString("es-CO");
    }
  }


}

function renderTransactions() {
  const container = document.getElementById("txList");
  if (!container) return;

  const user = users[currentUser];
  if (!user || !user.transactions || user.transactions.length === 0) {
    container.innerHTML = `<div style="color:var(--muted); font-size:13px">Sin movimientos</div>`;
    return;
  }

  // Renderizar cada transacción con su color
  container.innerHTML = user.transactions.map(t => `
    <div class="transaction" 
         style="border:2px solid ${t.color}; padding:10px; margin-bottom:6px; border-radius:8px;">
      <b>${t.type}</b> ${t.amount}<br>
      <small>${t.details}</small><br>
      <small>${t.date}</small>
    </div>
  `).join("");
}


// 💰 Retiro
function withdraw() {
  const amount = parseFloat(withdrawAmount.value);
  if (amount <= 0 || isNaN(amount)) return alert('Monto inválido');
  if (current.balance < amount) return alert('Saldo insuficiente');
  current.balance -= amount;
  users[current.username] = current;
  saveData();
  updateDashboard();
  alert('Retiro exitoso.');
}


// 🔄 Actualización automática del saldo cada 2 segundos
setInterval(() => {
  const savedUsers = JSON.parse(localStorage.getItem(LS_KEY) || "{}");

  if (currentUser && savedUsers[currentUser]) {
    let newBalance = savedUsers[currentUser].balance;

    // Mantener el infinito para el admin
    if (currentUser === "admin") {
      newBalance = "INF_BALANCE";
    }

    // Solo actualizar si cambió
    if (newBalance !== users[currentUser].balance) {
      users[currentUser].balance = newBalance;

      const balanceEl = document.getElementById("userBalance") || document.getElementById("balanceView");
      if (balanceEl) {
        balanceEl.textContent = (newBalance === "INF_BALANCE") ? "$∞" : `$${parseFloat(newBalance).toFixed(2)}`;
      }

      renderTransactions(); // Actualiza historial solo
      console.log("💰 Saldo actualizado automáticamente");
    }
  }
}, 2000);


// 🔄 Actualización automática del saldo y mensaje de dinero recibido
let lastBalance = null;

// 🪄 Función para mostrar mensaje flotante
function mostrarMensaje(texto) {
  const msg = document.createElement("div");
  msg.textContent = texto;
  msg.style.position = "fixed";
  msg.style.bottom = "30px";
  msg.style.right = "30px";
  msg.style.background = "#4CAF50";
  msg.style.color = "white";
  msg.style.padding = "12px 18px";
  msg.style.borderRadius = "10px";
  msg.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
  msg.style.fontWeight = "bold";
  msg.style.zIndex = "9999";
  msg.style.transition = "opacity 1s ease";

  document.body.appendChild(msg);

  setTimeout(() => {
    msg.style.opacity = "0";
    setTimeout(() => msg.remove(), 0);
  }, 0);
}





document.addEventListener("DOMContentLoaded", function () {
  const countrySelect = document.getElementById("country");
  const bankSelect = document.getElementById("transferBank");

  const banksByCountry = {
    colombia: ["Bancolombia", "Davivienda", "Banco de Bogotá"],
    mexico: ["BBVA México", "Banorte", "Santander México"],
    Perú: ["Banco de crédito del Perú", "BBVA Perú", "Scotiabank Perú"],
    Ecuador: ["Banco Pichincha ", "Banco del Pacífico", "Banco Guayabil"],
    Chile: ["Banco Santander Chile ", "Banco de Chile", "Banco de Crédito e inversiones"],
    Guatemala: ["Banco Industrial ", "Banrural", "Banco G&T Continental"],
    Bolivia: ["Banco Nacional de Bolivia ", "Banco Mercantil Santa Cruz", "Banco Bisa"],
    Paraguay: ["Banco Itaú Paraguay ", "Banco Continetal", "Visión Banco"],
    España: ["Banco Santander S.A ", "CixaBank S.A", "Banco Bilbao Vizcaya Argentina S.A (BBVA)"],
  };

  if (countrySelect) {
    countrySelect.addEventListener("change", function () {
      const selectedCountry = this.value;
      bankSelect.innerHTML = '<option value="">Seleccione un banco</option>';

      if (banksByCountry[selectedCountry]) {
        banksByCountry[selectedCountry].forEach(bank => {
          const option = document.createElement("option");
          option.value = bank;
          option.textContent = bank;
          bankSelect.appendChild(option);
        });
      }
    });
  }
});




window.addEventListener("storage", e => {
  if (e.key === LS_KEY) {
    users = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (currentUser) {
      updateDashboard();
      renderTransactions();
    }
  }
});
function resetBank() {
  if (!confirm("⚠️ Esto borrará TODOS los usuarios, saldos e historiales. ¿Continuar?")) return;
  users = {};
  currentUser = null;
  localStorage.removeItem(LS_KEY);
  alert("🏦 Banco reiniciado. Recarga la página.");
  location.reload();
}

document.getElementById("showRegisterBtn").addEventListener("click", () => {
  showRegister();
});
// BOTÓN DE CERRAR SESIÓN
document.getElementById("logoutBtn").addEventListener("click", () => {
  logout();
});









