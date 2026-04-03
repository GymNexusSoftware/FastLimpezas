// Initial State - V11
let state = {
    currentUser: null, 
    activeView: 'admin', 
    editingClientId: null,
    editingServiceId: null,
    cleaningTypes: [
        { id: 1, name: 'Limpeza Standard', price: 0, desc: 'Limpeza geral de manutenção. Inclui aspirar, lavar chão e pó em superfícies acessíveis.', isCustom: true },
        { id: 2, name: 'Limpeza Profunda', price: 0, desc: 'Limpeza detalhada. Inclui interior de armários vazios, rodapés, caixilhos e desinfetagem profunda.', isCustom: true },
        { id: 3, name: 'Limpeza Vidros', price: 0, desc: 'Limpeza de vidros e janelas (interior e exterior acessível).', isCustom: true },
        { id: 4, name: 'Limpeza Pós-Obra', price: 0, desc: 'Limpeza técnica profunda após obras. Remove restos de tinta, cimento e pó fino acumulado.', isCustom: true }
    ],
    bookings: [],
    clients: [
        { id: 10, name: 'Maria Silva', email: 'cliente@email.com', contact: '912345678', password: 'samba', role: 'client', address: 'Rua Principal 123, Lisboa' }
    ]
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
    loadFromLocalStorage();
    lucide.createIcons();
    initEventListeners();
    const today = new Date().toISOString().split('T')[0];
    const dIn = document.getElementById('booking-date');
    if(dIn) dIn.setAttribute('min', today);
    const saved = sessionStorage.getItem('cleaning-session');
    if (saved) {
        const u = JSON.parse(saved);
        if (u.role === 'client') {
            const f = state.clients.find(c => c.id === u.id);
            if(f) state.currentUser = { ...f, role: 'client' };
            else { sessionStorage.removeItem('cleaning-session'); location.reload(); }
        } else state.currentUser = u;
        loginSuccess();
    }
});

function initEventListeners() {
    document.getElementById('login-form').onsubmit = handleLogin;
    document.getElementById('logout-btn').onclick = logout;
    document.getElementById('edit-profile-btn').onclick = () => {
        const c = state.clients.find(cl => cl.id === state.currentUser.id);
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
    if (u === 'admin' && p === 'admin123') state.currentUser = { id: 1, role: 'admin', name: 'Administrador' };
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
    
    // NAVIGATION VISIBILITY
    document.getElementById('nav-admin').classList.toggle('hidden', state.currentUser.role !== 'admin');
    document.getElementById('nav-client').classList.toggle('hidden', state.currentUser.role === 'admin');
    
    // PROFILE EDIT VISIBILITY (ONLY FOR CLIENTS)
    document.getElementById('edit-profile-btn').classList.toggle('hidden', state.currentUser.role === 'admin');
    
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
        roleBadge().textContent = 'Admin';
    } else {
        clientView().classList.remove('hidden');
        document.getElementById('client-home-content').classList.toggle('hidden', view !== 'client');
        document.getElementById('client-bookings-content').classList.toggle('hidden', view !== 'client-bookings');
        viewTitle().textContent = view === 'client' ? 'Início' : 'As Minhas Limpezas';
        roleBadge().textContent = 'Cliente';
        renderClientView();
    }
    lucide.createIcons();
    updateStats();
}

function updateStats() {
    const v = document.querySelector('#stat-clients .value');
    if(v) v.textContent = state.clients.length;
}

// --- Renderers ---
function renderAdminServices() {
    const list = document.getElementById('admin-services-list'); if(!list) return; list.innerHTML = '';
    state.cleaningTypes.forEach(s => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-item-info"><h4>${s.name}</h4><p style="color:#10B981">${s.isCustom ? 'Sob Orçamento' : s.price + '€'}</p></div>
            <div class="actions">
                <button class="icon-btn edit-service-btn"><i data-lucide="edit-3"></i></button>
                <button class="icon-btn delete-service-btn red"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        item.querySelector('.edit-service-btn').onclick = () => openServiceModal(s);
        item.querySelector('.delete-service-btn').onclick = () => {
             if(confirm(`Eliminar serviço ${s.name}?`)) {
                 state.cleaningTypes = state.cleaningTypes.filter(tp => tp.id !== s.id);
                 saveToLocalStorage();
                 renderAdminServices();
             }
        };
        list.appendChild(item);
    });
    lucide.createIcons();
}

function renderAdminClients() {
    const list = document.getElementById('admin-clients-list'); if(!list) return; list.innerHTML = '';
    state.clients.forEach(c => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-item-info"><h4>${c.name}</h4><p>${c.email}</p></div>
            <div class="actions">
                <button class="icon-btn edit-client-action"><i data-lucide="edit-3"></i></button>
                <button class="icon-btn delete-client-action red"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        item.querySelector('.edit-client-action').onclick = () => openClientModal(c);
        item.querySelector('.delete-client-action').onclick = () => {
             if(confirm(`Eliminar cliente ${c.name}?`)) {
                 state.clients = state.clients.filter(cl => cl.id !== c.id);
                 saveToLocalStorage();
                 renderAdminClients();
                 updateStats();
             }
        };
        list.appendChild(item);
    });
    lucide.createIcons();
}

function renderGlobalAgenda() {
    const list = document.getElementById('all-bookings-list'); if(!list) return; list.innerHTML = '';
    const sorted = [...state.bookings].sort((a,b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    sorted.forEach(b => {
        const item = document.createElement('div');
        item.className = 'admin-item agenda-item';
        item.innerHTML = `
            <div class="admin-item-info">
                <span class="agenda-time">${b.time}</span>
                <h4>${b.serviceName}</h4>
                <p>${b.clientName} • <strong class="booking-price">${b.finalPrice ? b.finalPrice + '€' : 'A Combinar'}</strong></p>
                <p style="font-size:11px; color:#6B7280; margin-top:4px"><i data-lucide="map-pin" style="width:12px; height:12px"></i> ${b.address || 'Sem morada'}</p>
                ${b.observations ? `<p style="font-size:12px; font-style:italic; color:#6B7280; margin-top:4px; background:#f9fafb; padding:4px 8px; border-radius:4px">"Det: ${b.observations}"</p>` : ''}
                <span class="status-badge ${b.status.toLowerCase().replace(/\s+/g, '-')}">${b.status}</span>
            </div>
            <div class="actions">
                ${b.status === 'Pendente' ? `<button class="btn-small confirm-action" style="background:#10B981; color:white">Definir Preço</button>` : ''}
                <button class="icon-btn del-b red"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        const cBtn = item.querySelector('.confirm-action');
        if(cBtn) cBtn.onclick = () => {
             const price = prompt("Indique o valor para este serviço (€):", "35");
             if(price !== null && price !== "") {
                 const idx = state.bookings.findIndex(bk => bk.id === b.id);
                 state.bookings[idx].status = 'Aguardando Cliente';
                 state.bookings[idx].finalPrice = price;
                 saveToLocalStorage();
                 renderGlobalAgenda();
                 showPriceProposedEmail(state.bookings[idx]);
             }
        };
        item.querySelector('.del-b').onclick = () => {
             if(confirm('Cancelar agendamento?')) {
                 showCancellationEmail(b, 'client');
                 state.bookings = state.bookings.filter(bk => bk.id !== b.id);
                 saveToLocalStorage();
                 renderGlobalAgenda();
             }
        };
        list.appendChild(item);
    });
    lucide.createIcons();
}

function renderClientView() {
    const grid = document.getElementById('cleaning-types-grid'); if(grid) {
        grid.innerHTML = '';
        state.cleaningTypes.forEach(s => {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.innerHTML = `
                <div class="service-header-card"><div class="info-marker">i</div></div>
                <div class="service-icon"><i data-lucide="sparkles"></i></div>
                <h4>${s.name}</h4>
                <div class="price">${s.isCustom ? 'Sob Orçamento' : s.price + '€'}</div>
            `;
            card.querySelector('.info-marker').onclick = (e) => { e.stopPropagation(); showServiceInfo(s); };
            card.onclick = () => openBookingModal(s);
            grid.appendChild(card);
        });
    }
    const myList = document.getElementById('my-bookings'); if(myList) {
        myList.innerHTML = '';
        state.bookings.filter(b => b.clientEmail === state.currentUser.email).forEach(b => {
             const item = document.createElement('div');
             item.className = 'booking-item';
             let statusText = b.status;
             if(b.status === 'Aguardando Cliente') statusText = 'Preço Proposto';
             
             item.innerHTML = `
                <div class="booking-info">
                    <h4>${b.serviceName}</h4>
                    <p>${b.date} • <strong class="booking-price">${b.finalPrice ? b.finalPrice + '€' : 'Sob Consulta'}</strong></p>
                    <span class="status-badge ${b.status.replace(/\s+/g, '-').toLowerCase()}">${statusText}</span>
                    ${b.status === 'Aguardando Cliente' ? `
                        <div class="approval-actions" style="margin-top:10px; display:flex; gap:8px;">
                            <button class="btn-small accept-btn" style="background:#10B981; color:white; border:none; padding:5px 12px; border-radius:6px; cursor:pointer">Aceitar Valor</button>
                            <button class="btn-small reject-btn" style="background:#EF4444; color:white; border:none; padding:5px 12px; border-radius:6px; cursor:pointer">Rejeitar</button>
                        </div>
                    ` : ''}
                </div>
                <button class="icon-btn delete-client-booking red"><i data-lucide="trash-2"></i></button>
             `;
             
             const accBtn = item.querySelector('.accept-btn');
             const rejBtn = item.querySelector('.reject-btn');
             
             if(accBtn) accBtn.onclick = () => {
                 const idx = state.bookings.findIndex(bk => bk.id === b.id);
                 state.bookings[idx].status = 'Confirmado';
                 saveToLocalStorage();
                 renderClientView();
                 showToast('Serviço Confirmado!');
                 showFinalConfirmationAdminEmail(state.bookings[idx]);
             };
             
             if(rejBtn) rejBtn.onclick = () => {
                 if(confirm('Deseja rejeitar este valor e cancelar o pedido?')) {
                     const idx = state.bookings.findIndex(bk => bk.id === b.id);
                     state.bookings[idx].status = 'Rejeitado';
                     saveToLocalStorage();
                     renderClientView();
                     showRejectionAdminEmail(state.bookings[idx]);
                 }
             };

             item.querySelector('.delete-client-booking').onclick = () => {
                if(confirm('Anular esta limpeza?')) {
                    showCancellationEmail(b, 'admin');
                    state.bookings = state.bookings.filter(bk => bk.id !== b.id);
                    saveToLocalStorage();
                    renderClientView();
                }
             };
             myList.appendChild(item);
        });
    }
    lucide.createIcons();
}

function showServiceInfo(service) {
    document.getElementById('info-modal-title').textContent = service.name;
    document.getElementById('info-modal-body').innerHTML = `<p>${service.desc || '...'}</p><div style="border-top:1px solid #eee; padding-top:10px"><strong>${service.isCustom ? 'Sob Orçamento' : service.price + '€'}</strong></div>`;
    infoModal().classList.remove('hidden');
}

function openServiceModal(s = null) {
    state.editingServiceId = s ? s.id : null;
    document.getElementById('service-modal-title').textContent = s ? 'Editar Serviço' : 'Novo Serviço';
    document.getElementById('admin-service-name').value = s ? s.name : '';
    document.getElementById('admin-service-price').value = s ? s.price : '';
    document.getElementById('admin-service-desc').value = s ? (s.desc || '') : '';
    document.getElementById('admin-service-custom').checked = s ? (s.isCustom || false) : true;
    adminModal().classList.remove('hidden');
}

function saveService() {
    const n = document.getElementById('admin-service-name').value;
    const p = parseFloat(document.getElementById('admin-service-price').value) || 0;
    const d = document.getElementById('admin-service-desc').value;
    const c = document.getElementById('admin-service-custom').checked;
    if(!n) return showToast('Nome!');
    const s = { id: state.editingServiceId || Date.now(), name: n, price: p, desc: d, isCustom: c };
    if(state.editingServiceId) state.cleaningTypes[state.cleaningTypes.findIndex(tp => tp.id === state.editingServiceId)] = s;
    else state.cleaningTypes.push(s);
    saveToLocalStorage(); adminModal().classList.add('hidden'); renderAdminServices();
}

function openBookingModal(s = null) {
    const sS = document.getElementById('booking-service-select');
    const cS = document.getElementById('booking-client-select');
    sS.innerHTML = state.cleaningTypes.map(tp => `<option value="${tp.id}">${tp.name}</option>`).join('');
    cS.innerHTML = state.clients.map(cl => `<option value="${cl.id}">${cl.name}</option>`).join('');
    if(s) sS.value = s.id;
    const addressField = document.getElementById('booking-address');
    if(state.currentUser.role === 'client') {
        document.getElementById('client-select-container').classList.add('hidden');
        cS.value = state.currentUser.id;
        addressField.value = state.currentUser.address || '';
    } else {
        document.getElementById('client-select-container').classList.remove('hidden');
        addressField.value = '';
    }
    document.getElementById('booking-observations').value = '';
    bookingModal().classList.remove('hidden');
}

function handleBookingSubmit() {
    const sid = document.getElementById('booking-service-select').value;
    const d = document.getElementById('booking-date').value;
    const t = document.getElementById('booking-time').value;
    const o = document.getElementById('booking-observations').value;
    const a = document.getElementById('booking-address').value;
    if(!d || !a) return showToast('Preecha Data e Morada!');
    const s = state.cleaningTypes.find(tp => String(tp.id) === String(sid));
    const cid = document.getElementById('booking-client-select').value;
    const c = state.clients.find(cl => String(cl.id) === String(cid));
    state.bookings.push({
        id: Date.now(), serviceName: s.name, clientName: c.name, clientEmail: c.email, date: d, time: t, status: 'Pendente', 
        finalPrice: null, observations: o, address: a
    });
    saveToLocalStorage(); bookingModal().classList.add('hidden'); 
    if(state.currentUser.role === 'client') renderClientView(); else renderGlobalAgenda();
    showToast('Pedido enviado!');
    showNewBookingAdminEmail(state.bookings[state.bookings.length - 1]);
}

function triggerEmailSimulation(content) {
    const overlay = document.getElementById('email-sending-overlay');
    const success = document.getElementById('email-sent-success');
    const body = document.getElementById('email-body-content');
    const closeBtn = document.getElementById('close-email-modal');
    
    // Reset state
    body.innerHTML = content;
    overlay.classList.remove('hidden');
    success.classList.add('hidden');
    closeBtn.classList.add('hidden');
    emailModal().classList.remove('hidden');
    
    // Phase 1: Sending (1.5s)
    setTimeout(() => {
        overlay.classList.add('hidden');
        success.classList.remove('hidden');
        
        // Phase 2: Show Success (1s)
        setTimeout(() => {
            success.classList.add('hidden');
            closeBtn.classList.remove('hidden');
            lucide.createIcons();
        }, 1200);
        
    }, 1500);
}

function showPriceProposedEmail(bk) {
    triggerEmailSimulation(`<h3>Orçamento Disponível</h3><p>De: <strong>fastlimpezas@gmail.com</strong></p><p>Para: ${bk.clientEmail}</p><hr><p>Para o serviço ${bk.serviceName} em ${bk.date}, propomos o valor de <strong>${bk.finalPrice}€</strong>.</p><p>Por favor, aceda à sua área de cliente para aceitar ou rejeitar este valor.</p>`);
}

function showConfirmationEmail(bk) {
    triggerEmailSimulation(`<h3>Limpeza Confirmada</h3><p>De: <strong>fastlimpezas@gmail.com</strong></p><p>Para: ${bk.clientEmail}</p><hr><p>O serviço ${bk.serviceName} em ${bk.date} na morada <strong>${bk.address}</strong> está confirmado por ${bk.finalPrice}€.</p>`);
}

function showWelcomeEmail(e, p) {
    triggerEmailSimulation(`<p>De: <strong>fastlimpezas@gmail.com</strong></p><p>Bem-vindo à FastLimpezas!</p><div class="credentials-box"><p>Utilizador: <strong>${e}</strong></p><p>Palavra-passe: <strong>${p}</strong></p></div>`);
}

function showCancellationEmail(bk, t) {
    triggerEmailSimulation(`<p>De: <strong>fastlimpezas@gmail.com</strong></p><hr><p>${t === 'client' ? 'Lamentamos, mas o serviço foi cancelado.' : 'Informamos que o cliente cancelou o serviço.'}</p>`);
}

function showNewBookingAdminEmail(bk) {
    triggerEmailSimulation(`<h3>Novo Pedido de Limpeza</h3><p>Para: <strong>Administrador (fastlimpezas@gmail.com)</strong></p><hr><p>O cliente <strong>${bk.clientName}</strong> solicitou um serviço de <strong>${bk.serviceName}</strong> para o dia <strong>${bk.date}</strong> às <strong>${bk.time}</strong>.</p><p>Por favor, defina o orçamento na sua área de gestão.</p>`);
}

function showFinalConfirmationAdminEmail(bk) {
    triggerEmailSimulation(`<h3>Orçamento Aceite</h3><p>Para: <strong>Administrador (fastlimpezas@gmail.com)</strong></p><hr><p>O cliente <strong>${bk.clientName}</strong> ACEITOU o valor de <strong>${bk.finalPrice}€</strong> para o serviço de <strong>${bk.serviceName}</strong> em <strong>${bk.date}</strong>.</p><p>O agendamento está agora oficialmente CONFIRMADO.</p>`);
}

function showRejectionAdminEmail(bk) {
    triggerEmailSimulation(`<h3>Valor Rejeitado</h3><p>Para: <strong>Administrador (fastlimpezas@gmail.com)</strong></p><hr><p>O cliente <strong>${bk.clientName}</strong> REJEITOU o valor de <strong>${bk.finalPrice}€</strong> proposto para o serviço de <strong>${bk.serviceName}</strong> em <strong>${bk.date}</strong>.</p><p>O pedido foi cancelado automaticamente.</p>`);
}

function openClientModal(c = null) {
    state.editingClientId = c ? c.id : null;
    const flds = ['client-name', 'client-email', 'client-contact', 'client-password', 'client-nif', 'client-address'];
    if (c) {
        document.getElementById('password-group').classList.remove('hidden');
        document.getElementById('client-modal-title').textContent = 'Editar Dados';
        document.getElementById('client-name').value = c.name;
        document.getElementById('client-email').value = c.email;
        document.getElementById('client-contact').value = c.contact;
        document.getElementById('client-password').value = c.password;
        document.getElementById('client-nif').value = c.nif || '';
        document.getElementById('client-address').value = c.address || '';
    } else {
        document.getElementById('password-group').classList.add('hidden');
        document.getElementById('client-modal-title').textContent = 'Novo Cliente';
        flds.forEach(fid => { const el = document.getElementById(fid); if(el) el.value = ''; });
    }
    clientModal().classList.remove('hidden');
}

function saveClient() {
    const n = document.getElementById('client-name').value;
    const e = document.getElementById('client-email').value;
    if(!n || !e) return showToast('Preencha os campos!');
    const contact = document.getElementById('client-contact').value;
    const nif = document.getElementById('client-nif').value;
    const address = document.getElementById('client-address').value;
    if(state.editingClientId) {
        const idx = state.clients.findIndex(cl => cl.id === state.editingClientId);
        const pass = document.getElementById('client-password').value;
        state.clients[idx] = { ...state.clients[idx], name: n, email: e, contact, nif, address, password: pass };
        if (state.currentUser && state.currentUser.id === state.editingClientId) {
            state.currentUser = { ...state.clients[idx], role: 'client' };
            sessionStorage.setItem('cleaning-session', JSON.stringify(state.currentUser));
        }
    } else {
        const randPass = Math.random().toString(36).slice(-6).toUpperCase();
        state.clients.push({ id: Date.now(), name: n, email: e, contact, nif, address, password: randPass, role: 'client' });
        showWelcomeEmail(e, randPass);
    }
    saveToLocalStorage(); clientModal().classList.add('hidden'); 
    if(state.currentUser && state.currentUser.role === 'admin') renderAdminClients(); else switchView('client'); 
    showToast('Guardado!');
}

function showToast(m, type = 'success') {
    const t = document.getElementById('toast');
    const msg = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    
    msg.textContent = m;
    icon.setAttribute('data-lucide', type === 'success' ? 'check-circle' : 'alert-circle');
    lucide.createIcons();
    
    t.classList.remove('hidden');
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            t.classList.add('hidden');
            t.style.opacity = '';
            t.style.transform = '';
        }, 500);
    }, 3000);
}

function saveToLocalStorage() { localStorage.setItem('cleaning-app-v11', JSON.stringify({ cleaningTypes: state.cleaningTypes, bookings: state.bookings, clients: state.clients })); }
function loadFromLocalStorage() {
    const s = localStorage.getItem('cleaning-app-v11');
    if(s) {
        const p = JSON.parse(s);
        state.cleaningTypes = p.cleaningTypes || state.cleaningTypes;
        state.bookings = p.bookings || [];
        state.clients = p.clients || state.clients;
    }
}
