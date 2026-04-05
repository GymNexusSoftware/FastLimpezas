import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBa4OaHmPLLJlg6I1O3lX24ENsmZJU2NEo",
  authDomain: "fastlimpezas-fc27a.firebaseapp.com",
  projectId: "fastlimpezas-fc27a",
  storageBucket: "fastlimpezas-fc27a.firebasestorage.app",
  messagingSenderId: "104504126644",
  appId: "1:104504126644:web:aee99346225c12d7e23be1",
  measurementId: "G-QP7G6RMTX4",
  databaseURL: "https://fastlimpezas-fc27a-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let state = {
    currentUser: null, activeView: 'client', cleaningTypes: [], bookings: [], clients: []
};

document.addEventListener('DOMContentLoaded', () => {
    initFirebaseSync();
    initEventListeners();
    const dIn = document.getElementById('booking-date');
    if(dIn) dIn.setAttribute('min', new Date().toISOString().split('T')[0]);
    const saved = sessionStorage.getItem('cleaning-session');
    if (saved) {
        state.currentUser = JSON.parse(saved);
        loginSuccess();
    }
    
    // Inicia EmailJS (Deixo os placeholders para preencheres)
    if (window.emailjs) {
        emailjs.init({
          publicKey: "TEMPLATE_PUBLIC_KEY", // SUBSTITUI POR TUA CHAVE PÚBLICA
        });
    }
});

function initFirebaseSync() {
    onValue(ref(db, "services"), (s) => {
        const v = s.val();
        state.cleaningTypes = v ? Object.keys(v).map(k => ({ id: k, ...v[k] })) : [];
        renderAdminServices();
        renderClientView();
    });
    onValue(ref(db, "clients"), (s) => {
        const v = s.val();
        state.clients = v ? Object.keys(v).map(k => ({ id: k, ...v[k] })) : [];
        updateStats();
        renderAdminClients();
    });
    onValue(ref(db, "bookings"), (s) => {
        const v = s.val();
        state.bookings = v ? Object.keys(v).map(k => ({ id: k, ...v[k] })) : [];
        renderGlobalAgenda();
        renderClientView();
    });
}

function initEventListeners() {
    document.getElementById('login-form').onsubmit = handleLogin;
    document.getElementById('logout-btn').onclick = () => { sessionStorage.removeItem('cleaning-session'); location.reload(); };
    document.getElementById('edit-profile-btn').onclick = () => {
        const c = state.clients.find(cl => cl.id === state.currentUser?.id);
        if(c) openClientModal(c);
    };
    document.getElementById('close-booking-modal').onclick = () => document.getElementById('booking-modal').classList.add('hidden');
    document.getElementById('close-admin-modal-btn').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
    document.getElementById('close-client-modal-btn').onclick = () => document.getElementById('client-modal').classList.add('hidden');
    document.getElementById('close-email-modal').onclick = () => document.getElementById('email-modal').classList.add('hidden');
    document.getElementById('add-service-btn').onclick = () => openServiceModal();
    document.getElementById('add-client-btn').onclick = () => openClientModal();
    document.getElementById('admin-add-booking-btn').onclick = () => openBookingModal();
    document.getElementById('save-service-btn').onclick = saveService;
    document.getElementById('save-client-btn').onclick = saveClient;
    document.getElementById('confirm-booking').onclick = handleBookingSubmit;
    document.getElementById('use-profile-address').addEventListener('change', (e) => {
        const addrField = document.getElementById('booking-address');
        const msg = document.getElementById('profile-address-msg');
        
        if (e.target.checked) {
            // Sincronizar dados do cliente logado vindo da lista oficial
            const currentUserFull = state.clients.find(c => c.id === state.currentUser?.id) || state.currentUser;
            const currentAddr = currentUserFull?.address || "";
            
            if (currentAddr && currentAddr.trim() !== "") {
                addrField.value = currentAddr;
                msg.classList.remove('hidden');
                // Sincronizar o estado
                if (state.currentUser) state.currentUser.address = currentAddr;
            } else {
                e.target.checked = false;
                showToast('Atenção: Não tem morada no perfil! Adicione no Perfil.', 'error');
            }
        } else {
            msg.classList.add('hidden');
        }
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            switchView(item.dataset.view);
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
        else return showToast('Login Falhou!', 'error');
    }
    sessionStorage.setItem('cleaning-session', JSON.stringify(state.currentUser));
    loginSuccess();
}

function loginSuccess() {
    if(!state.currentUser) return;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('nav-admin').classList.toggle('hidden', state.currentUser.role !== 'admin');
    document.getElementById('nav-client').classList.toggle('hidden', state.currentUser.role === 'admin');
    document.getElementById('edit-profile-btn').classList.toggle('hidden', state.currentUser.role === 'admin');
    
    if (state.currentUser.role === 'admin') {
        document.getElementById('role-badge').textContent = 'Administrador';
        document.getElementById('welcome-msg').textContent = 'Gestão FastLimpezas';
        switchView('admin');
    } else {
        document.getElementById('role-badge').textContent = 'Portal Cliente';
        document.getElementById('welcome-msg').textContent = `Olá, ${state.currentUser.name.split(' ')[0]}!`;
        switchView('client');
    }
}

function switchView(view) {
    state.activeView = view;
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('agenda-view').classList.add('hidden');
    document.getElementById('client-view').classList.add('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

    if (view === 'admin') {
        document.getElementById('admin-view').classList.remove('hidden');
    } else if (view === 'agenda') {
        document.getElementById('agenda-view').classList.remove('hidden');
    } else {
        document.getElementById('client-view').classList.remove('hidden');
        document.getElementById('client-home-content').classList.toggle('hidden', view !== 'client');
        document.getElementById('client-bookings-content').classList.toggle('hidden', view !== 'client-bookings');
        document.getElementById('client-contacts-content').classList.toggle('hidden', view !== 'client-contacts');
    }
    window.lucide.createIcons();
    updateStats();
    renderClientView();
    renderAdminClients();
    renderAdminServices();
    renderGlobalAgenda();
}

function updateStats() {
    const clientsVal = document.getElementById('stat-clients-val');
    const bookingsVal = document.getElementById('stat-bookings-val');
    if(clientsVal) clientsVal.textContent = state.clients.length;
    if(bookingsVal) bookingsVal.textContent = state.bookings.length;
}

function renderClientView() {
    const grid = document.getElementById('cleaning-types-grid'); if(!grid) return;
    grid.innerHTML = '';
    state.cleaningTypes.forEach(s => {
        const isVariable = s.isCustom || !s.price || s.price === '0' || s.price === 0;
        const card = document.createElement('div');
        card.className = 'service-card';
        card.innerHTML = `
            <div class="service-icon"><i data-lucide="sparkles"></i></div>
            <h4>${s.name}</h4>
            <p class="desc-text">${s.desc || 'Serviço profissional FastLimpezas.'}</p>
            <div class="price">${isVariable ? 'Sob Orçamento' : s.price + '€'}</div>
        `;
        card.onclick = () => openBookingModal(s);
        grid.appendChild(card);
    });
    
    const myList = document.getElementById('my-bookings'); if(!myList) return;
    myList.innerHTML = '';
    const userBookings = state.bookings.filter(b => {
        if (!state.currentUser) return false;
        const myId = state.currentUser.id;
        const myEmail = (state.currentUser.email || "").trim().toLowerCase();
        
        const bId = b.clientId;
        const bEmail = (b.clientEmail || "").trim().toLowerCase();
        
        return bId === myId || (myEmail !== "" && bEmail === myEmail);
    });
    if (userBookings.length === 0) {
        myList.innerHTML = '<p style="text-align:center; color:#6b7280; padding:20px;">Ainda não tem limpezas agendadas.</p>';
    } else {
            userBookings.forEach(b => {
                const item = document.createElement('div');
                item.className = 'booking-item';
                const isWaiting = b.status === 'Aguardando Cliente';
                const isCancellable = b.status !== 'Cancelado' && b.status !== 'Recusado';
                const statusClass = b.status.replace(/ /g,'-').toLowerCase();
                const statusText = isWaiting ? 'Orçamento Recebido' : b.status;
                
                item.innerHTML = `
                    <div class="booking-info">
                        <h4>${b.serviceName}</h4>
                        <p>${b.date} • ${b.time}</p>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="status-badge ${statusClass}">${statusText}</span>
                            ${isCancellable ? `<button class="cancel-b" style="background:none; border:none; color:#ef4444; font-size:11px; cursor:pointer; text-decoration:underline; font-weight:600;">Cancelar</button>` : ''}
                        </div>
                        ${isWaiting ? `
                            <div style="margin-top:12px; display:flex; gap:10px;">
                                <button class="btn-small accept-p" style="background:var(--primary-green); color:white; border:none; padding:8px 16px; border-radius:12px; font-weight:700; cursor:pointer; font-size:12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Aceitar Valor</button>
                                <button class="btn-small reject-p" style="background:#fee2e2; color:#b91c1c; border:none; padding:8px 16px; border-radius:12px; font-weight:700; cursor:pointer; font-size:12px;">Recusar</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="booking-price">${b.finalPrice ? b.finalPrice + '€' : '--- '}</div>
                `;
                
                if(isWaiting) {
                    item.querySelector('.accept-p').onclick = async () => {
                        if(confirm('Confirma o agendamento por este valor €?')) {
                            await update(ref(db, "bookings/" + b.id), { status: 'Confirmado' });
                            showStatusUpdateEmail({ ...b, status: 'Confirmado' });
                        }
                    };
                    item.querySelector('.reject-p').onclick = async () => {
                        if(confirm('Deseja recusar este orçamento?')) {
                            await update(ref(db, "bookings/" + b.id), { status: 'Recusado' });
                            showStatusUpdateEmail({ ...b, status: 'Recusado' });
                        }
                    };
                }
                if(isCancellable) {
                    item.querySelector('.cancel-b').onclick = async () => {
                        if(confirm('Deseja cancelar esta limpeza?')) {
                            await update(ref(db, "bookings/" + b.id), { status: 'Cancelado' });
                            showStatusUpdateEmail({ ...b, status: 'Cancelado' });
                        }
                    };
                }
                myList.appendChild(item);
            });
    }
    window.lucide.createIcons();
}

function renderAdminServices() {
    const list = document.getElementById('admin-services-list'); if(!list) return;
    list.innerHTML = '';
    state.cleaningTypes.forEach(s => {
        const isVariable = s.isCustom || !s.price || s.price === '0' || s.price === 0;
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-item-info">
                <h4>${s.name}</h4>
                <p>${isVariable ? 'Preço Variável' : s.price + '€'}</p>
            </div>
            <div class="actions">
                <button class="icon-btn edit-s"><i data-lucide="edit-3" style="width:18px"></i></button>
                <button class="icon-btn del-s red"><i data-lucide="trash-2" style="width:18px"></i></button>
            </div>
        `;
        item.querySelector('.edit-s').onclick = () => openServiceModal(s);
        item.querySelector('.del-s').onclick = async () => { if(confirm('Eliminar?')) await remove(ref(db, "services/" + s.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderAdminClients() {
    const list = document.getElementById('admin-clients-list'); if(!list) return;
    list.innerHTML = '';
    state.clients.forEach(cl => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-item-info">
                <h4>${cl.name}</h4>
                <p>${cl.email}</p>
            </div>
            <div class="actions">
                <button class="icon-btn edit-c"><i data-lucide="edit-3" style="width:18px"></i></button>
                <button class="icon-btn del-c red"><i data-lucide="trash-2" style="width:18px"></i></button>
            </div>
        `;
        item.querySelector('.edit-c').onclick = () => openClientModal(cl);
        item.querySelector('.del-c').onclick = async () => { if(confirm('Eliminar?')) await remove(ref(db, "clients/" + cl.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function renderGlobalAgenda() {
    const list = document.getElementById('all-bookings-list'); if(!list) return;
    list.innerHTML = '';
    state.bookings.forEach(b => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-item-info">
                <h4>${b.serviceName}</h4>
                <p>${b.clientName} • ${b.date} • ${b.time}</p>
                <p style="font-size:11px; margin-top:4px;"><strong>Morada:</strong> ${b.address || 'Não definida'}</p>
                ${b.observations ? `<p style="font-size:11px; color:#6b7280; font-style:italic;">"${b.observations}"</p>` : ''}
                <div style="margin-top:5px"><span class="status-badge ${b.status.replace(/ /g,'-').toLowerCase()}">${b.status}</span></div>
            </div>
            <div class="actions">
                ${b.status === 'Pendente' ? `<button class="btn-small set-p" style="background:var(--primary-yellow-vibrant);">Definir Preço</button>` : ''}
                ${b.status === 'Pendente' && b.finalPrice ? `<button class="btn-small confirm-b" style="background:#4ade80; color:white;">Confirmar</button>` : ''}
                ${b.status !== 'Cancelado' && b.status !== 'Recusado' ? `<button class="btn-small cancel-admin-b" style="background:#fee2e2; color:#b91c1c;">Cancelar</button>` : ''}
                <button class="icon-btn del-b red"><i data-lucide="trash-2" style="width:18px"></i></button>
            </div>
        `;
        const pBtn = item.querySelector('.set-p');
        if(pBtn) pBtn.onclick = async () => {
            const p = prompt('Preço final (€)?', b.finalPrice || '');
            if(p) {
                await update(ref(db, "bookings/" + b.id), { status: 'Aguardando Cliente', finalPrice: p });
                showPriceProposedEmail({ ...b, finalPrice: p });
            }
        };

        const confBtn = item.querySelector('.confirm-b');
        if(confBtn) confBtn.onclick = async () => {
            if(confirm('Confirmar este agendamento?')) {
                await update(ref(db, "bookings/" + b.id), { status: 'Confirmado' });
                showStatusUpdateEmail({ ...b, status: 'Confirmado' });
            }
        };

        const cancBtn = item.querySelector('.cancel-admin-b');
        if(cancBtn) cancBtn.onclick = async () => {
            if(confirm('Cancelar este agendamento?')) {
                await update(ref(db, "bookings/" + b.id), { status: 'Cancelado' });
                showStatusUpdateEmail({ ...b, status: 'Cancelado' });
            }
        };
        item.querySelector('.del-b').onclick = async () => { if(confirm('Remover?')) await remove(ref(db, "bookings/" + b.id)); };
        list.appendChild(item);
    });
    window.lucide.createIcons();
}

function openServiceModal(s = null) {
    state.editingServiceId = s ? s.id : null;
    document.getElementById('admin-service-name').value = s ? s.name : '';
    document.getElementById('admin-service-price').value = s ? (s.price || '') : '';
    document.getElementById('admin-service-desc').value = s ? (s.desc || '') : '';
    document.getElementById('admin-service-custom').checked = s?.isCustom || false;
    document.getElementById('admin-modal').classList.remove('hidden');
}

async function saveService() {
    const data = { 
        name: document.getElementById('admin-service-name').value, 
        price: document.getElementById('admin-service-price').value, 
        desc: document.getElementById('admin-service-desc').value,
        isCustom: document.getElementById('admin-service-custom').checked
    };
    if(state.editingServiceId) await update(ref(db, "services/" + state.editingServiceId), data);
    else await push(ref(db, "services"), data);
    document.getElementById('admin-modal').classList.add('hidden');
    showToast('Serviço Configurado!');
}

function openClientModal(c = null) {
    state.editingClientId = c ? c.id : null;
    document.getElementById('client-name').value = c ? (c.name || '') : '';
    document.getElementById('client-email').value = c ? (c.email || '') : '';
    document.getElementById('client-contact').value = c ? (c.contact || '') : '';
    document.getElementById('client-nif').value = c ? (c.nif || '') : '';
    document.getElementById('client-address').value = c ? (c.address || '') : '';
    document.getElementById('password-group').classList.toggle('hidden', !c);
    if(c) document.getElementById('client-password').value = c.password || '';
    document.getElementById('client-modal').classList.remove('hidden');
}

async function saveClient() {
    const pass = document.getElementById('client-password')?.value || Math.random().toString(36).slice(-6).toUpperCase();
    const email = document.getElementById('client-email').value;
    const data = { 
        name: document.getElementById('client-name').value, 
        email: email,
        contact: document.getElementById('client-contact').value,
        nif: document.getElementById('client-nif').value,
        address: document.getElementById('client-address').value,
        password: pass,
        role: 'client'
    };
    if(state.editingClientId) {
        await update(ref(db, "clients/" + state.editingClientId), data);
        if(state.editingClientId === state.currentUser?.id) {
            state.currentUser = { ...state.currentUser, ...data };
            sessionStorage.setItem('cleaning-session', JSON.stringify(state.currentUser));
            loginSuccess();
        }
    } else {
        await push(ref(db, "clients"), data);
        showWelcomeEmail(email, pass);
    }
    document.getElementById('client-modal').classList.add('hidden');
    showToast('Cliente Salvo!');
}

function triggerEmailSimulation(to, subject, content) {
    const body = document.getElementById('email-body-content');
    const overlay = document.getElementById('email-sending-overlay');
    const success = document.getElementById('email-sent-success');
    const closeBtn = document.getElementById('close-email-modal');
    if(!body) return;
    
    body.innerHTML = content;
    const footer = document.getElementById('email-footer-actions');
    const mailtoBtn = document.getElementById('open-native-email');
    if(footer) footer.classList.add('hidden');
    overlay.classList.remove('hidden');
    success.classList.add('hidden');
    
    // Link para App Nativa (Mailto)
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s\s+/g, ' ').trim();
    if(mailtoBtn) {
        mailtoBtn.href = "#"; // Reset
        mailtoBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainText)}`;
        };
    }

    document.getElementById('email-modal').classList.remove('hidden');
    window.lucide.createIcons();

    // Envio Real via EmailJS (Opcional)
    if (window.emailjs && to !== "admin@fastlimpezas.com") {
        emailjs.send("SERVICE_ID", "TEMPLATE_ID", {
            to_email: to,
            subject: subject,
            message_html: content
        }).then(() => console.log("Real Email Sent!"))
          .catch(err => console.error("EmailJS Error:", err));
    }

    setTimeout(() => {
        overlay.classList.add('hidden');
        success.classList.remove('hidden');
        setTimeout(() => {
            success.classList.add('hidden');
            if(footer) footer.classList.remove('hidden');
        }, 1200);
    }, 1500);
}

function showWelcomeEmail(e, p) { 
    const subject = "Bem-vindo à FastLimpezas!";
    const content = `<h3>Bem-vindo à FastLimpezas</h3><p>Olá,</p><hr><p>A sua conta foi criada com sucesso.</p><div class="credentials-box"><p>Email: <strong>${e}</strong></p><p>Senha: <strong>${p}</strong></p></div><p>Acede já para marcar a tua primeira limpeza!</p>`;
    triggerEmailSimulation(e, subject, content); 
}

function showNewBookingEmail(bk) { 
    const subject = "Pedido de Limpeza Recebido";
    const content = `<h3>Pedido de Limpeza Recebido</h3><p>Confirmamos que recebemos o seu pedido para <strong>${bk.serviceName}</strong>.</p><p>Data: <strong>${bk.date}</strong> às <strong>${bk.time}</strong>.</p><hr><p>Iremos analisar o seu pedido e entraremos em contacto brevemente.</p>`;
    triggerEmailSimulation(bk.clientEmail, subject, content); 
}

function showPriceProposedEmail(bk) { 
    const subject = "Orçamento Proposto - FastLimpezas";
    const content = `<h3>Orçamento Proposto</h3><p>Olá ${bk.clientName}, propomos o valor de <strong>${bk.finalPrice}€</strong> para a sua limpeza de <strong>${bk.serviceName}</strong>.</p><hr><p>Pode aceitar ou propor alterações através da aplicação clicando em "Limpezas".</p>`;
    triggerEmailSimulation(bk.clientEmail, subject, content); 
}

function showStatusUpdateEmail(bk) { 
    const subject = "Atualização do seu Serviço";
    let msg = "";
    if(bk.status === 'Confirmado') msg = `O seu serviço de <strong>${bk.serviceName}</strong> para o dia <strong>${bk.date}</strong> foi <strong>Confirmado</strong>.`;
    else if(bk.status === 'Cancelado') msg = `O serviço de <strong>${bk.serviceName}</strong> para o dia <strong>${bk.date}</strong> foi <strong>Cancelado</strong>.`;
    else if(bk.status === 'Recusado') msg = `O orçamento para o serviço de <strong>${bk.serviceName}</strong> foi <strong>Recusado</strong>.`;
    
    const content = `<h3>Atualização de Serviço</h3><p>Olá ${bk.clientName || 'Cliente'},</p><hr><p>${msg}</p><p>Obrigado por escolher a FastLimpezas!</p>`;
    triggerEmailSimulation(bk.clientEmail, subject, content); 
}

function openBookingModal(s = null) {
    const sS = document.getElementById('booking-service-select');
    const cS = document.getElementById('booking-client-select');
    if (!sS || !cS) return;

    // Reset Checkbox Morada
    const cb = document.getElementById('use-profile-address');
    if(cb) cb.checked = false;
    document.getElementById('profile-address-msg').classList.add('hidden');

    sS.innerHTML = state.cleaningTypes.map(tp => `<option value="${tp.id}">${tp.name}</option>`).join('');
    cS.innerHTML = state.clients.map(cl => `<option value="${cl.id}">${cl.name}</option>`).join('');
    
    if(s) sS.value = s.id;
    
    const addrField = document.getElementById('booking-address');
    addrField.value = '';
    
    if(state.currentUser.role === 'client') {
        document.getElementById('client-select-container').classList.add('hidden');
        cS.value = state.currentUser.id;
    } else {
        document.getElementById('client-select-container').classList.remove('hidden');
    }
    
    document.getElementById('booking-modal').classList.remove('hidden');
}

async function handleBookingSubmit() {
    const sid = document.getElementById('booking-service-select').value;
    const cid = document.getElementById('booking-client-select').value;
    const dateVal = document.getElementById('booking-date').value;
    const timeVal = document.getElementById('booking-time').value;
    
    if(!dateVal || !timeVal) return showToast('Data/Hora Obrigatório!', 'error');

    // Validação Robusta de Domingo (Ignora fusos horários UTC)
    const [y, m, d] = dateVal.split('-').map(Number);
    const selectedDate = new Date(y, m - 1, d);
    if(selectedDate.getDay() === 0) return showToast('Estamos encerrados ao Domingo!', 'error');
    
    if(timeVal < '08:00' || timeVal > '17:00') return showToast('Horário: 08:00 às 17:00!', 'error');

    const s = state.cleaningTypes.find(t => t.id === sid);
    const c = state.clients.find(cl => cl.id === cid);
    const isVariable = s.isCustom || !s.price || s.price === '0' || s.price === 0;
    const data = {
        serviceName: s.name, 
        clientName: c.name, 
        clientEmail: c.email,
        clientId: c.id, 
        date: dateVal,
        time: timeVal,
        address: document.getElementById('booking-address').value,
        observations: document.getElementById('booking-observations').value,
        status: 'Pendente',
        finalPrice: !isVariable ? s.price : null
    };
    await push(ref(db, "bookings"), data);
    document.getElementById('booking-modal').classList.add('hidden');
    
    if(!isVariable) {
        showNewBookingEmail({ ...data, isDirect: true });
    } else {
        showNewBookingEmail(data);
    }
}

function showToast(m) {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = m;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}
