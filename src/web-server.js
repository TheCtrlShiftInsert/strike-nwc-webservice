const polka = require('polka');
const sirv = require('sirv');
const { WebSocketServer } = require('ws');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const { testAllACLs } = require('./acl-tester');
const {
  RELAY_URI,
  NWC_CONNECTION_PUBKEY,
  NWC_SERVICE_PUBKEY,
  AUTHORIZED_PUBKEY,
  TOTAL_MAX_SEND_AMOUNT_IN_SATS,
  WALLET_BALANCE_ENABLED,
  TRANSACTION_HISTORY_ENABLED,
  WEB_PANEL_PORT,
  WEB_PANEL_HOST
} = require('./constants');

// Store references to shared state
let getRelayFn = null;
let getTotalAmountSentFn = null;
let getCachedInvoiceResultsFn = null;
let getPaymentHistoryFn = null;
let getCachedTransactionsFn = null;
let processStartTime = Date.now();
let getLogBufferFn = null;
let getCachedBalanceDataFn = null;

/**
 * Set shared state references
 */
const setSharedState = ({ getRelay, getTotalAmountSent, getCachedInvoiceResults, getPaymentHistory, getCachedTransactions, getLogBuffer, getCachedBalanceData }) => {
  getRelayFn = getRelay;
  getTotalAmountSentFn = getTotalAmountSent;
  getCachedInvoiceResultsFn = getCachedInvoiceResults;
  getPaymentHistoryFn = getPaymentHistory;
  getCachedTransactionsFn = getCachedTransactions;
  getLogBufferFn = getLogBuffer;
  getCachedBalanceDataFn = getCachedBalanceData;
};

/**
 * Calculate uptime in milliseconds
 */
const getUptime = () => Date.now() - processStartTime;

/**
 * Get relay status
 */
const getRelayStatus = () => {
  if (!getRelayFn) {
    return {
      connected: false,
      uri: RELAY_URI,
      lastConnected: null
    };
  }

  const relay = getRelayFn();

  if (!relay) {
    return {
      connected: false,
      uri: RELAY_URI,
      lastConnected: null
    };
  }

  return {
    connected: relay.connected || false,
    uri: RELAY_URI,
    lastConnected: relay.connected ? new Date().toISOString() : null
  };
};

/**
 * Start the web server
 */
const startWebServer = ({ getRelay, getTotalAmountSent, getCachedInvoiceResults, getPaymentHistory, getCachedTransactions, getLogBuffer, getCachedBalanceData }) => {
  setSharedState({ getRelay, getTotalAmountSent, getCachedInvoiceResults, getPaymentHistory, getCachedTransactions, getLogBuffer, getCachedBalanceData });

  const hosts = WEB_PANEL_HOST.split(',').map(h => h.trim());
  const servers = [];

  // Create a server for each host
  hosts.forEach(host => {
    const app = polka();

    // Serve static files from public directory
    app.use(sirv(path.join(__dirname, '..', 'public'), {
      dev: false
    }));

    // API: Get current status
    app.get('/api/status', (req, res) => {
      const relayStatus = getRelayStatus();
      const uptime = getUptime();
      const totalSent = getTotalAmountSentFn ? getTotalAmountSentFn() : 0;
      const cachedResults = getCachedInvoiceResultsFn ? getCachedInvoiceResultsFn() : {};

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        relay: relayStatus,
        payments: {
          totalSent,
          quotaMax: TOTAL_MAX_SEND_AMOUNT_IN_SATS,
          quotaUsed: totalSent
        },
        features: {
          balanceEnabled: WALLET_BALANCE_ENABLED,
          transactionHistoryEnabled: TRANSACTION_HISTORY_ENABLED
        },
        uptime,
        connectionCount: Object.keys(cachedResults).length
      }));
    });

    // API: Get service status
    app.get('/api/service-status', (req, res) => {
      try {
        const servicePath = path.join(process.env.HOME, '.config', 'systemd', 'user', 'strike-connect.service');
        const serviceExists = fs.existsSync(servicePath);
        
        if (!serviceExists) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ installed: false, running: false }));
          return;
        }
        
        try {
          const status = execSync('systemctl --user is-active strike-connect', { encoding: 'utf-8' });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ installed: true, running: status.trim() === 'active' }));
        } catch (err) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ installed: true, running: false }));
        }
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    // API: Install service
    app.post('/api/service-install', (req, res) => {
      try {
        const projectDir = process.cwd();
        const serviceSourcePath = path.join(projectDir, 'service', 'strike-connect.service');
        const userServiceDir = path.join(process.env.HOME, '.config', 'systemd', 'user');
        const serviceDestPath = path.join(userServiceDir, 'strike-connect.service');
        
        if (!fs.existsSync(userServiceDir)) {
          fs.mkdirSync(userServiceDir, { recursive: true });
        }
        
        fs.copyFileSync(serviceSourcePath, serviceDestPath);
        
        execSync('systemctl --user daemon-reload');
        
        execSync('systemctl --user enable strike-connect');
        
        execSync('systemctl --user start strike-connect');
        
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: 'Service installed and started' }));
      } catch (err) {
        console.error('Service install error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    // API: Uninstall service
    app.post('/api/service-uninstall', (req, res) => {
      try {
        try {
          execSync('systemctl --user stop strike-connect');
        } catch (err) {}
        
        try {
          execSync('systemctl --user disable strike-connect');
        } catch (err) {}
        
        const servicePath = path.join(process.env.HOME, '.config', 'systemd', 'user', 'strike-connect.service');
        if (fs.existsSync(servicePath)) {
          fs.unlinkSync(servicePath);
        }
        
        execSync('systemctl --user daemon-reload');
        
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: 'Service uninstalled' }));
      } catch (err) {
        console.error('Service uninstall error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    // API: Restart service
    app.post('/api/service-restart', (req, res) => {
      try {
        execSync('systemctl --user restart strike-connect');
        
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: 'Service restarted' }));
      } catch (err) {
        console.error('Service restart error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    // API: Get config (non-sensitive)
    app.get('/api/config', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        features: {
          balanceEnabled: WALLET_BALANCE_ENABLED,
          transactionHistoryEnabled: TRANSACTION_HISTORY_ENABLED
        }
      }));
    });

    // API: Get balance data
    app.get('/api/balance', (req, res) => {
      if (!WALLET_BALANCE_ENABLED) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Wallet balance feature is disabled' }));
        return;
      }

      const balanceData = getCachedBalanceDataFn ? getCachedBalanceDataFn() : {
        totalBalance: 0,
        incoming24h: 0,
        outgoing24h: 0,
        lastUpdated: null
      };
      const totalSent = getTotalAmountSentFn ? getTotalAmountSentFn() : 0;

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ...balanceData,
        quotaUsed: totalSent,
        quotaMax: TOTAL_MAX_SEND_AMOUNT_IN_SATS
      }));
    });

    // API: Get transaction history
    app.get('/api/transactions', (req, res) => {
      if (!TRANSACTION_HISTORY_ENABLED) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Transaction history feature is disabled' }));
        return;
      }

      const cachedTransactions = getCachedTransactionsFn ? getCachedTransactionsFn() : [];
      const outgoingPayments = getPaymentHistoryFn ? getPaymentHistoryFn() : [];

      // Combine and sort by timestamp (newest first)
      const allTransactions = [...cachedTransactions, ...outgoingPayments]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100); // Limit to 100 most recent

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(allTransactions));
    });

    // API: Test ACLs
    app.post('/api/test-acl', async (req, res) => {
      try {
        const results = await testAllACLs();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(results));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.end('OK');
    });

    // Start the server
    app.listen(WEB_PANEL_PORT, host, () => {
      const { addLogClient } = require('./logger');
      console.log(`Web panel listening on http://${host}:${WEB_PANEL_PORT}`);

      // Set up WebSocket server for log streaming
      const wss = new WebSocketServer({ server: app.server });

      wss.on('connection', (ws, req) => {
        addLogClient(ws);
        console.log('New log client connected');
      });
    });

    servers.push(app);
  });

  return servers;
};

module.exports = {
  startWebServer
};
