/**
 * BurnStation - Frontend Logic
 */

const API_BASE = '/api';
const POLLING_INTERVAL = 2000;

// State
let currentDir = { path: '', parent: null, dirs: [], files: [] };
let history = [];
let currentJob = null;
let pollInterval = null;

// DOM Elements
const elements = {
    serverStatus: document.getElementById('server-status'),
    fileList: document.getElementById('file-list'),
    fileSearch: document.getElementById('file-search'),
    breadcrumb: document.getElementById('breadcrumb'),
    historyList: document.getElementById('history-list'),
    burningPanel: document.getElementById('burning-now'),
    currentFilename: document.getElementById('current-filename'),
    currentMeta: document.getElementById('current-meta'),
    jobProgress: document.getElementById('job-progress'),
    jobProgressText: document.getElementById('job-progress-text'),
    jobLogs: document.getElementById('job-logs'),
    currentJobId: document.getElementById('current-job-id'),
    btnEject: document.getElementById('btn-eject'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnCancel: document.getElementById('btn-cancel'),
    targetDevice: document.getElementById('target-device'),
    isosDir: document.getElementById('isos-dir'),
    // Modal
    confirmModal: document.getElementById('confirm-modal'),
    toBurnFile: document.getElementById('to-burn-file'),
    modalConfirm: document.getElementById('modal-confirm'),
    modalCancel: document.getElementById('modal-cancel'),
    optSpeed: document.getElementById('opt-speed'),
    optBurnfree: document.getElementById('opt-burnfree'),
    fieldBurnfree: document.getElementById('field-burnfree'),
    optVerify: document.getElementById('opt-verify'),
    fieldVerify: document.getElementById('field-verify'),
    optDummy: document.getElementById('opt-dummy'),
    optEject: document.getElementById('opt-eject'),
};

// Initial Load
async function init() {
    registerListeners();
    await checkHealth();
    await refreshData();
    startBackgroundPolling();
}

function registerListeners() {
    elements.btnRefresh.addEventListener('click', refreshData);
    elements.btnEject.addEventListener('click', ejectDrive);
    elements.btnCancel.addEventListener('click', () => {
        if (currentJob) cancelJob(currentJob.id);
    });
    
    elements.fileSearch.addEventListener('input', renderFiles);

    // Navegação por diretórios (delegação de eventos)
    elements.fileList.addEventListener('click', (e) => {
        const folder = e.target.closest('.folder-item');
        if (folder) navigateTo(folder.dataset.path);
    });
    elements.breadcrumb.addEventListener('click', (e) => {
        const crumb = e.target.closest('.crumb');
        if (crumb) navigateTo(crumb.dataset.path);
    });
    
    elements.modalCancel.addEventListener('click', hideModal);
}

// API Interactions
async function checkHealth() {
    try {
        const resp = await fetch('/health');
        const data = await resp.json();
        elements.serverStatus.classList.add('online');
        elements.serverStatus.querySelector('.text').textContent = 'Online';
        elements.targetDevice.textContent = `Device: ${data.device}`;
        elements.isosDir.textContent = `Dir: ${data.isosDir}`;
    } catch (e) {
        elements.serverStatus.classList.remove('online');
        elements.serverStatus.querySelector('.text').textContent = 'Offline';
    }
}

async function refreshData() {
    await Promise.all([fetchFiles(), fetchHistory()]);
}

async function fetchFiles() {
    try {
        const resp = await fetch(`${API_BASE}/browse?path=${encodeURIComponent(currentDir.path)}`);
        if (!resp.ok) {
            // Diretório sumiu (ex.: removido) — volta para a raiz
            if (currentDir.path) return navigateTo('');
            throw new Error(`HTTP ${resp.status}`);
        }
        currentDir = await resp.json();
        renderBreadcrumb();
        renderFiles();
    } catch (e) {
        console.error('Failed to fetch files', e);
    }
}

async function navigateTo(relativePath) {
    currentDir.path = relativePath;
    elements.fileSearch.value = '';
    await fetchFiles();
}

async function fetchHistory() {
    try {
        const resp = await fetch(`${API_BASE}/history/all`);
        history = await resp.json();
        renderHistory();
        
        // Find if any job is running
        const activeJob = history.find(j => j.status === 'running' || j.status === 'pending');
        if (activeJob) {
            updateActiveJobUI(activeJob);
        } else {
            elements.burningPanel.style.display = 'none';
            currentJob = null;
        }
    } catch (e) {
        console.error('Failed to fetch history', e);
    }
}

async function ejectDrive() {
    elements.btnEject.disabled = true;
    try {
        await fetch(`${API_BASE}/drive/eject`, { method: 'POST' });
        alert('Eject command sent');
    } catch (e) {
        alert('Failed to eject');
    } finally {
        elements.btnEject.disabled = false;
    }
}

async function startBurn(filename) {
    const speedRaw = elements.optSpeed.value.trim();
    const options = {
        dummy: elements.optDummy.checked,
        eject: elements.optEject.checked,
        burnfree: elements.optBurnfree.checked,
        verify: elements.optVerify.checked,
    };
    // Só envia speed se preenchido; vazio = automático (padrão do servidor)
    if (speedRaw !== '') options.speed = parseInt(speedRaw, 10);

    try {
        const resp = await fetch(`${API_BASE}/burn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: filename, options })
        });
        const data = await resp.json();
        hideModal();
        refreshData();
    } catch (e) {
        alert('Error starting burn job');
    }
}

async function cancelJob(id) {
    if (!confirm('Are you sure you want to abort? This might ruin the disc.')) return;
    try {
        await fetch(`${API_BASE}/burn/${id}/cancel`, { method: 'POST' });
        refreshData();
    } catch (e) {
        alert('Failed to cancel job');
    }
}

// Polling for active job
function startBackgroundPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        if (currentJob) {
            try {
                const resp = await fetch(`${API_BASE}/burn/${currentJob.id}`);
                const data = await resp.json();
                updateActiveJobUI(data);
                
                if (data.status !== 'running' && data.status !== 'pending') {
                    // Refresh history to show finished job
                    setTimeout(refreshData, 1000);
                }
            } catch (e) {
                console.error('Polling error', e);
            }
        } else {
            // Check for new jobs occasionally
            fetchHistory();
        }
        checkHealth();
    }, POLLING_INTERVAL);
}

// UI Rendering
function baseName(p) {
    return p.split('/').pop();
}

function renderBreadcrumb() {
    const segments = currentDir.path ? currentDir.path.split('/') : [];
    let acc = '';
    const crumbs = [`<span class="crumb root" data-path="">💿 root</span>`];
    for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg;
        crumbs.push('<span class="crumb-sep">/</span>');
        crumbs.push(`<span class="crumb" data-path="${acc}">${seg}</span>`);
    }
    // Último segmento é a pasta atual: não navegável
    if (crumbs.length > 1) {
        const lastIdx = crumbs.length - 1;
        crumbs[lastIdx] = crumbs[lastIdx].replace('class="crumb"', 'class="crumb current"');
    }
    elements.breadcrumb.innerHTML = crumbs.join('');
}

function renderFiles() {
    const filter = elements.fileSearch.value.toLowerCase();

    const dirs = currentDir.dirs.filter(d => baseName(d).toLowerCase().includes(filter));
    const files = currentDir.files.filter(f => baseName(f.filename).toLowerCase().includes(filter));

    const upRow = currentDir.path
        ? `<div class="file-item folder-item up" data-path="${currentDir.parent || ''}">
               <div class="file-info"><span class="file-name">📁 ..</span></div>
           </div>`
        : '';

    const dirRows = dirs.map(d => `
        <div class="file-item folder-item" data-path="${d}">
            <div class="file-info">
                <span class="file-name">📁 ${baseName(d)}</span>
            </div>
            <span class="file-type">folder</span>
        </div>
    `).join('');

    const fileRows = files.map(f => `
        <div class="file-item">
            <div class="file-info">
                <span class="file-name">💿 ${baseName(f.filename)}</span>
                <span class="file-type">${f.type} media</span>
            </div>
            <button class="btn primary small" onclick="showConfirm('${f.filename}', '${f.type}')">Burn</button>
        </div>
    `).join('');

    elements.fileList.innerHTML = upRow + dirRows + fileRows
        || '<p class="meta">No files found</p>';
}

function renderHistory() {
    elements.historyList.innerHTML = history.slice(0, 10).map(j => `
        <div class="history-item">
            <div class="history-top">
                <span class="history-file">${j.file}</span>
                <span class="history-status status-${j.status}">${j.status}</span>
            </div>
            <span class="history-time">${new Date(j.createdAt).toLocaleString()}</span>
        </div>
    `).join('') || '<p class="meta">No history yet</p>';
}

function updateActiveJobUI(job) {
    currentJob = job;
    elements.burningPanel.style.display = 'block';
    elements.currentFilename.textContent = job.file;
    elements.currentJobId.textContent = `#${job.id.split('-')[0]}`;
    elements.currentMeta.textContent = `Status: ${job.status.toUpperCase()} | Started: ${new Date(job.startedAt || job.createdAt).toLocaleTimeString()}`;
    
    const progress = job.progress || 0;
    elements.jobProgress.style.width = `${progress}%`;
    elements.jobProgressText.textContent = `${progress}%`;
    
    // Update logs
    if (job.logs && job.logs.length > 0) {
        const lastLog = job.logs.join('\n');
        if (elements.jobLogs.innerText !== lastLog) {
            elements.jobLogs.innerText = lastLog;
            elements.jobLogs.scrollTop = elements.jobLogs.scrollHeight;
        }
    }
}

// Modal Logic
function showConfirm(filename, type) {
    elements.toBurnFile.textContent = filename;
    // burnfree só se aplica ao PS1 (cdrdao). No PS2 (growisofs) a proteção
    // contra buffer underrun é automática, então escondemos a opção.
    elements.fieldBurnfree.style.display = type === 'ps1' ? '' : 'none';
    // verify só está implementado para PS2 (DVD/growisofs).
    elements.fieldVerify.style.display = type === 'ps2' ? '' : 'none';
    elements.confirmModal.classList.add('active');
    elements.modalConfirm.onclick = () => startBurn(filename);
}

function hideModal() {
    elements.confirmModal.classList.remove('active');
}

// Global scope for onclick
window.showConfirm = showConfirm;

// Go
init();
