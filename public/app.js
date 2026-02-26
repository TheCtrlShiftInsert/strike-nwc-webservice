// WebSocket connection for real-time updates
let ws = null;
let reconnectInterval = null;
let statusUpdateInterval = null;
let transactionUpdateInterval = null;
let currentFilter = 'all';
let allTransactions = [];

// DOM elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  relayStatus: document.getElementById('relayStatus'),
  uptime: document.getElementById('uptime'),
  totalSent: document.getElementById('totalSent'),
  quotaUsed: document.getElementById('quotaUsed'),
  invoiceCount: document.getElementById('invoiceCount'),
  balanceFeature: document.getElementById('balanceFeature'),
  txHistoryFeature: document.getElementById('txHistoryFeature'),
  testAclButton: document.getElementById('testAclButton'),
  aclResults: document.getElementById('aclResults'),
  logsContainer: document.getElementById('logsContainer'),
  clearLogsButton: document.getElementById('clearLogsButton'),
  autoScroll: document.getElementById('autoScroll'),
  transactionsContainer: document.getElementById('transactionsContainer')
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
    elements.relayStatus.textContent = status.relay.connected ? 'Connected' : 'Disconnected';
    elements.relayStatus.style.color = status.relay.connected ? 'var(--success)' : 'var(--error)';

    // Update uptime
    elements.uptime.textContent = formatUptime(status.uptime);

    // Update payment stats
    elements.totalSent.textContent = `${status.payments.totalSent.toLocaleString()} sats`;
    elements.quotaUsed.textContent = `${status.payments.quotaUsed.toLocaleString()} / ${status.payments.quotaMax.toLocaleString()} sats`;

    // Update invoice count
    elements.invoiceCount.textContent = status.connectionCount;
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

    // Update features status
    const balanceStatus = elements.balanceFeature.querySelector('.feature-status');
    balanceStatus.textContent = config.features.balanceEnabled ? 'Enabled' : 'Disabled';
    balanceStatus.className = `feature-status ${config.features.balanceEnabled ? 'enabled' : 'disabled'}`;

    const txHistoryStatus = elements.txHistoryFeature.querySelector('.feature-status');
    txHistoryStatus.textContent = config.features.transactionHistoryEnabled ? 'Enabled' : 'Disabled';
    txHistoryStatus.className = `feature-status ${config.features.transactionHistoryEnabled ? 'enabled' : 'disabled'}`;
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
  try {
    const response = await fetch('/api/transactions');
    allTransactions = await response.json();
    renderTransactions();
  } catch (err) {
    console.error('Error fetching transactions:', err);
    elements.transactionsContainer.innerHTML = '<p class="error">Error loading transactions</p>';
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
 * Initialize the app
 */
const init = () => {
  console.log('Initializing web panel...');

  // Fetch initial data
  console.log('Fetching initial data...');
  fetchStatus();
  fetchConfig();
  fetchTransactions();

  // Set up status update interval
  statusUpdateInterval = setInterval(fetchStatus, 5000);

  // Set up transaction update interval (every 30 seconds)
  transactionUpdateInterval = setInterval(fetchTransactions, 30000);

  // Connect to WebSocket for logs
  connectWebSocket();

  // Event listeners
  elements.testAclButton.addEventListener('click', testACLs);
  elements.clearLogsButton.addEventListener('click', clearLogs);

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
