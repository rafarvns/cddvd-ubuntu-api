/**
 * BurnStation - Frontend Logic
 */

const API_BASE = '/api';
const POLLING_INTERVAL = 2000;

// State
let files = [];
let history = [];
let currentJob = null;
let pollInterval = null;

// DOM Elements
const elements = {
    serverStatus: document.getElementById('server-status'),
    fileList: document.getElementById('file-list'),
    fileSearch: document.getElementById('file-search'),
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
        const resp = await fetch(`${API_BASE}/files`);
        files = await resp.json();
        renderFiles();
    } catch (e) {
        console.error('Failed to fetch files', e);
    }
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
    try {
        const resp = await fetch(`${API_BASE}/burn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: filename })
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
function renderFiles() {
    const filter = elements.fileSearch.value.toLowerCase();
    const filtered = files.filter(f => f.filename.toLowerCase().includes(filter));
    
    elements.fileList.innerHTML = filtered.map(f => `
        <div class="file-item">
            <div class="file-info">
                <span class="file-name">${f.filename}</span>
                <span class="file-type">${f.type} media</span>
            </div>
            <button class="btn primary small" onclick="showConfirm('${f.filename}')">Burn</button>
        </div>
    `).join('') || '<p class="meta">No files found</p>';
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
function showConfirm(filename) {
    elements.toBurnFile.textContent = filename;
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
