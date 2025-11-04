// --- MOCK DE DATOS (Simulación de Supabase PostgreSQL) ---
// Los IDs son mockeados y autoincrementales para la simulación

let MOCK_DATA = {
    admin: { email: 'admin@mock.com', password: 'password' }, // Simulación de Supabase Auth
    clients: [
        { id: 'cli_001', name: 'Innovatech Solutions', email: 'innovatech@example.com' },
        { id: 'cli_002', name: 'Global Dynamics Corp', email: 'global@example.com' },
    ],
    projects: [
        { id: 'proj_001', clientId: 'cli_001', name: 'System Migration Phase 1', status: 'Activo', budget: 15000, balance: 3000 },
        { id: 'proj_002', clientId: 'cli_001', name: 'Mobile App Development', status: 'Cerrado', budget: 10000, balance: 0 },
        { id: 'proj_003', clientId: 'cli_002', name: 'Q3 Marketing Campaign', status: 'Activo', budget: 8000, balance: 4000 },
    ],
    payments: [
        { id: 'pay_001', projectId: 'proj_001', date: '2025-01-15', amount: 5000, type: 'Inicial' },
        { id: 'pay_002', projectId: 'proj_001', date: '2025-02-28', amount: 7000, type: 'Hito 1' },
        { id: 'pay_003', projectId: 'proj_002', date: '2025-05-01', amount: 10000, type: 'Total' },
        { id: 'pay_004', projectId: 'proj_003', date: '2025-07-20', amount: 4000, type: 'Inicial' },
    ],
    tokens: [
        { token: 'TKN-ABC-123', clientId: 'cli_001', expires_at: Date.now() + 86400000 }, // Válido por 24h
        { token: 'TKN-XYZ-456', clientId: 'cli_002', expires_at: Date.now() - 3600000 }, // Expirado
    ],
    logs: [
        { timestamp: Date.now(), action: 'ADMIN_INIT', detail: 'Sistema de reportes iniciado' },
    ]
};

// Emails de administrador permitidos (pueden inyectarse desde index.html como window.ADMIN_EMAILS)
const ADMIN_EMAILS = (window.ADMIN_EMAILS || [MOCK_DATA.admin.email]).map(e => String(e).toLowerCase());

function isAdminUser(user) {
    if (!user) return false;
    const email = String(user.email || '').toLowerCase();
    if (ADMIN_EMAILS.includes(email)) return true;
    // revisar metadata si se configuró un role='admin'
    try {
        if (user.user_metadata && String(user.user_metadata.role).toLowerCase() === 'admin') return true;
        if (user.app_metadata && String(user.app_metadata.role).toLowerCase() === 'admin') return true;
    } catch (e) {
        // ignore
    }
    return false;
}

// --- ESTADO DE LA APLICACIÓN ---
const state = {
    currentView: 'login', // 'login', 'admin', 'client'
    clientData: null, // Datos del cliente si está en la vista 'client'
    isAdminAuthenticated: false,
    adminSubView: 'projects', // 'clients', 'projects', 'payments', 'logs'
    message: '',
    adminData: { clients: [], projects: [], payments: [] }
};

// --- UTILIDADES GLOBALES ---

/** Muestra un mensaje en un modal (reemplazo seguro para alert()) */
function showMessage(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('message-modal').classList.remove('hidden');
}

/** Formatea un número como moneda */
const formatCurrency = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);

/** Genera un ID único (simulación de UUID) */
const generateId = (prefix) => `${prefix}_${Math.random().toString(36).substring(2, 9)}`;

/** Guarda una acción en los logs */
function logAction(action, detail) {
    MOCK_DATA.logs.unshift({ timestamp: Date.now(), action, detail });
    // Limitar logs a 50
    if (MOCK_DATA.logs.length > 50) {
        MOCK_DATA.logs.pop();
    }
    renderApp(); // Para que el Admin Panel lo muestre automáticamente
}

/** Cambia la vista de la aplicación y re-renderiza */
function setView(view, data = null) {
    state.currentView = view;
    state.clientData = data;
    if (view === 'admin' && window.supabase) { loadAdminData(); }
    renderApp();
}

// --- MOCK DE FUNCIONES DE BACKEND (EDGE FUNCTIONS) ---

/** MOCK: POST a /get-client-data (Valida el token y devuelve datos) */
async function fetchClientData(token) {
    // If FUNCTIONS_BASE_URL is configured, call the deployed Edge Function
    if (window.FUNCTIONS_BASE_URL) {
        try {
            const res = await fetch(`${window.FUNCTIONS_BASE_URL}/get-client-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                // Log unsuccessful access attempt locally for debugging (does not persist)
                logAction('ACCESS_DENIED', `Edge function denied token ${token}: ${json?.error || res.status}`);
                return { success: false, status: res.status, message: json?.error || 'Error validating token' };
            }
            // Expect { success: true, data: { client, projects, payments } }
            return { success: true, status: 200, data: json.data };
        } catch (err) {
            console.error('fetchClientData error', err);
            return { success: false, status: 500, message: String(err) };
        }
    }

    // Fallback: in-memory mock (development)
    return new Promise((resolve) => {
        setTimeout(() => { // Simula latencia de red
            const now = Date.now();
            const tokenEntry = MOCK_DATA.tokens.find(t => t.token === token);

            if (!tokenEntry) {
                logAction('ACCESS_DENIED', `Intento de acceso con token inválido: ${token}`);
                return resolve({ success: false, status: 404, message: 'Token no encontrado o inválido.' });
            }

            if (tokenEntry.expires_at < now) {
                logAction('ACCESS_DENIED', `Token expirado para cliente: ${tokenEntry.clientId}`);
                return resolve({ success: false, status: 403, message: 'El enlace de acceso ha expirado (más de 24 horas).' });
            }

            const client = MOCK_DATA.clients.find(c => c.id === tokenEntry.clientId);
            if (!client) {
                return resolve({ success: false, status: 404, message: 'Cliente asociado al token no encontrado.' });
            }

            const clientProjects = MOCK_DATA.projects.filter(p => p.clientId === client.id);
            const clientPayments = MOCK_DATA.payments.filter(p => clientProjects.some(proj => proj.id === p.projectId));

            logAction('CLIENT_ACCESS', `Acceso concedido al cliente: ${client.name}`);

            resolve({
                success: true,
                status: 200,
                data: {
                    client,
                    projects: clientProjects,
                    payments: clientPayments
                }
            });
        }, 500);
    });
}

/** MOCK: POST a /generate-client-link (Genera un token temporal) */
async function generateTokenLink(clientId) {
    // If FUNCTIONS_BASE_URL is configured, call the generate-token Edge Function
    if (window.FUNCTIONS_BASE_URL) {
        try {
            const res = await fetch(`${window.FUNCTIONS_BASE_URL}/generate-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: Number(clientId) })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || 'Error generating token');
            // Expect { success: true, link, token, expires_at }
            logAction('LINK_GENERATED', `Enlace temporal creado para el cliente: ${clientId}`);
            return json.link;
        } catch (err) {
            console.error('generateTokenLink error', err);
            throw err;
        }
    }

    // Fallback: in-memory mock (development)
    // Elimina tokens antiguos para este cliente para mantener la limpieza
    MOCK_DATA.tokens = MOCK_DATA.tokens.filter(t => t.clientId !== clientId || t.expires_at < Date.now());

    const newToken = `TKN-${generateId('ACC')}`.toUpperCase();
    const expiresAt = Date.now() + 86400000; // 24 horas
    MOCK_DATA.tokens.push({ token: newToken, clientId, expires_at: expiresAt });

    logAction('LINK_GENERATED', `Enlace temporal creado para el cliente: ${clientId}`);

    // URL completa para el cliente (simulación de Vercel/dominio)
    const link = `${window.location.origin}${window.location.pathname}?token=${newToken}`;
    return link;
}

// --- LÓGICA DE GESTIÓN (CRUD MOCK - ADMIN) ---

// --- INTEGRACIÓN SUPABASE CRUD (ADMIN) ---
async function supabaseNextId(table) {
    const { data, error } = await window.supabase.from(table).select('id').order('id', { ascending: false }).limit(1);
    if (error) throw error;
    return (data && data[0]?.id ? Number(data[0].id) + 1 : 1);
}
const statusIntToStr = (s) => Number(s) === 1 ? 'Activo' : 'Cerrado';
const statusStrToInt = (s) => String(s) === 'Activo' ? 1 : 0;

async function loadAdminData() {
    if (!window.supabase) return;
    try {
        const [cliRes, projRes, payRes] = await Promise.all([
            window.supabase.from('clients').select('id,name,email').order('id'),
            window.supabase.from('projects').select('id,client_id,name,status,budget,balance').order('id'),
            window.supabase.from('payments').select('id,project_id,date,amount,type').order('id')
        ]);
        if (cliRes.error) throw cliRes.error;
        if (projRes.error) throw projRes.error;
        if (payRes.error) throw payRes.error;
        state.adminData.clients = (cliRes.data || []).map(c => ({ id: c.id, name: c.name, email: c.email }));
        state.adminData.projects = (projRes.data || []).map(p => ({
            id: p.id, clientId: p.client_id, name: p.name,
            status: statusIntToStr(p.status), budget: Number(p.budget), balance: Number(p.balance)
        }));
        state.adminData.payments = (payRes.data || []).map(p => ({
            id: p.id, projectId: p.project_id, date: p.date, amount: Number(p.amount), type: p.type
        }));
        renderApp();
    } catch (e) {
        console.warn('loadAdminData error', e);
        showMessage('Error', 'No se pudo cargar datos desde la base.');
    }
}

function addClient() {
    const name = document.getElementById('new-client-name').value.trim();
    const email = document.getElementById('new-client-email').value.trim();

    if (!name || !email) {
        showMessage('Error', 'Por favor, complete el nombre y el email del cliente.');
        return;
    }

    if (window.supabase) {
        (async () => {
            try {
                // Let the DB generate the id (use default/sequence). Return the inserted row to get its id if needed.
                const { data, error } = await window.supabase.from('clients').insert([{ name, email }]).select('id').single();
                if (error) throw error;
                const id = data?.id;
                logAction('CLIENT_CREATE', `Cliente creado: ${name}`);
                showMessage('Éxito', `Cliente ${name} agregado correctamente.`);
                document.getElementById('new-client-name').value = '';
                document.getElementById('new-client-email').value = '';
                await loadAdminData();
            } catch (e) {
                showMessage('Error', String(e.message || e));
            }
        })();
        return;
    }

    const newClient = {
        id: generateId('cli'),
        name: name,
        email: email
    };

    MOCK_DATA.clients.push(newClient);
    logAction('CLIENT_CREATE', `Cliente creado: ${name}`);
    showMessage('Éxito', `Cliente **${name}** agregado correctamente.`);
    // Limpiar formulario y re-renderizar
    document.getElementById('new-client-name').value = '';
    document.getElementById('new-client-email').value = '';
    renderApp();
}

function addProject() {
    const form = document.getElementById('new-project-form');
    const clientId = form['new-project-client'].value;
    const name = form['new-project-name'].value.trim();
    const budget = parseFloat(form['new-project-budget'].value) || 0;
    const status = form['new-project-status'].value;

    if (!clientId || !name || budget <= 0) {
        showMessage('Error', 'Revise todos los campos. El presupuesto debe ser mayor a 0.');
        return;
    }

    if (window.supabase) {
        (async () => {
            try {
                // Let the DB generate the project id. Insert without id and retrieve the created record.
                const row = { client_id: Number(clientId), name, status: statusStrToInt(status), budget, balance: budget };
                const { data, error } = await window.supabase.from('projects').insert([row]).select('id').single();
                if (error) throw error;
                const id = data?.id;
                logAction('PROJECT_CREATE', `Proyecto creado: ${name} (Cliente: ${clientId})`);
                showMessage('Éxito', `Proyecto ${name} agregado correctamente. Balance inicial: ${formatCurrency(budget)}`);
                form.reset();
                await loadAdminData();
            } catch (e) {
                showMessage('Error', String(e.message || e));
            }
        })();
        return;
    }

    const newProject = {
        id: generateId('proj'),
        clientId: clientId,
        name: name,
        status: status,
        budget: budget,
        balance: budget // Al inicio, el balance es igual al presupuesto
    };

    MOCK_DATA.projects.push(newProject);
    logAction('PROJECT_CREATE', `Proyecto creado: ${name} (Cliente: ${clientId})`);
    showMessage('Éxito', `Proyecto **${name}** agregado correctamente. Balance inicial: ${formatCurrency(budget)}`);
    form.reset();
    renderApp();
}

function addPayment() {
    const form = document.getElementById('new-payment-form');
    const projectId = form['new-payment-project'].value;
    const amount = parseFloat(form['new-payment-amount'].value) || 0;
    const type = form['new-payment-type'].value;
    const date = new Date().toISOString().split('T')[0]; // Fecha actual

    if (window.supabase) {
        (async () => {
            try {
                // Let DB generate payment id; insert and get inserted id if needed
                const { data: insertData, error: insErr } = await window.supabase.from('payments').insert([{ project_id: Number(projectId), date, amount, type }]).select('id').single();
                if (insErr) throw insErr;
                const id = insertData?.id;
                const { data: proj, error: selErr } = await window.supabase.from('projects').select('id,balance').eq('id', Number(projectId)).single();
                if (selErr) throw selErr;
                const newBalance = Math.max(0, Number(proj.balance) - amount);
                const newStatus = newBalance === 0 ? 0 : 1;
                const { error: upErr } = await window.supabase.from('projects').update({ balance: newBalance, status: newStatus }).eq('id', Number(projectId));
                if (upErr) throw upErr;
                logAction('PAYMENT_CREATE', `Pago de ${formatCurrency(amount)} registrado para proyecto: ${projectId}`);
                showMessage('Éxito', `Pago de ${formatCurrency(amount)} registrado. Balance actualizado: ${formatCurrency(newBalance)}`);
                form.reset();
                await loadAdminData();
            } catch (e) {
                showMessage('Error', String(e.message || e));
            }
        })();
        return;
    }

    const project = MOCK_DATA.projects.find(p => p.id === projectId);

    if (!projectId || !project || amount <= 0) {
        showMessage('Error', 'Revise el proyecto y el monto del pago.');
        return;
    }

    if (amount > project.balance) {
        showMessage('Advertencia', `El monto de pago (${formatCurrency(amount)}) excede el balance pendiente del proyecto (${formatCurrency(project.balance)}).`);
        // Continuar con el pago, ajustando el balance a 0
    }

    const newPayment = {
        id: generateId('pay'),
        projectId: projectId,
        date: date,
        amount: amount,
        type: type
    };

    // Actualizar el balance del proyecto
    project.balance = Math.max(0, project.balance - amount);
    if (project.balance === 0) {
        project.status = 'Cerrado'; // Marcar como cerrado si el balance llega a 0
    }

    MOCK_DATA.payments.push(newPayment);
    logAction('PAYMENT_CREATE', `Pago de ${formatCurrency(amount)} registrado para proyecto: ${project.name}`);
    showMessage('Éxito', `Pago de **${formatCurrency(amount)}** registrado. Balance actualizado: ${formatCurrency(project.balance)}`);
    form.reset();
    renderApp();
}

// --- Edit/Update/Delete (CRUD extra) ---
function editClient(id) {
    const list = window.supabase ? state.adminData.clients : MOCK_DATA.clients;
    const c = list.find(x => String(x.id) === String(id));
    if (!c) return showMessage('Error', 'Cliente no encontrado');
    const name = prompt('Nombre', c.name);
    if (name === null) return;
    const email = prompt('Email', c.email);
    if (email === null) return;
    if (window.supabase) {
        (async () => {
            try {
                const { error } = await window.supabase.from('clients').update({ name, email }).eq('id', Number(id));
                if (error) throw error;
                await loadAdminData();
            } catch (e) { showMessage('Error', String(e.message || e)); }
        })();
    } else {
        c.name = name; c.email = email; renderApp();
    }
}

function deleteClient(id) {
    if (!confirm('¿Eliminar cliente? Esta acción puede requerir eliminar proyectos primero.')) return;
    if (window.supabase) {
        (async () => {
            try {
                const { data: pr } = await window.supabase.from('projects').select('id').eq('client_id', Number(id)).limit(1);
                if (pr && pr.length) return showMessage('Bloqueado', 'Elimine proyectos del cliente primero.');
                const { error } = await window.supabase.from('clients').delete().eq('id', Number(id));
                if (error) throw error;
                await loadAdminData();
            } catch (e) { showMessage('Error', String(e.message || e)); }
        })();
    } else {
        MOCK_DATA.clients = MOCK_DATA.clients.filter(x => String(x.id) !== String(id));
        renderApp();
    }
}

function editProject(id) {
    const projs = window.supabase ? state.adminData.projects : MOCK_DATA.projects;
    const clients = window.supabase ? state.adminData.clients : MOCK_DATA.clients;
    const pays = window.supabase ? state.adminData.payments : MOCK_DATA.payments;
    const p = projs.find(x => String(x.id) === String(id));
    if (!p) return showMessage('Error', 'Proyecto no encontrado');
    const name = prompt('Nombre', p.name); if (name === null) return;
    const status = prompt("Estado ('Activo'/'Cerrado')", p.status); if (status === null) return;
    const budgetStr = prompt('Presupuesto', String(p.budget)); if (budgetStr === null) return;
    const budget = parseFloat(budgetStr) || 0;
    const paidSum = pays.filter(x => String(x.projectId) === String(id)).reduce((s, x) => s + Number(x.amount), 0);
    const newBalance = Math.max(0, budget - paidSum);
    if (window.supabase) {
        (async () => {
            try {
                const { error } = await window.supabase.from('projects').update({ name, status: statusStrToInt(status), budget, balance: newBalance }).eq('id', Number(id));
                if (error) throw error;
                await loadAdminData();
            } catch (e) { showMessage('Error', String(e.message || e)); }
        })();
    } else {
        p.name = name; p.status = status; p.budget = budget; p.balance = newBalance; renderApp();
    }
}

function deleteProject(id) {
    if (!confirm('¿Eliminar proyecto? Si tiene pagos, elimínelos primero.')) return;
    if (window.supabase) {
        (async () => {
            try {
                const { data: py } = await window.supabase.from('payments').select('id').eq('project_id', Number(id)).limit(1);
                if (py && py.length) return showMessage('Bloqueado', 'Elimine pagos del proyecto primero.');
                const { error } = await window.supabase.from('projects').delete().eq('id', Number(id));
                if (error) throw error;
                await loadAdminData();
            } catch (e) { showMessage('Error', String(e.message || e)); }
        })();
    } else {
        MOCK_DATA.projects = MOCK_DATA.projects.filter(x => String(x.id) !== String(id));
        MOCK_DATA.payments = MOCK_DATA.payments.filter(x => String(x.projectId) !== String(id));
        renderApp();
    }
}

function editPayment(id) {
    const pays = window.supabase ? state.adminData.payments : MOCK_DATA.payments;
    const projs = window.supabase ? state.adminData.projects : MOCK_DATA.projects;
    const pay = pays.find(x => String(x.id) === String(id));
    if (!pay) return showMessage('Error', 'Pago no encontrado');
    const date = prompt('Fecha (YYYY-MM-DD)', pay.date); if (date === null) return;
    const type = prompt('Tipo', pay.type); if (type === null) return;
    const amtStr = prompt('Monto', String(pay.amount)); if (amtStr === null) return;
    const amount = parseFloat(amtStr) || 0;
    const delta = amount - Number(pay.amount);
    if (window.supabase) {
        (async () => {
            try {
                const { error: upPayErr } = await window.supabase.from('payments').update({ date, type, amount }).eq('id', Number(id));
                if (upPayErr) throw upPayErr;
                const { data: proj } = await window.supabase.from('projects').select('balance').eq('id', Number(pay.projectId)).single();
                const newBalance = Math.max(0, Number(proj.balance) - delta);
                const newStatus = newBalance === 0 ? 0 : 1;
                const { error: upProjErr } = await window.supabase.from('projects').update({ balance: newBalance, status: newStatus }).eq('id', Number(pay.projectId));
                if (upProjErr) throw upProjErr;
                await loadAdminData();
            } catch (e) { showMessage('Error', String(e.message || e)); }
        })();
    } else {
        const project = projs.find(x => String(x.id) === String(pay.projectId));
        project.balance = Math.max(0, project.balance - delta);
        project.status = project.balance === 0 ? 'Cerrado' : 'Activo';
        pay.date = date; pay.type = type; pay.amount = amount; renderApp();
    }
}

function deletePayment(id) {
    if (!confirm('¿Eliminar pago?')) return;
    const pays = window.supabase ? state.adminData.payments : MOCK_DATA.payments;
    const projs = window.supabase ? state.adminData.projects : MOCK_DATA.projects;
    const pay = pays.find(x => String(x.id) === String(id));
    if (!pay) return showMessage('Error', 'Pago no encontrado');
    if (window.supabase) {
        (async () => {
            try {
                const { data: proj } = await window.supabase.from('projects').select('balance').eq('id', Number(pay.projectId)).single();
                const newBalance = Math.max(0, Number(proj.balance) + Number(pay.amount));
                const newStatus = newBalance === 0 ? 0 : 1;
                const { error: upProjErr } = await window.supabase.from('projects').update({ balance: newBalance, status: newStatus }).eq('id', Number(pay.projectId));
                if (upProjErr) throw upProjErr;
                const { error } = await window.supabase.from('payments').delete().eq('id', Number(id));
                if (error) throw error;
                await loadAdminData();
            } catch (e) { showMessage('Error', String(e.message || e)); }
        })();
    } else {
        const project = projs.find(x => String(x.id) === String(pay.projectId));
        project.balance = Math.max(0, project.balance + Number(pay.amount));
        project.status = project.balance === 0 ? 'Cerrado' : 'Activo';
        MOCK_DATA.payments = MOCK_DATA.payments.filter(x => String(x.id) !== String(id));
        renderApp();
    }
}

async function createClientLink(clientId) {
    try {
        const link = await generateTokenLink(clientId);
        // Obtener nombre del cliente desde el estado (si existe) o desde el mock
        const client = (window.supabase ? (state.adminData.clients || []).find(c => String(c.id) === String(clientId)) : null) || MOCK_DATA.clients.find(c => c.id === clientId) || { name: 'Cliente' };
        const clientName = client.name || 'Cliente';
        const content = `
            <p>Enlace temporal generado para <strong>${clientName}</strong>.</p>
            <input id="link-input" type="text" readonly value="${link}" class="w-full p-2 border border-gray-300 rounded-lg my-3 text-sm" />
            <button onclick="copyLink()" class="w-full bg-green-500 text-white p-3 rounded-lg font-semibold hover:bg-green-600 transition mt-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="inline-block mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copiar Enlace
            </button>
        `;
        showMessage('Enlace Generado', content);
    } catch (err) {
        showMessage('Error', `No se pudo generar el enlace: ${String(err.message || err)}`);
    }
}

/** Mostrar la vista de reportes para un cliente (admin) */
async function viewClientReports(clientId) {
    try {
        let client = null;
        let projects = [];
        let payments = [];

        if (window.supabase) {
            // Intentar usar datos cargados en estado para evitar llamadas extra
            client = (state.adminData.clients || []).find(c => String(c.id) === String(clientId));
            if (!client) {
                const { data: cdata, error: cerr } = await window.supabase.from('clients').select('id,name,email').eq('id', Number(clientId)).single();
                if (cerr) throw cerr;
                client = cdata;
            }

            const { data: pdata, error: perr } = await window.supabase.from('projects').select('id,client_id,name,status,budget,balance').eq('client_id', Number(clientId)).order('id');
            if (perr) throw perr;
            projects = (pdata || []).map(p => ({ id: p.id, clientId: p.client_id, name: p.name, status: statusIntToStr(p.status), budget: Number(p.budget), balance: Number(p.balance) }));

            const projectIds = projects.map(p => p.id);
            if (projectIds.length) {
                const { data: paydata, error: payerr } = await window.supabase.from('payments').select('id,project_id,date,amount,type').in('project_id', projectIds).order('id');
                if (payerr) throw payerr;
                payments = (paydata || []).map(p => ({ id: p.id, projectId: p.project_id, date: p.date, amount: Number(p.amount), type: p.type }));
            } else {
                payments = [];
            }
        } else {
            client = MOCK_DATA.clients.find(c => c.id === clientId) || null;
            projects = MOCK_DATA.projects.filter(p => p.clientId === clientId);
            payments = MOCK_DATA.payments.filter(pay => projects.some(pr => pr.id === pay.projectId));
        }

        if (!client) return showMessage('Error', 'Cliente no encontrado para mostrar reportes.');

        // Renderizar la vista de cliente con los datos recolectados
        setView('client', { client, projects, payments });
    } catch (err) {
        console.error('viewClientReports error', err);
        showMessage('Error', `No se pudo cargar reportes del cliente: ${String(err.message || err)}`);
    }
}

function copyLink() {
    const linkInput = document.getElementById('link-input');
    linkInput.select();
    document.execCommand('copy');
    showMessage('Copiado', 'El enlace de acceso temporal ha sido copiado al portapapeles.');
}

// --- FUNCIONES DE AUTENTICACIÓN Y RENDERIZADO PRINCIPAL ---

function handleAdminLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    if (email === MOCK_DATA.admin.email && password === MOCK_DATA.admin.password) {
        state.isAdminAuthenticated = true;
        logAction('ADMIN_LOGIN', 'Inicio de sesión exitoso.');
        state.adminSubView = 'projects';
        setView('admin');
    } else {
        showMessage('Error de Autenticación', 'Credenciales inválidas. Por favor, intente de nuevo.');
        logAction('ADMIN_LOGIN_FAIL', 'Fallo en el intento de inicio de sesión.');
    }
}

function handleAdminLogout() {
    // Si el admin está autenticado vía Supabase, cerrar la sesión de Supabase
    if (state.user) {
        // cierra sesión en Supabase y vuelve a la vista de login
        handleUserSignOut();
        logAction('ADMIN_LOGOUT', 'Cierre de sesión (Supabase).');
        return;
    }

    // Flujo antiguo (mock)
    state.isAdminAuthenticated = false;
    logAction('ADMIN_LOGOUT', 'Cierre de sesión.');
    setView('login');
}

// --- INTEGRACIÓN CON SUPABASE (USUARIOS) ---

async function handleUserSignUp() {
    const email = document.getElementById('user-signup-email').value.trim();
    const password = document.getElementById('user-signup-password').value.trim();
    if (!email || !password) return showMessage('Error', 'Ingrese email y contraseña para registrarse.');

    try {
        const { data, error } = await window.supabase.auth.signUp({ email, password });
        if (error) return showMessage('Error registro', error.message || JSON.stringify(error));

        // Si la confirmación por email está habilitada, data.user existe pero session puede ser null
        if (data?.session) {
            state.user = data.session.user;
            // Todas las sesiones autenticadas ven el panel admin
            state.isAdminAuthenticated = true;
            state.adminSubView = 'projects';
            setView('admin');
            showMessage('Registro exitoso', `Bienvenido ${state.user.email}`);
        } else {
            showMessage('Registro recibido', 'Revise su email para confirmar la cuenta si aplica.');
        }
    } catch (err) {
        showMessage('Error', String(err));
    }
}

async function handleUserSignIn() {
    const email = document.getElementById('user-signin-email').value.trim();
    const password = document.getElementById('user-signin-password').value.trim();
    if (!email || !password) return showMessage('Error', 'Ingrese email y contraseña para iniciar sesión.');

    try {
        const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
        if (error) return showMessage('Error login', error.message || JSON.stringify(error));
        state.user = data.session?.user || data.user;
        // Todas las sesiones autenticadas ven el panel admin
        state.isAdminAuthenticated = true;
        logAction('ADMIN_LOGIN', `Inicio de sesión: ${state.user.email}`);
        state.adminSubView = 'projects';
        setView('admin');
        showMessage('Sesión iniciada', `Hola ${state.user.email}`);
    } catch (err) {
        showMessage('Error', String(err));
    }
}

async function handleUserSignOut() {
    try {
        await window.supabase.auth.signOut();
        state.user = null;
        setView('login');
    } catch (err) {
        showMessage('Error', 'No fue posible cerrar la sesión.');
    }
}

function printReport() {
    window.print();
}

// --- COMPONENTES DE VISTA ---

/** RENDER: Vista de Login */
function renderLogin() {
    // Vista principal: login admin + enlaces a vistas separadas para usuario (login / register)
    return `
        <div class="flex items-center justify-center min-h-[80vh] print-area">
            <div class="w-full max-w-md bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <h2 class="text-2xl font-extrabold text-gray-900 mb-4">Acceso de Usuario</h2>
                <p class="text-sm text-gray-500 mb-4">Inicia sesión o regístrate con tu cuenta (Supabase).</p>
                <div class="space-y-3 mt-6">
                    <button onclick="setView('user-login')" class="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700">Login de Usuario</button>
                    <button onclick="setView('user-register')" class="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700">Registro de Usuario</button>
                </div>
            </div>
        </div>
    `;
}

/** RENDER: Vista de Login de Usuario (Supabase) */
function renderUserLogin() {
    return `
        <div class="flex items-center justify-center min-h-[80vh]">
            <div class="w-full max-w-md bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <h2 class="text-2xl font-bold mb-4">Iniciar sesión (Usuario)</h2>
                <p class="text-sm text-gray-500 mb-4">Ingrese sus credenciales para acceder.</p>
                <form onsubmit="event.preventDefault(); handleUserSignIn();">
                    <input id="user-signin-email" type="email" placeholder="Email" class="w-full p-3 border rounded-lg mb-3" required />
                    <input id="user-signin-password" type="password" placeholder="Contraseña" class="w-full p-3 border rounded-lg mb-4" required />
                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Entrar</button>
                        <button type="button" onclick="setView('login')" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg">Volver</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

/** RENDER: Vista de Registro de Usuario (Supabase) */
function renderUserRegister() {
    return `
        <div class="flex items-center justify-center min-h-[80vh]">
            <div class="w-full max-w-md bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <h2 class="text-2xl font-bold mb-4">Registro de Usuario</h2>
                <p class="text-sm text-gray-500 mb-4">Crea una cuenta nueva con tu email y contraseña.</p>
                <form onsubmit="event.preventDefault(); handleUserSignUp();">
                    <input id="user-signup-email" type="email" placeholder="Email" class="w-full p-3 border rounded-lg mb-3" required />
                    <input id="user-signup-password" type="password" placeholder="Contraseña" class="w-full p-3 border rounded-lg mb-4" required />
                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 bg-green-600 text-white py-2 rounded-lg">Crear Cuenta</button>
                        <button type="button" onclick="setView('login')" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg">Volver</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

/** RENDER: Panel simple para usuario autenticado (Supabase) */
function renderUserDashboard() {
    const email = state.user?.email || 'Usuario';
    return `
        <div class="max-w-4xl mx-auto">
            <header class="flex justify-between items-center mb-6">
                <h1 class="text-2xl font-bold">Panel de Usuario</h1>
                <div class="flex items-center gap-3">
                    <span class="text-sm text-gray-600">${email}</span>
                    <button onclick="handleUserSignOut()" class="btn btn-danger">Cerrar sesión</button>
                </div>
            </header>
            <main class="bg-white p-6 rounded-lg shadow-sm">
                <p class="text-gray-700">Bienvenido, <strong>${email}</strong>. Este es un panel mínimo que confirma que la autenticación con Supabase funciona.</p>
                <p class="text-sm text-gray-500 mt-4">Aquí podrías mostrar información protegida, llamadas a la API con Authorization: Bearer &lt;access_token&gt;, o links a la configuración de cuenta.</p>
            </main>
        </div>
    `;
}

/** RENDER: Panel de Cliente (Solo Lectura) */
function renderClientDashboard(data) {
    const { client, projects, payments } = data;

    // Cálculos Totales
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
    const totalPending = projects.reduce((sum, p) => sum + p.balance, 0);
    const totalProjectCount = projects.length;
    const activeProjectsCount = projects.filter(p => p.status === 'Activo').length;
    const progress = totalBudget > 0 ? ((totalPaid / totalBudget) * 100).toFixed(0) : 0;

    return `
        <div class="max-w-6xl mx-auto print-area">
            <header class="flex justify-between items-center mb-8 no-print">
                <h1 class="text-3xl font-extrabold text-gray-900">
                    Dashboard de Cliente
                </h1>
                <div class="flex space-x-3">
                    <button onclick="printReport()" class="btn btn-ghost flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-2"><path d="M19 8H5a2 2 0 0 0-2 2v6h4v4h10v-4h4v-6a2 2 0 0 0-2-2z"/><rect x="7" y="3" width="10" height="5" rx="1" ry="1"/></svg>
                        Generar PDF
                    </button>
                    <button onclick="setView('login')" class="btn btn-danger">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Salir
                    </button>
                </div>
            </header>

            <div class="bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <!-- ENCABEZADO PARA IMPRESIÓN -->
                <div class="print-only mb-6">
                    <h1 class="text-2xl font-bold mb-1">Reporte Financiero: ${client.name}</h1>
                    <p class="text-sm text-gray-500">Fecha del Reporte: ${new Date().toLocaleDateString('es-ES')}</p>
                </div>
                <!-- FIN ENCABEZADO -->

                <h2 class="text-2xl font-bold mb-4 text-blue-600 border-b pb-2">
                    Estado Financiero de ${client.name}
                </h2>

                <!-- Indicadores Clave -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p class="text-sm font-medium text-gray-500">Total Presupuestado</p>
                        <p class="text-2xl font-semibold text-gray-900">${formatCurrency(totalBudget)}</p>
                    </div>
                    <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                        <p class="text-sm font-medium text-gray-500">Total Pagado</p>
                        <p class="text-2xl font-semibold text-green-600">${formatCurrency(totalPaid)}</p>
                    </div>
                    <div class="p-4 bg-red-50 rounded-lg border border-red-200">
                        <p class="text-sm font-medium text-gray-500">Total Pendiente</p>
                        <p class="text-2xl font-semibold text-red-600">${formatCurrency(totalPending)}</p>
                    </div>
                    <div class="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p class="text-sm font-medium text-gray-500">Proyectos Activos</p>
                        <p class="text-2xl font-semibold text-gray-900">${activeProjectsCount} de ${totalProjectCount}</p>
                    </div>
                </div>

                <!-- Barra de Progreso -->
                <div class="mb-8">
                    <p class="text-lg font-medium text-gray-700 mb-2">Progreso General de Inversión (${progress}%)</p>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%;"></div>
                    </div>
                </div>

                <!-- Proyectos -->
                <h3 class="text-xl font-bold mb-4 text-gray-700">Proyectos Actuales e Históricos</h3>
                <div class="overflow-x-auto mb-8">
                    <table class="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presupuesto</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pagado</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${projects.map(p => {
                                const paid = MOCK_DATA.payments.filter(pay => pay.projectId === p.id).reduce((sum, pay) => sum + pay.amount, 0);
                                const statusColor = p.status === 'Activo' ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100';
                                return `
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${p.name}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(p.budget)}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(paid)}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">${formatCurrency(p.balance)}</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
                                                ${p.status}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Historial de Pagos -->
                <h3 class="text-xl font-bold mb-4 text-gray-700">Historial de Pagos</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo de Pago</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${payments.map(p => {
                                const project = projects.find(proj => proj.id === p.projectId) || { name: 'N/A' };
                                return `
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${p.date}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${project.name}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.type}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">${formatCurrency(p.amount)}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

/** RENDER: Panel de Administración (CRUD y Logs) */
function renderAdminDashboard() {
    const clients = window.supabase ? state.adminData.clients : MOCK_DATA.clients;
    const projects = window.supabase ? state.adminData.projects : MOCK_DATA.projects;
    const payments = window.supabase ? state.adminData.payments : MOCK_DATA.payments;
    const clientOptions = clients.map(c => `<option value="${c.id}">${c.name} (${c.email})</option>`).join('');
    const projectOptions = projects.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');

    const renderSubView = () => {
        switch (state.adminSubView) {
            case 'clients':
                return renderAdminClients(clients);
            case 'projects':
                return renderAdminProjects(clientOptions, clients, projects);
            case 'payments':
                return renderAdminPayments(projectOptions, projects, payments);
            case 'logs':
                return renderAdminLogs();
            default:
                return `<div class="p-8 text-center text-gray-500">Seleccione una opción del menú.</div>`;
        }
    };

    return `
        <div class="max-w-7xl mx-auto print-area">
            <header class="flex flex-col sm:flex-row justify-between items-center mb-8 pb-4 border-b border-gray-300 no-print">
                <h1 class="text-3xl font-extrabold text-gray-900 mb-4 sm:mb-0">
                    Panel Administrativo <span class="text-sm font-normal text-gray-500">(Supabase CRUD Mock)</span>
                </h1>
                <button onclick="handleAdminLogout()" class="btn btn-danger">Cerrar Sesión</button>
            </header>

            <!-- Navegación de Sub-vistas -->
            <div class="no-print mb-8">
                <nav class="flex space-x-1 p-1 bg-white rounded-xl shadow-inner border border-gray-200">
                    ${['clients', 'projects', 'payments', 'logs'].map(view => {
                        const title = { 'clients': 'Clientes', 'projects': 'Proyectos', 'payments': 'Pagos', 'logs': 'Auditoría (Logs)' }[view];
                        const isActive = state.adminSubView === view;
                        return `
                            <button onclick="state.adminSubView='${view}'; renderApp();"
                                    class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition ${isActive ? 'bg-blue-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}">
                                ${title}
                            </button>
                        `;
                    }).join('')}
                </nav>
            </div>

            <!-- Contenido de Sub-vista -->
            <div id="admin-sub-content" class="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                ${renderSubView()}
            </div>
        </div>
    `;
}

/** RENDER: Sub-vista Admin - Clientes */
function renderAdminClients(clients) {
    return `
        <h2 class="text-2xl font-bold mb-6 text-gray-800">Gestión de Clientes y Acceso</h2>
        
        <!-- Formulario Nuevo Cliente -->
        <div class="mb-8 p-4 panel-lg border border-blue-200 bg-blue-50 rounded-lg">
            <h3 class="text-lg font-semibold mb-3 text-blue-800">Crear Nuevo Cliente</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" id="new-client-name" placeholder="Nombre de la Empresa" class="p-2 border rounded-lg">
                <input type="email" id="new-client-email" placeholder="Email de Contacto" class="p-2 border rounded-lg">
                <button onclick="addClient()" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Crear Cliente
                </button>
            </div>
        </div>

        <!-- Lista de Clientes -->
        <h3 class="text-xl font-bold mb-4 text-gray-700">Lista de Clientes (${clients.length})</h3>
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Acciones</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${clients.map(c => `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${c.name}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${c.email}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-center no-print">
                                <div class="inline-flex items-center justify-center gap-2">
                                    <button onclick="createClientLink('${c.id}')" class="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-md text-sm hover:bg-indigo-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5"/><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 19"/></svg>
                                        Generar enlace
                                    </button>
                                    <button onclick="viewClientReports(${JSON.stringify(c.id)})" class="px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm hover:bg-blue-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="M17 3v8H7V3"/></svg>
                                        Reportes
                                    </button>
                                    <button onclick="editClient(${JSON.stringify(c.id)})" class="px-3 py-1 bg-gray-50 text-gray-800 rounded-md text-sm hover:bg-gray-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                                        Editar
                                    </button>
                                    <button onclick="deleteClient(${JSON.stringify(c.id)})" class="px-3 py-1 bg-red-50 text-red-700 rounded-md text-sm hover:bg-red-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                                        Eliminar
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/** RENDER: Sub-vista Admin - Proyectos */
function renderAdminProjects(clientOptions, clients, projects) {
    return `
        <h2 class="text-2xl font-bold mb-6 text-gray-800">Gestión de Proyectos</h2>

        <!-- Formulario Nuevo Proyecto -->
        <div class="mb-8 p-4 border border-green-200 bg-green-50 rounded-lg">
            <h3 class="text-lg font-semibold mb-3 text-green-800">Crear Nuevo Proyecto</h3>
            <form id="new-project-form" onsubmit="event.preventDefault(); addProject();" class="grid grid-cols-1 md:grid-cols-5 gap-4">
                <select name="new-project-client" class="p-2 border rounded-lg col-span-2" required>
                    <option value="">-- Seleccionar Cliente --</option>
                    ${clientOptions}
                </select>
                <input type="text" name="new-project-name" placeholder="Nombre del Proyecto" class="p-2 border rounded-lg col-span-1" required>
                <input type="number" name="new-project-budget" placeholder="Presupuesto Total" step="100" min="0" class="p-2 border rounded-lg" required>
                <select name="new-project-status" class="p-2 border rounded-lg">
                    <option value="Activo">Activo</option>
                    <option value="Cerrado">Cerrado</option>
                </select>
                <button type="submit" class="bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-semibold col-span-5 md:col-span-1">
                    Crear Proyecto
                </button>
            </form>
        </div>

        <!-- Lista de Proyectos -->
        <h3 class="text-xl font-bold mb-4 text-gray-700">Proyectos Registrados (${projects.length})</h3>
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presupuesto</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance Pendiente</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Acciones</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${projects.map(p => {
                        const client = clients.find(c => c.id === p.clientId) || { name: 'N/A' };
                        const statusColor = p.status === 'Activo' ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100';
                        return `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${p.name}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${client.name}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(p.budget)}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${p.balance > 0 ? 'text-red-600' : 'text-gray-500'}">${formatCurrency(p.balance)}</td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
                                        ${p.status}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-center no-print space-x-2">
                                    <button onclick="editProject(${JSON.stringify(p.id)})" class="text-blue-600 hover:text-blue-800 font-medium text-sm">Editar</button>
                                    <button onclick="deleteProject(${JSON.stringify(p.id)})" class="text-red-600 hover:text-red-800 font-medium text-sm">Eliminar</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/** RENDER: Sub-vista Admin - Pagos */
function renderAdminPayments(projectOptions, projects, payments) {
    return `
        <h2 class="text-2xl font-bold mb-6 text-gray-800">Gestión de Pagos</h2>

        <!-- Formulario Nuevo Pago -->
        <div class="mb-8 p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <h3 class="text-lg font-semibold mb-3 text-yellow-800">Registrar Nuevo Pago</h3>
            <form id="new-payment-form" onsubmit="event.preventDefault(); addPayment();" class="grid grid-cols-1 md:grid-cols-5 gap-4">
                <select name="new-payment-project" class="p-2 border rounded-lg col-span-2" required>
                    <option value="">-- Seleccionar Proyecto --</option>
                    ${projectOptions}
                </select>
                <input type="number" name="new-payment-amount" placeholder="Monto del Pago" step="any" min="1" class="p-2 border rounded-lg" required>
                <select name="new-payment-type" class="p-2 border rounded-lg">
                    <option value="Inicial">Pago Inicial</option>
                    <option value="Hito">Hito de Proyecto</option>
                    <option value="Total">Pago Final/Total</option>
                </select>
                <button type="submit" class="bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700 transition font-semibold col-span-5 md:col-span-1">
                    Registrar Pago
                </button>
            </form>
        </div>

        <!-- Historial de Pagos -->
        <h3 class="text-xl font-bold mb-4 text-gray-700">Historial de Pagos (${payments.length})</h3>
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${payments.map(p => {
                        const project = projects.find(proj => proj.id === p.projectId) || { name: 'N/A' };
                        return `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${p.date}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${project.name}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.type}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">${formatCurrency(p.amount)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/** RENDER: Sub-vista Admin - Logs */
function renderAdminLogs() {
    return `
        <h2 class="text-2xl font-bold mb-6 text-gray-800">Logs de Auditoría</h2>
        <p class="text-sm text-gray-500 mb-4">Registro de todas las acciones administrativas y de acceso (Simulación de la tabla 'logs').</p>
        <div class="space-y-3 max-h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg border">
            ${MOCK_DATA.logs.map(log => `
                <div class="p-3 bg-white rounded-lg shadow-sm border border-gray-100 text-sm flex justify-between items-start">
                    <div class="flex-grow">
                        <span class="font-semibold text-gray-700">${new Date(log.timestamp).toLocaleString('es-ES')}</span>
                        <span class="mx-2 text-gray-400">|</span>
                        <span class="font-mono text-xs px-2 py-0.5 rounded-full ${log.action.includes('LOGIN') || log.action.includes('ACCESS_DENIED') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">${log.action}</span>
                    </div>
                    <p class="text-gray-600 ml-4 flex-shrink-0 max-w-[70%]">${log.detail}</p>
                </div>
            `).join('')}
        </div>
    `;
}

/** RENDER PRINCIPAL */
function renderApp() {
    const appDiv = document.getElementById('app');
    appDiv.innerHTML = ''; // Limpiar contenido previo

    if (state.currentView === 'login') {
        appDiv.innerHTML = renderLogin();
    } else if (state.currentView === 'admin') {
        appDiv.innerHTML = renderAdminDashboard();
    } else if (state.currentView === 'user') {
        appDiv.innerHTML = renderUserDashboard();
    } else if (state.currentView === 'user-login') {
        appDiv.innerHTML = renderUserLogin();
    } else if (state.currentView === 'user-register') {
        appDiv.innerHTML = renderUserRegister();
    } else if (state.currentView === 'client' && state.clientData) {
        appDiv.innerHTML = renderClientDashboard(state.clientData);
    } else {
        // Caso por defecto: error o token inválido
        appDiv.innerHTML = `
            <div class="flex items-center justify-center min-h-[80vh]">
                <div class="text-center p-8 bg-white rounded-xl shadow-lg">
                    <h1 class="text-3xl font-bold text-red-600 mb-4">Acceso Denegado</h1>
                    <p class="text-gray-600 mb-6">${state.message || 'El token de acceso es inválido o ha expirado. Contacte a su administrador.'}</p>
                    <button onclick="setView('login')" class="bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition">
                        Volver al Inicio
                    </button>
                </div>
            </div>
        `;
    }
}

// --- INICIALIZACIÓN DE LA APLICACIÓN ---

async function initializeApp() {
    // Primero: si hay una sesión activa en Supabase, mostrar la vista de usuario
    try {
        if (window.supabase) {
            const { data: { session } } = await window.supabase.auth.getSession();
            if (session) {
                state.user = session.user;
                // Todas las sesiones autenticadas ven el panel admin
                state.isAdminAuthenticated = true;
                state.adminSubView = 'clients';
                setView('admin');
                return;
            }
        }
    } catch (e) {
        console.warn('No se pudo obtener sesión de Supabase', e);
    }

    // Suscribirse a cambios de estado de autenticación (útil para OAuth/magic links)
    try {
        if (window.supabase && typeof window.supabase.auth.onAuthStateChange === 'function') {
            window.supabase.auth.onAuthStateChange((event, session) => {
                console.log('Supabase auth event:', event);
                state.user = session?.user || null;
                if (event === 'SIGNED_IN') {
                    // limpiar URL para evitar tokens en la barra de direcciones
                    try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) { /* ignore */ }
                    // Todas las sesiones autenticadas ven el panel admin
                    state.isAdminAuthenticated = true;
                    state.adminSubView = 'projects';
                    setView('admin');
                } else if (event === 'SIGNED_OUT') {
                    state.user = null;
                    state.isAdminAuthenticated = false;
                    setView('login');
                }
            });
        }
    } catch (e) {
        console.warn('No se pudo subscribir a onAuthStateChange', e);
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
        // Flujo de Acceso del Cliente: /dashboard.html?token={TOKEN}
        const loadingScreen = document.getElementById('app');
        loadingScreen.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen">
                <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                <p class="mt-4 text-lg text-gray-600">Validando token de acceso...</p>
            </div>
        `;
        
        const response = await fetchClientData(token); // Llama al MOCK de Edge Function

        if (response.success) {
            setView('client', response.data);
        } else {
            state.message = response.message;
            setView('error');
        }
    } else {
        // Flujo de Acceso del Administrador
        setView('login');
    }
}

window.onload = initializeApp;
