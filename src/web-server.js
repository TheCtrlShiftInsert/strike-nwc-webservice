const polka = require('polka');
const sirv = require('sirv');
const { WebSocketServer } = require('ws');
const path = require('path');
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
let processStartTime = Date.now();
let getLogBufferFn = null;

/**
 * Set shared state references
 */
const setSharedState = ({ getRelay, getTotalAmountSent, getCachedInvoiceResults, getPaymentHistory, getLogBuffer }) => {
  getRelayFn = getRelay;
  getTotalAmountSentFn = getTotalAmountSent;
  getCachedInvoiceResultsFn = getCachedInvoiceResults;
  getPaymentHistoryFn = getPaymentHistory;
  getLogBufferFn = getLogBuffer;
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
const startWebServer = ({ getRelay, getTotalAmountSent, getCachedInvoiceResults, getPaymentHistory, getLogBuffer }) => {
  setSharedState({ getRelay, getTotalAmountSent, getCachedInvoiceResults, getPaymentHistory, getLogBuffer });

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

    // API: Get transaction history
    app.get('/api/transactions', (req, res) => {
      const cachedResults = getCachedInvoiceResultsFn ? getCachedInvoiceResultsFn() : {};
      const outgoingPayments = getPaymentHistoryFn ? getPaymentHistoryFn() : [];

      // Convert cached invoices to array
      const incomingInvoices = Object.values(cachedResults).map(inv => ({
        type: 'incoming',
        invoice: inv.invoice,
        description: inv.description,
        amount: inv.amount,
        timestamp: inv.created_at,
        state: inv.metadata?.state || 'unknown'
      }));

      // Combine and sort by timestamp (newest first)
      const allTransactions = [...incomingInvoices, ...outgoingPayments]
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
