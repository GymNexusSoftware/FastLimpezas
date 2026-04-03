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
    document.getElementById('close-info-modal-btn')?.addEventListener('click', () => infoModal()?.classList.add('hidden'));
    document.getElementById('add-service-btn').onclick = () => openServiceModal();
    document.getElementById('add-client-btn').onclick = () => openClientModal();
    document.getElementById('admin-add-booking-btn').onclick = () => openBookingModal();
    document.getElementById('save-service-btn').onclick = saveService;
    document.getElementById('save-client-btn').onclick = saveClient;
    document.getElementById('confirm-booking').onclick = handleBookingSubmit;
    
    document.querySelectorAll('.nav-link').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
            document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
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
        else return showToast('Login Inválido!', 'error');
    }
    sessionStorage.setItem('cleaning-session', JSON.stringify(state.currentUser));
    loginSuccess();
}

function loginSuccess() {
    if(!state.currentUser) return;
    document.getElementById('login-screen').classList.add('hidden');
    mainContent().classList.remove('hidden');
    document.getElementById('nav-admin').classList.toggle('hidden', state.currentUser.role !== 'admin');
    document.getElementById('nav-client').classList.toggle('hidden', state.currentUser.role === 'admin');
    document.getElementById('edit-profile-btn').classList.toggle('hidden', state.currentUser.role === 'admin');
    if (state.currentUser.role === 'admin') switchView('admin'); else switchView('client');
}

function logout() { sessionStorage.removeItem('cleaning-session'); location.reload(); }

function switchView(view) {
    state.activeView = view;
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('agenda-view').classList.add('hidden');
    document.getElementById('client-view').classList.add('hidden');
    
    // Reset active states in both navs
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
    if(activeLink) activeLink.classList.add('active');

    if (view === 'admin') {
        renderAdminServices();
        renderAdminClients();
        document.getElementById('admin-view').classList.remove('hidden');
        roleBadge().textContent = 'Admin';
        viewTitle().textContent = 'Painel de Gestão';
    } else if (view === 'agenda') {
        renderGlobalAgenda();
        document.getElementById('agenda-view').classList.remove('hidden');
        viewTitle().textContent = 'Agenda Global';
    } else {
        document.getElementById('client-view').classList.remove('hidden');
        document.getElementById('client-home-content').classList.toggle('hidden', view !== 'client');
        document.getElementById('client-bookings-content').classList.toggle('hidden', view !== 'client-bookings');
        viewTitle().textContent = view === 'client' ? 'Nossos Serviços' : 'As Minhas Limpezas';
        roleBadge().textContent = 'Portal Cliente';
        renderClientView();
    }
    window.lucide.createIcons();
    updateStats();
}

function updateStats() {
    const clientsVal = document.getElementById('stat-clients-val');
    const bookingsVal = document.getElementById('stat-bookings-val');
    if(clientsVal) clientsVal.textContent = state.clients.length;
    if(bookingsVal) bookingsVal.textContent = state.bookings.length;
}

function renderAdminServices() {
    const list = document.getElementById('admin-services-list'); if(!list) return; list.innerHTML = '';
    state.cleaningTypes.forEach(s => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-info">
                <h4>${s.name}</h4>
                <p>${s.isCustom ? 'Sob Orçamento' : s.price + '€'}</p>
            </div>
            <div class="admin-actions">
                <button class="icon-btn edit-s"><i data-lucide="edit-3"></i></button>
                <button class="icon-btn del-s red"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        item.querySelector('.edit-s').onclick = () => openServiceModal(s);
        item.querySelector('.del-s').onclick = async () => { if(confirm('Deseja eliminar este serviço?')) await remove(ref(db, "services/" + s.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderAdminClients() {
    const list = document.getElementById('admin-clients-list'); if(!list) return; list.innerHTML = '';
    state.clients.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-info">
                <h4>${c.name}</h4>
                <p>${c.email} • ${c.contact || 'Sem contacto'}</p>
            </div>
            <div class="admin-actions">
                <button class="icon-btn edit-c"><i data-lucide="edit-3"></i></button>
                <button class="icon-btn del-c red"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        item.querySelector('.edit-c').onclick = () => openClientModal(c);
        item.querySelector('.del-c').onclick = async () => { if(confirm('Deseja eliminar este cliente?')) await remove(ref(db, "clients/" + c.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderGlobalAgenda() {
    const list = document.getElementById('all-bookings-list'); if(!list) return; list.innerHTML = '';
    state.bookings.forEach(b => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-info">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="status-dot ${b.status.toLowerCase()}"></div>
                    <h4>${b.serviceName}</h4>
                </div>
                <p><strong>${b.clientName}</strong> • ${b.date} às ${b.time}</p>
                <p style="font-size:12px; color:var(--primary-dark); margin-top:4px;">${b.address || 'Sem morada'}</p>
            </div>
            <div class="admin-actions">
                ${b.status === 'Pendente' ? `<button class="icon-btn set-p" style="color:var(--secondary)" title="Definir Preço"><i data-lucide="euro"></i></button>` : ''}
                <button class="icon-btn del-b red"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        const pBtn = item.querySelector('.set-p');
        if(pBtn) pBtn.onclick = async () => { 
            const p = prompt('Indique o valor final para o orçamento (€)'); 
            if(p) await update(ref(db, "bookings/" + b.id), { status: 'Aguardando Cliente', finalPrice: p }); 
        };
        item.querySelector('.del-b').onclick = async () => { if(confirm('Remover agendamento?')) await remove(ref(db, "bookings/" + b.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderClientView() {
    const grid = document.getElementById('cleaning-types-grid'); 
    if(grid) {
        grid.innerHTML = '';
        state.cleaningTypes.forEach(s => {
            const card = document.createElement('div');
            card.className = 'service-card-modern';
            card.innerHTML = `
                <div class="service-tag">${s.isCustom ? 'Sob Consulta' : 'Preço Fixo'}</div>
                <div class="card-icon-container">
                    <i data-lucide="sparkles"></i>
                </div>
                <div class="card-content">
                    <h4>${s.name}</h4>
                    <p class="service-desc">${s.desc || 'Serviço de limpeza profissional com garantia de qualidade FastLimpezas.'}</p>
                    <div class="price-row">
                        <span class="price-val">${s.isCustom ? '---' : s.price + '€'}</span>
                        <button class="book-btn-mini">Agendar <i data-lucide="chevron-right"></i></button>
                    </div>
                </div>
            `;
            card.onclick = () => openBookingModal(s);
            grid.appendChild(card);
        });
    }
    
    const myList = document.getElementById('my-bookings'); 
    if(myList) {
        myList.innerHTML = '';
        const userBookings = state.bookings.filter(b => b.clientEmail === state.currentUser?.email);
        
        if (userBookings.length === 0) {
            myList.innerHTML = '<div class="empty-state"><p>Ainda não tem limpezas agendadas.</p></div>';
        } else {
            userBookings.forEach(b => {
                const item = document.createElement('div');
                item.className = 'booking-card-modern';
                item.innerHTML = `
                    <div class="booking-status-indicator ${b.status.toLowerCase()}"></div>
                    <div class="booking-main">
                        <div class="booking-header">
                            <h4>${b.serviceName}</h4>
                            <span class="date-tag">${b.date} • ${b.time}</span>
                        </div>
                        <div class="booking-footer">
                            <span class="status-badge-v2 ${b.status.toLowerCase()}">${b.status}</span>
                            <span class="price-tag">${b.finalPrice ? b.finalPrice + '€' : 'A Combinar'}</span>
                        </div>
                    </div>
                `;
                myList.appendChild(item);
            });
        }
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
    const cS = document.getElementById('booking-client-select');
    
    // Popular Dropdowns
    sS.innerHTML = state.cleaningTypes.map(tp => `<option value="${tp.id}">${tp.name}</option>`).join('');
    cS.innerHTML = state.clients.map(cl => `<option value="${cl.id}">${cl.name}</option>`).join('');
    
    if(s) sS.value = s.id;
    
    const addrField = document.getElementById('booking-address');
    const obsField = document.getElementById('booking-observations');
    if(addrField) addrField.value = '';
    if(obsField) obsField.value = '';

    if(state.currentUser.role === 'client') {
        document.getElementById('client-select-container').classList.add('hidden');
        cS.value = state.currentUser.id;
        if(state.currentUser.address) addrField.value = state.currentUser.address;
    } else {
        document.getElementById('client-select-container').classList.remove('hidden');
    }
    
    bookingModal().classList.remove('hidden');
}

async function handleBookingSubmit() {
    const btn = document.getElementById('confirm-booking');
    try {
        btn.disabled = true;
        const sid = document.getElementById('booking-service-select').value;
        const cid = document.getElementById('booking-client-select').value;
        const d = document.getElementById('booking-date').value;
        const t = document.getElementById('booking-time').value;
        const o = document.getElementById('booking-observations').value;
        const a = document.getElementById('booking-address').value;
        
        if(!d || !a) throw new Error('Data e Morada!');
        
        const s = state.cleaningTypes.find(tp => String(tp.id) === String(sid));
        const c = state.clients.find(cl => String(cl.id) === String(cid));
        
        const data = { 
            serviceName: s.name, 
            clientName: c.name, 
            clientEmail: c.email, 
            date: d, 
            time: t, 
            status: 'Pendente', 
            observations: o || '', 
            address: a,
            timestamp: Date.now() 
        };
        
        await push(ref(db, "bookings"), data);
        bookingModal().classList.add('hidden');
        showToast('Pedido Enviado!');
    } catch (e) { 
        showToast(e.message || 'Erro!', 'error'); 
    } finally { 
        btn.disabled = false; 
    }
}

function triggerEmailSimulation(content) {
    const body = document.getElementById('email-body-content');
    const overlay = document.getElementById('email-sending-overlay');
    const success = document.getElementById('email-sent-success');
    const closeBtn = document.getElementById('close-email-modal');
    if(!body) return;
    body.innerHTML = content;
    overlay?.classList.remove('hidden');
    success?.classList.add('hidden');
    closeBtn?.classList.add('hidden');
    emailModal().classList.remove('hidden');
    setTimeout(() => {
        overlay?.classList.add('hidden');
        success?.classList.remove('hidden');
        setTimeout(() => {
            success?.classList.add('hidden');
            closeBtn?.classList.remove('hidden');
            window.lucide.createIcons();
        }, 1200);
    }, 1500);
}

function showPriceProposedEmail(bk) { triggerEmailSimulation(`<h3>Orçamento Disponível</h3><p>Para: ${bk.clientEmail}</p><hr><p>Para o serviço ${bk.serviceName} propomos o valor de <strong>${bk.finalPrice}€</strong>.</p>`); }
function showWelcomeEmail(e, p) { triggerEmailSimulation(`<p>Bem-vindo à FastLimpezas!</p><div style="background:#f3f4f6; padding:15px; border-radius:8px; margin:10px 0"><p>Utilizador: <strong>${e}</strong></p><p>Palavra-passe: <strong>${p}</strong></p></div>`); }
function showCancellationEmail(bk, t) { triggerEmailSimulation(`<p>De: fastlimpezas@gmail.com</p><hr><p>${t === 'client' ? 'Serviço cancelado.' : 'O cliente cancelou o serviço.'}</p>`); }
function showNewBookingAdminEmail(bk) { triggerEmailSimulation(`<h3>Novo Pedido</h3><p>O cliente <strong>${bk.clientName}</strong> solicitou <strong>${bk.serviceName}</strong> para <strong>${bk.date}</strong>.</p>`); }
function showFinalConfirmationAdminEmail(bk) { triggerEmailSimulation(`<h3>Orçamento Aceite</h3><p>O cliente <strong>${bk.clientName}</strong> ACEITOU o valor de <strong>${bk.finalPrice}€</strong>.</p>`); }

function openClientModal(c = null) {
    state.editingClientId = c ? c.id : null;
    document.getElementById('client-name').value = c ? c.name : '';
    document.getElementById('client-email').value = c ? c.email : '';
    document.getElementById('client-contact').value = c ? (c.contact || '') : '';
    document.getElementById('client-nif').value = c ? (c.nif || '') : '';
    document.getElementById('client-address').value = c ? (c.address || '') : '';
    
    const passGroup = document.getElementById('password-group');
    if(passGroup) passGroup.classList.toggle('hidden', !c);
    if(c) document.getElementById('client-password').value = c.password;
    
    clientModal().classList.remove('hidden');
}

async function saveClient() {
    const btn = document.getElementById('save-client-btn');
    try {
        btn.disabled = true;
        
        const n = document.getElementById('client-name').value;
        const e = document.getElementById('client-email').value;
        const contact = document.getElementById('client-contact').value;
        const nif = document.getElementById('client-nif').value;
        const address = document.getElementById('client-address').value;
        
        if(!n || !e) throw new Error('Nome e Email são obrigatórios!');
        
        const pass = document.getElementById('client-password')?.value || Math.random().toString(36).slice(-6).toUpperCase();
        
        const data = { 
            name: n, 
            email: e, 
            contact: contact || '', 
            nif: nif || '', 
            address: address || '', 
            password: pass, 
            role: 'client' 
        };
        
        if(state.editingClientId) {
            await update(ref(db, "clients/" + state.editingClientId), data);
            if (state.currentUser && state.currentUser.id === state.editingClientId) {
                state.currentUser = { ...data, id: state.editingClientId };
                sessionStorage.setItem('cleaning-session', JSON.stringify(state.currentUser));
            }
        } else {
            await push(ref(db, "clients"), data);
            showWelcomeEmail(e, pass);
        }
        
        clientModal().classList.add('hidden');
        showToast('Guardado!');
    } catch (e) { 
        showToast(e.message || 'Erro!', 'error'); 
        console.error(e);
    } finally { 
        btn.disabled = false; 
    }
}

function showToast(m, type = 'success') {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = m;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}
