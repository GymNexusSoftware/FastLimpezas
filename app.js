import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove, onChildAdded, onChildRemoved, onChildChanged } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-analytics.js";

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBa4OaHmPLLJlg6I1O3lX24ENsmZJU2NEo",
  authDomain: "fastlimpezas-fc27a.firebaseapp.com",
  projectId: "fastlimpezas-fc27a",
  storageBucket: "fastlimpezas-fc27a.firebasestorage.app",
  messagingSenderId: "104504126644",
  appId: "1:104504126644:web:aee99346225c12d7e23be1",
  measurementId: "G-QP7G6RMTX4",
  // Adicionando explicitamente o URL do Realtime Database
  databaseURL: "https://fastlimpezas-fc27a-default-rtdb.europe-west1.firebasedatabase.app"
};

let db;
let analytics;

try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    try {
        analytics = getAnalytics(app);
    } catch (anErr) {
        console.warn("Analytics bloqueado.");
    }
} catch (err) {
    alert("Erro Crítico: Não foi possível ligar ao Realtime Database!");
    console.error(err);
}

// Initial State - V11
let state = {
    currentUser: null, 
    activeView: 'admin', 
    editingClientId: null,
    editingServiceId: null,
    cleaningTypes: [],
    bookings: [],
    clients: []
};

// --- Selectors ---
const loginScreen = () => document.getElementById('login-screen');
const mainContent = () => document.getElementById('main-content');
const adminView = () => document.getElementById('admin-view');
const agendaView = () => document.getElementById('agenda-view');
const clientView = () => document.getElementById('client-view');
const roleBadge = () => document.getElementById('role-badge');
const viewTitle = () => document.getElementById('view-title');
const bookingModal = () => document.getElementById('booking-modal');
const emailModal = () => document.getElementById('email-modal');
const clientModal = () => document.getElementById('client-modal');
const infoModal = () => document.getElementById('info-modal');
const adminModal = () => document.getElementById('admin-modal');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebaseSync();
    window.lucide.createIcons();
    initEventListeners();
    const today = new Date().toISOString().split('T')[0];
    const dIn = document.getElementById('booking-date');
    if(dIn) dIn.setAttribute('min', today);
    const saved = sessionStorage.getItem('cleaning-session');
    if (saved) {
        state.currentUser = JSON.parse(saved);
        loginSuccess();
    }
});

function initFirebaseSync() {
    console.log("Iniciando Realtime Database Sync...");
    
    // Sync Services
    onValue(ref(db, "services"), (snapshot) => {
        const val = snapshot.val();
        state.cleaningTypes = val ? Object.keys(val).map(k => ({ id: k, ...val[k] })) : [];
        if (state.cleaningTypes.length === 0) seedInitialServices();
        renderAdminServices();
        if(state.activeView === 'client') renderClientView();
    });

    // Sync Clients
    onValue(ref(db, "clients"), (snapshot) => {
        const val = snapshot.val();
        state.clients = val ? Object.keys(val).map(k => ({ id: k, ...val[k] })) : [];
        updateStats();
        renderAdminClients();
    });

    // Sync Bookings
    onValue(ref(db, "bookings"), (snapshot) => {
        const val = snapshot.val();
        state.bookings = val ? Object.keys(val).map(k => ({ id: k, ...val[k] })) : [];
        if(state.activeView === 'agenda') renderGlobalAgenda();
        if(state.activeView === 'client' || state.activeView === 'client-bookings') renderClientView();
    });

    setTimeout(() => migrateFromLocalStorage(), 2000);
}

async function seedInitialServices() {
    const initial = [
        { name: 'Limpeza Standard', price: 0, desc: 'Limpeza geral.', isCustom: true },
        { name: 'Limpeza Profunda', price: 0, desc: 'Limpeza detalhada.', isCustom: true },
        { name: 'Limpeza Vidros', price: 0, desc: 'Limpeza de vidros.', isCustom: true }
    ];
    for (const s of initial) await push(ref(db, "services"), s);
}

async function migrateFromLocalStorage() {
    const oldData = localStorage.getItem('cleaning-app-v11');
    if(!oldData) return;
    const p = JSON.parse(oldData);
    if (state.clients.length === 0 && p.clients?.length > 0) {
        for (const c of p.clients) { delete c.id; await push(ref(db, "clients"), c); }
        for (const b of p.bookings || []) { delete b.id; await push(ref(db, "bookings"), b); }
        localStorage.removeItem('cleaning-app-v11');
        showToast('Dados migrados!');
    }
}

function initEventListeners() {
    document.getElementById('login-form').onsubmit = handleLogin;
    document.getElementById('logout-btn').onclick = logout;
    document.getElementById('edit-profile-btn').onclick = () => {
        const c = state.clients.find(cl => cl.id === state.currentUser?.id);
        if(c) openClientModal(c);
    };
    document.getElementById('close-booking-modal').onclick = () => bookingModal().classList.add('hidden');
    document.getElementById('close-admin-modal-btn').onclick = () => adminModal().classList.add('hidden');
    document.getElementById('close-client-modal-btn').onclick = () => clientModal().classList.add('hidden');
    document.getElementById('close-email-modal').onclick = () => emailModal().classList.add('hidden');
    document.getElementById('close-info-modal-btn').onclick = () => infoModal().classList.add('hidden');
    document.getElementById('close-info-btn').onclick = () => infoModal().classList.add('hidden');
    document.getElementById('add-service-btn').onclick = () => openServiceModal();
    document.getElementById('add-client-btn').onclick = () => openClientModal();
    document.getElementById('admin-add-booking-btn').onclick = () => openBookingModal();
    document.getElementById('save-service-btn').onclick = saveService;
    document.getElementById('save-client-btn').onclick = saveClient;
    document.getElementById('confirm-booking').onclick = handleBookingSubmit;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            switchView(item.dataset.view);
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        };
    });
}

function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    if (u === 'admin' && p === 'admin123') state.currentUser = { id: 'admin', role: 'admin', name: 'Administrador' };
    else {
        const c = state.clients.find(cl => cl.email === u && cl.password === p);
        if (c) state.currentUser = { ...c, role: 'client' };
        else return showToast('Inválido!');
    }
    sessionStorage.setItem('cleaning-session', JSON.stringify(state.currentUser));
    loginSuccess();
}

function loginSuccess() {
    if(!state.currentUser) return;
    loginScreen().classList.add('hidden');
    mainContent().classList.remove('hidden');
    document.getElementById('nav-admin').classList.toggle('hidden', state.currentUser.role !== 'admin');
    document.getElementById('nav-client').classList.toggle('hidden', state.currentUser.role === 'admin');
    if (state.currentUser.role === 'admin') switchView('admin'); else switchView('client');
}

function logout() { sessionStorage.removeItem('cleaning-session'); location.reload(); }

function switchView(view) {
    state.activeView = view;
    adminView().classList.add('hidden');
    agendaView().classList.add('hidden');
    clientView().classList.add('hidden');
    if (view === 'admin') {
        renderAdminServices();
        renderAdminClients();
        adminView().classList.remove('hidden');
        roleBadge().textContent = 'Admin';
        viewTitle().textContent = 'Gestão';
    } else if (view === 'agenda') {
        renderGlobalAgenda();
        agendaView().classList.remove('hidden');
        viewTitle().textContent = 'Agenda Global';
    } else {
        clientView().classList.remove('hidden');
        document.getElementById('client-home-content').classList.toggle('hidden', view !== 'client');
        document.getElementById('client-bookings-content').classList.toggle('hidden', view !== 'client-bookings');
        viewTitle().textContent = view === 'client' ? 'Início' : 'As Minhas Limpezas';
        renderClientView();
    }
    window.lucide.createIcons();
    updateStats();
}

function updateStats() {
    const v = document.querySelector('#stat-clients .value');
    if(v) v.textContent = state.clients.length;
}

function renderAdminServices() {
    const list = document.getElementById('admin-services-list'); if(!list) return; list.innerHTML = '';
    state.cleaningTypes.forEach(s => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `<div class="admin-item-info"><h4>${s.name}</h4><p>${s.isCustom ? 'Sob Orçamento' : s.price + '€'}</p></div><div class="actions"><button class="icon-btn edit-s"><i data-lucide="edit-3"></i></button><button class="icon-btn del-s red"><i data-lucide="trash-2"></i></button></div>`;
        item.querySelector('.edit-s').onclick = () => openServiceModal(s);
        item.querySelector('.del-s').onclick = async () => { if(confirm('Eliminar?')) await remove(ref(db, "services/" + s.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderAdminClients() {
    const list = document.getElementById('admin-clients-list'); if(!list) return; list.innerHTML = '';
    state.clients.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `<div class="admin-item-info"><h4>${c.name}</h4><p>${c.email}</p></div><div class="actions"><button class="icon-btn edit-c"><i data-lucide="edit-3"></i></button><button class="icon-btn del-c red"><i data-lucide="trash-2"></i></button></div>`;
        item.querySelector('.edit-c').onclick = () => openClientModal(c);
        item.querySelector('.del-c').onclick = async () => { if(confirm('Eliminar?')) await remove(ref(db, "clients/" + c.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderGlobalAgenda() {
    const list = document.getElementById('all-bookings-list'); if(!list) return; list.innerHTML = '';
    state.bookings.forEach(b => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `<div class="admin-item-info"><h4>${b.serviceName}</h4><p>${b.clientName} • ${b.finalPrice || 'Pendente'}€</p><span class="status-badge ${b.status.toLowerCase()}">${b.status}</span></div><div class="actions"><button class="btn-small set-p">Definir Preço</button><button class="icon-btn del-b"><i data-lucide="trash-2"></i></button></div>`;
        const pBtn = item.querySelector('.set-p');
        if(b.status !== 'Pendente') pBtn.classList.add('hidden');
        pBtn.onclick = async () => { const p = prompt('Preço?'); if(p) await update(ref(db, "bookings/" + b.id), { status: 'Aguardando Cliente', finalPrice: p }); };
        item.querySelector('.del-b').onclick = async () => { if(confirm('Remover?')) await remove(ref(db, "bookings/" + b.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderClientView() {
    const grid = document.getElementById('cleaning-types-grid'); if(grid) {
        grid.innerHTML = '';
        state.cleaningTypes.forEach(s => {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.innerHTML = `<di class="service-icon"><i data-lucide="sparkles"></i></di><h4>${s.name}</h4><div class="price">${s.isCustom ? 'Sob Orçamento' : s.price + '€'}</div>`;
            card.onclick = () => openBookingModal(s);
            grid.appendChild(card);
        });
    }
    const myList = document.getElementById('my-bookings'); if(myList) {
        myList.innerHTML = '';
        state.bookings.filter(b => b.clientEmail === state.currentUser?.email).forEach(b => {
            const item = document.createElement('div');
            item.className = 'booking-item';
            item.innerHTML = `<div class="booking-info"><h4>${b.serviceName}</h4><p>${b.date} • ${b.finalPrice || 'Sob Orçamento'}€</p><span class="status-badge ${b.status.toLowerCase()}">${b.status}</span></div>`;
            myList.appendChild(item);
        });
    }
    window.lucide.createIcons();
}

function openServiceModal(s = null) {
    state.editingServiceId = s ? s.id : null;
    document.getElementById('admin-service-name').value = s ? s.name : '';
    document.getElementById('admin-service-price').value = s ? s.price : '';
    document.getElementById('admin-service-custom').checked = s?.isCustom || false;
    adminModal().classList.remove('hidden');
}

async function saveService() {
    const btn = document.getElementById('save-service-btn');
    try {
        btn.disabled = true;
        const n = document.getElementById('admin-service-name').value;
        const p = document.getElementById('admin-service-price').value;
        const c = document.getElementById('admin-service-custom').checked;
        const data = { name: n, price: p, isCustom: c };
        if(state.editingServiceId) await update(ref(db, "services/" + state.editingServiceId), data);
        else await push(ref(db, "services"), data);
        adminModal().classList.add('hidden');
    } catch (e) { showToast('Erro database!', 'error'); } finally { btn.disabled = false; }
}

function openBookingModal(s = null) {
    const sS = document.getElementById('booking-service-select');
    sS.innerHTML = state.cleaningTypes.map(tp => `<option value="${tp.id}">${tp.name}</option>`).join('');
    if(s) sS.value = s.id;
    bookingModal().classList.remove('hidden');
}

async function handleBookingSubmit() {
    const btn = document.getElementById('confirm-booking');
    try {
        btn.disabled = true;
        const sid = document.getElementById('booking-service-select').value;
        const d = document.getElementById('booking-date').value;
        const t = document.getElementById('booking-time').value;
        const s = state.cleaningTypes.find(tp => String(tp.id) === String(sid));
        const data = { serviceName: s.name, clientName: state.currentUser.name, clientEmail: state.currentUser.email, date: d, time: t, status: 'Pendente', timestamp: Date.now() };
        await push(ref(db, "bookings"), data);
        bookingModal().classList.add('hidden');
        showToast('Enviado!');
    } catch (e) { showToast('Erro!', 'error'); } finally { btn.disabled = false; }
}

function openClientModal(c = null) {
    state.editingClientId = c ? c.id : null;
    document.getElementById('client-name').value = c ? c.name : '';
    document.getElementById('client-email').value = c ? c.email : '';
    clientModal().classList.remove('hidden');
}

async function saveClient() {
    const btn = document.getElementById('save-client-btn');
    try {
        btn.disabled = true;
        const n = document.getElementById('client-name').value;
        const e = document.getElementById('client-email').value;
        const data = { name: n, email: e, password: 'samba', role: 'client' };
        if(state.editingClientId) await update(ref(db, "clients/" + state.editingClientId), data);
        else await push(ref(db, "clients"), data);
        clientModal().classList.add('hidden');
        showToast('Guardado!');
    } catch (e) { showToast('Erro!', 'error'); } finally { btn.disabled = false; }
}

function showToast(m, type = 'success') {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = m;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}
