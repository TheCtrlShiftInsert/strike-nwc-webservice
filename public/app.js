// WebSocket connection for real-time updates
let ws = null;
let reconnectInterval = null;
let statusUpdateInterval = null;
let transactionUpdateInterval = null;
let currentFilter = 'all';
let allTransactions = [];
let balanceDisplayUnit = 'sats';

// DOM elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  relayStatus: document.getElementById('relayStatus'),
  uptime: document.getElementById('uptime'),
  totalSent: document.getElementById('totalSent'),
  invoiceCount: document.getElementById('invoiceCount'),
  balanceFeature: document.getElementById('balanceFeature'),
  txHistoryFeature: document.getElementById('txHistoryFeature'),
  testAclButton: document.getElementById('testAclButton'),
  aclResults: document.getElementById('aclResults'),
  logsContainer: document.getElementById('logsContainer'),
  clearLogsButton: document.getElementById('clearLogsButton'),
  autoScroll: document.getElementById('autoScroll'),
  transactionsContainer: document.getElementById('transactionsContainer'),
  totalBalance: document.getElementById('totalBalance'),
  incoming24h: document.getElementById('incoming24h'),
  outgoing24h: document.getElementById('outgoing24h'),
  balanceLastUpdated: document.getElementById('balanceLastUpdated'),
  balanceDisplayToggles: document.querySelectorAll('input[name="balanceDisplay"]'),
  balanceCard: document.getElementById('balanceCard'),
  transactionCard: document.getElementById('transactionCard'),
  serviceStatusIndicator: document.getElementById('serviceStatusIndicator'),
  serviceStatusText: document.getElementById('serviceStatusText'),
  serviceInstallBtn: document.getElementById('serviceInstallBtn'),
  serviceUninstallBtn: document.getElementById('serviceUninstallBtn'),
  serviceRestartBtn: document.getElementById('serviceRestartBtn'),
  restartWarning: document.getElementById('restartWarning'),
  restartCountdown: document.getElementById('restartCountdown'),
  installModal: document.getElementById('installModal'),
  closeModal: document.getElementById('closeModal'),
  installCommand: document.getElementById('installCommand'),
  copyCommandBtn: document.getElementById('copyCommandBtn')
};

// Feature flag states
let balanceEnabled = false;
let transactionHistoryEnabled = false;

/**
 * Convert millisats to BTC
 */
const satsToBtc = (millisats) => {
  return millisats / 1000 / 100_000_000;
};

/**
 * Format balance with appropriate decimals
 */
const formatBalance = (millisats, unit) => {
  if (unit === 'sats') {
    return `${Math.floor(millisats / 1000).toLocaleString()} sats`;
  } else {
    const btc = satsToBtc(millisats);
    return `${btc.toFixed(8)} BTC`;
  }
};

/**
 * Fetch balance data
 */
const fetchBalance = async () => {
  if (!balanceEnabled) {
    return;
  }

  try {
    const response = await fetch('/api/balance');
    const balanceData = await response.json();
    renderBalance(balanceData);
  } catch (err) {
    console.error('Error fetching balance:', err);
  }
};

/**
 * Render balance to DOM
 */
const renderBalance = (balanceData) => {
  elements.totalBalance.textContent = formatBalance(balanceData.totalBalance, balanceDisplayUnit);
  elements.incoming24h.textContent = formatBalance(balanceData.incoming24h, balanceDisplayUnit);
  elements.outgoing24h.textContent = `${balanceData.quotaUsed.toLocaleString()} / ${balanceData.quotaMax.toLocaleString()} sats`;

  if (balanceData.lastUpdated) {
    elements.balanceLastUpdated.textContent = `Last updated: ${formatTimestamp(balanceData.lastUpdated)}`;
  } else {
    elements.balanceLastUpdated.textContent = 'Last updated: --';
  }
};

/**
 * Format uptime duration
 */
const formatUptime = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

/**
 * Format timestamp
 */
const formatTimestamp = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour12: false });
};

/**
 * Update connection status badge
 */
const updateConnectionStatus = (connected) => {
  elements.statusDot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  elements.statusText.textContent = connected ? 'Connected' : 'Disconnected';
};

/**
 * Fetch and display status
 */
const fetchStatus = async () => {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();

    // Update connection status
    updateConnectionStatus(status.relay.connected);

    // Update relay status
   // elements.relayStatus.textContent = status.relay.connected ? 'Connected' : 'Disconnected';
    //elements.relayStatus.style.color = status.relay.connected ? 'var(--success)' : 'var(--error)';

    // Update uptime
    elements.uptime.textContent = formatUptime(status.uptime);

    // Update payment stats
    // elements.totalSent.textContent = `${status.payments.totalSent.toLocaleString()} sats`;
    //elements.invoiceCount.textContent = status.connectionCount;

    // Also fetch balance if enabled
    if (balanceEnabled) {
      await fetchBalance();
    }
  } catch (err) {
    console.error('Error fetching status:', err);
  }
};

/**
 * Fetch and display config
 */
const fetchConfig = async () => {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    balanceEnabled = config.features.balanceEnabled;
    transactionHistoryEnabled = config.features.transactionHistoryEnabled;

    // Show/hide cards based on feature flags
    if (elements.balanceCard) {
      elements.balanceCard.style.display = balanceEnabled ? 'block' : 'none';
    }
    if (elements.transactionCard) {
      elements.transactionCard.style.display = transactionHistoryEnabled ? 'block' : 'none';
    }

    // Update features status
    //////const balanceStatus = elements.balanceFeature.querySelector('.feature-status');
    //balanceStatus.textContent = balanceEnabled ? 'Enabled' : 'Disabled';
    //balanceStatus.className = `feature-status ${balanceEnabled ? 'enabled' : 'disabled'}`;

    //const txHistoryStatus = elements.txHistoryFeature.querySelector('.feature-status');
    //txHistoryStatus.textContent = transactionHistoryEnabled ? 'Enabled' : 'Disabled';
    //txHistoryStatus.className = `feature-status ${transactionHistoryEnabled ? 'enabled' : 'disabled'}`;
  } catch (err) {
    console.error('Error fetching config:', err);
  }
};

/**
 * Add log entry to logs container
 */
const addLogEntry = (entry) => {
  const logDiv = document.createElement('div');
  logDiv.className = 'log-entry';

  const timestamp = document.createElement('span');
  timestamp.className = 'log-timestamp';
  timestamp.textContent = formatTimestamp(entry.timestamp);

  const level = document.createElement('span');
  level.className = `log-level ${entry.level}`;
  level.textContent = entry.level.toUpperCase();

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = entry.message;

  logDiv.appendChild(timestamp);
  logDiv.appendChild(level);
  logDiv.appendChild(message);

  elements.logsContainer.appendChild(logDiv);

  // Auto-scroll if enabled
  if (elements.autoScroll.checked) {
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
  }
};

/**
 * Connect to WebSocket for log streaming
 */
const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/logs`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const entry = JSON.parse(event.data);
      addLogEntry(entry);
    } catch (err) {
      console.error('Error parsing log entry:', err);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, attempting to reconnect...');
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connectWebSocket, 5000);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
};

/**
 * Test ACLs
 */
const testACLs = async () => {
  elements.testAclButton.disabled = true;
  elements.testAclButton.textContent = 'Testing...';
  elements.aclResults.innerHTML = '';

  try {
    const response = await fetch('/api/test-acl', {
      method: 'POST'
    });

    const results = await response.json();

    Object.entries(results).forEach(([method, result]) => {
      const resultDiv = document.createElement('div');
      resultDiv.className = `acl-result ${result.status}`;

      const nameDiv = document.createElement('div');
      nameDiv.className = 'acl-result-name';
      nameDiv.textContent = method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const statusDiv = document.createElement('div');
      statusDiv.className = `acl-result-status ${result.status}`;
      statusDiv.textContent = result.status.toUpperCase();

      const messageDiv = document.createElement('div');
      messageDiv.className = 'acl-result-message';
      messageDiv.textContent = result.message;

      const rightDiv = document.createElement('div');
      rightDiv.appendChild(statusDiv);
      rightDiv.appendChild(messageDiv);

      resultDiv.appendChild(nameDiv);
      resultDiv.appendChild(rightDiv);

      elements.aclResults.appendChild(resultDiv);
    });
  } catch (err) {
    console.error('Error testing ACLs:', err);
    elements.aclResults.innerHTML = '<div class="acl-result error">Error testing ACLs</div>';
  } finally {
    elements.testAclButton.disabled = false;
    elements.testAclButton.textContent = 'Test ACLs';
  }
};

/**
 * Clear logs
 */
const clearLogs = () => {
  elements.logsContainer.innerHTML = '';
};

/**
 * Fetch service status
 */
const fetchServiceStatus = async () => {
  try {
    const response = await fetch('/api/service-status');
    const status = await response.json();
    updateServiceStatusUI(status);
  } catch (err) {
    console.error('Error fetching service status:', err);
    updateServiceStatusUI({ installed: false, running: false });
  }
};

/**
 * Update service status UI
 */
const updateServiceStatusUI = (status) => {
  elements.serviceStatusIndicator.className = `status-indicator ${status.installed ? (status.running ? 'running' : 'stopped') : 'not-installed'}`;
  
  if (!status.installed) {
    elements.serviceStatusText.textContent = 'Not Installed';
    elements.serviceInstallBtn.disabled = false;
    elements.serviceUninstallBtn.disabled = true;
    elements.serviceRestartBtn.disabled = true;
  } else if (status.running) {
    elements.serviceStatusText.textContent = 'Running';
    elements.serviceInstallBtn.disabled = true;
    elements.serviceUninstallBtn.disabled = false;
    elements.serviceRestartBtn.disabled = false;
  } else {
    elements.serviceStatusText.textContent = 'Stopped';
    elements.serviceInstallBtn.disabled = false;
    elements.serviceUninstallBtn.disabled = false;
    elements.serviceRestartBtn.disabled = false;
  }
};

/**
 * Install service - show manual install modal
 */
const installService = () => {
  elements.installModal.style.display = 'flex';
};

/**
 * Close manual install modal
 */
const closeModal = () => {
  elements.installModal.style.display = 'none';
};

/**
 * Copy command to clipboard
 */
const copyCommandToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(elements.installCommand.textContent);
    const originalText = elements.copyCommandBtn.innerHTML;
    elements.copyCommandBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    elements.copyCommandBtn.classList.add('copied');
    setTimeout(() => {
      elements.copyCommandBtn.innerHTML = originalText;
      elements.copyCommandBtn.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    alert('Failed to copy to clipboard. Please select and copy the command manually.');
  }
};

/**
 * Uninstall service
 */
const uninstallService = async () => {
  if (!confirm('Are you sure you want to uninstall the service? This will stop it and disable auto-start.')) {
    return;
  }
  
  elements.serviceUninstallBtn.disabled = true;
  elements.serviceUninstallBtn.textContent = 'Uninstalling...';
  
  try {
    const response = await fetch('/api/service-uninstall', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      alert('Service uninstalled successfully!');
      fetchServiceStatus();
    } else {
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    alert(`Error uninstalling service: ${err.message}`);
  }
  
  elements.serviceUninstallBtn.disabled = false;
  elements.serviceUninstallBtn.textContent = 'Uninstall Service';
};

/**
 * Restart service
 */
const restartService = async () => {
  elements.restartWarning.style.display = 'block';
  let countdown = 21;
  
  const countdownInterval = setInterval(() => {
    countdown--;
    elements.restartCountdown.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
  
  try {
    const response = await fetch('/api/service-restart', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      setTimeout(() => {
        location.reload();
      }, 21000);
    } else {
      alert(`Error: ${result.error}`);
      elements.restartWarning.style.display = 'none';
      clearInterval(countdownInterval);
    }
  } catch (err) {
    alert(`Error restarting service: ${err.message}`);
    elements.restartWarning.style.display = 'none';
    clearInterval(countdownInterval);
  }
};

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/**
 * Fetch transactions from API
 */
const fetchTransactions = async () => {
  if (!transactionHistoryEnabled) {
    return;
  }

  try {
    const response = await fetch('/api/transactions');
    allTransactions = await response.json();
    renderTransactions();
  } catch (err) {
    console.error('Error fetching transactions:', err);
    if (elements.transactionsContainer) {
      elements.transactionsContainer.innerHTML = '<p class="error">Error loading transactions</p>';
    }
  }
};

/**
 * Render transactions to DOM
 */
const renderTransactions = () => {
  const filtered = currentFilter === 'all'
    ? allTransactions
    : allTransactions.filter(t => t.type === currentFilter);

  if (filtered.length === 0) {
    elements.transactionsContainer.innerHTML = '<p class="empty-state">No transactions found</p>';
    return;
  }

  elements.transactionsContainer.innerHTML = filtered.map(tx => {
    const isIncoming = tx.type === 'incoming';
    const icon = isIncoming
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M19 12l-7-7-7 7"/></svg>';

    return `
      <div class="transaction-item">
        <div class="transaction-info">
          <div class="transaction-icon ${isIncoming ? 'incoming' : 'outgoing'}">
            ${icon}
          </div>
          <div class="transaction-details">
            <div class="transaction-description">${escapeHtml(tx.description || (isIncoming ? 'Incoming' : 'Outgoing'))}</div>
            <div class="transaction-time">${formatTimestamp(new Date(tx.timestamp * 1000).toISOString())}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center;">
          <div class="transaction-amount ${isIncoming ? 'incoming' : 'outgoing'}">
            ${isIncoming ? '+' : '-'}${tx.amount.toLocaleString()} sats
          </div>
          ${tx.state ? `<span class="transaction-status ${tx.state.toLowerCase()}">${tx.state}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
};

/**
 * Initialize app
 */
const init = async () => {
  console.log('Initializing web panel...');

  // Fetch initial data
  console.log('Fetching initial data...');
  fetchStatus();
  await fetchConfig();
  fetchServiceStatus();
  if (transactionHistoryEnabled) {
    fetchTransactions();
  }
  if (balanceEnabled) {
    fetchBalance();
  }

  // Set up status update interval
  statusUpdateInterval = setInterval(fetchStatus, 5000);

  // Set up transaction update interval (every 30 seconds)
  if (transactionHistoryEnabled) {
    transactionUpdateInterval = setInterval(fetchTransactions, 30000);
  }

  // Connect to WebSocket for logs
  connectWebSocket();

  // Event listeners
  elements.testAclButton.addEventListener('click', testACLs);
  elements.clearLogsButton.addEventListener('click', clearLogs);
  elements.serviceInstallBtn.addEventListener('click', installService);
  elements.serviceUninstallBtn.addEventListener('click', uninstallService);
  elements.serviceRestartBtn.addEventListener('click', restartService);
  elements.closeModal.addEventListener('click', closeModal);
  elements.copyCommandBtn.addEventListener('click', copyCommandToClipboard);

  // Close modal when clicking outside
  elements.installModal.addEventListener('click', (e) => {
    if (e.target === elements.installModal) {
      closeModal();
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.installModal.style.display === 'flex') {
      closeModal();
    }
  });

  // Balance display toggle listeners
  elements.balanceDisplayToggles.forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        balanceDisplayUnit = e.target.value;
        // Re-render balance with new unit
        fetchBalance();
      }
    });
  });

  // Filter buttons for transactions
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderTransactions();
    });
  });

  console.log('Web panel initialized');
};

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (ws) {
    ws.close();
  }
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
  }
  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval);
  }
  if (transactionUpdateInterval) {
    clearInterval(transactionUpdateInterval);
  }
});
