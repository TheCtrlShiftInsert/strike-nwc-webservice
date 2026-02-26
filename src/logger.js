const { Writable } = require('stream');

// In-memory buffer for log lines (last 1000 lines)
const logBuffer = [];
const MAX_BUFFER_SIZE = 1000;

// WebSocket clients for real-time log streaming
let wsClients = [];

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

/**
 * Format log entry with timestamp and level
 */
const formatLogEntry = (level, args) => {
  const timestamp = new Date().toISOString();
  const message = args
    .map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  return {
    timestamp,
    level,
    message,
    raw: message
  };
};

/**
 * Add log entry to buffer and broadcast to WebSocket clients
 */
const processLog = (level, args) => {
  const entry = formatLogEntry(level, args);

  // Add to buffer
  logBuffer.push(entry);

  // Trim buffer if it exceeds max size
  while (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Broadcast to WebSocket clients
  broadcastLog(entry);

  // Call original console method
  originalConsole[level](...args);
};

/**
 * Broadcast log entry to all connected WebSocket clients
 */
const broadcastLog = (entry) => {
  const deadClients = [];

  wsClients.forEach((ws) => {
    if (ws.readyState === 1) { // OPEN
      try {
        ws.send(JSON.stringify(entry));
      } catch (err) {
        deadClients.push(ws);
      }
    } else {
      deadClients.push(ws);
    }
  });

  // Remove dead clients
  wsClients = wsClients.filter(ws => !deadClients.includes(ws));
};

/**
 * Add a WebSocket client to receive logs
 */
const addLogClient = (ws) => {
  wsClients.push(ws);

  // Send buffered logs to new client
  logBuffer.forEach(entry => {
    try {
      ws.send(JSON.stringify(entry));
    } catch (err) {
      // Client disconnected, will be cleaned up on next broadcast
    }
  });

  // Remove client on close
  ws.on('close', () => {
    wsClients = wsClients.filter(client => client !== ws);
  });
};

/**
 * Get current log buffer
 */
const getLogBuffer = () => [...logBuffer];

/**
 * Initialize logger - intercept console methods
 */
const initializeLogger = () => {
  console.log = (...args) => processLog('log', args);
  console.error = (...args) => processLog('error', args);
  console.warn = (...args) => processLog('warn', args);
  console.info = (...args) => processLog('info', args);
  console.debug = (...args) => processLog('debug', args);
};

/**
 * Restore original console methods
 */
const restoreConsole = () => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
};

module.exports = {
  initializeLogger,
  restoreConsole,
  addLogClient,
  getLogBuffer
};
