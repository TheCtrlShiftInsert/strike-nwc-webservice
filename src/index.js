const lightBolt11Decoder = require("light-bolt11-decoder");
const { finalizeEvent } = require("nostr-tools/pure");
const { useWebSocketImplementation, Relay } = require("nostr-tools/relay");
const { NWCWalletRequest, NWCWalletResponse } = require("nostr-tools/kinds");
const { encrypt, decrypt } = require("nostr-tools/nip04");
const {
  RELAY_URI,
  TOTAL_MAX_SEND_AMOUNT_IN_SATS,
  NWC_CONNECTION_PUBKEY,
  NWC_CONNECTION_SECRET,
  NWC_SERVICE_PUBKEY,
  AUTHORIZED_PUBKEY,
  WALLET_BALANCE_ENABLED,
  TRANSACTION_HISTORY_ENABLED,
  WEB_PANEL_ENABLED,
  BALANCE_POLLING_INTERVAL,
  parseInterval,
} = require("./constants");
const {
  payInvoice,
  makeInvoice,
  lookupInvoice,
  getBalance,
  listInvoices,
  listPaidInvoicesLast24Hours,
} = require("./strike");
const { initializeLogger, getLogBuffer } = require("./logger");
const { startWebServer } = require("./web-server");

useWebSocketImplementation(require("ws"));

let totalAmountSentInSats = 0;
const cachedInvoiceResults = {};
const paymentHistory = [];
const cachedTransactions = [];
let relay = null;
let webServerStarted = false;
let balancePollingInterval = null;
const cachedBalanceData = {
  totalBalance: 0,
  incoming24h: 0,
  outgoing24h: 0,
  lastUpdated: null
};

// Export getters for web panel
const getTotalAmountSent = () => totalAmountSentInSats;
const getCachedInvoiceResults = () => cachedInvoiceResults;
const getPaymentHistory = () => paymentHistory;
const getCachedTransactions = () => cachedTransactions;
const getRelay = () => relay;
const getCachedBalanceData = () => cachedBalanceData;

const UNAUTHORIZED = "UNAUTHORIZED";
const NOT_IMPLEMENTED = "NOT_IMPLEMENTED";
const QUOTA_EXCEEDED = "QUOTA_EXCEEDED";
const PAYMENT_FAILED = "PAYMENT_FAILED";
const INTERNAL = "INTERNAL";
const NOT_FOUND = "NOT_FOUND";

const connectRelay = async () => {
  try {
    relay = await Relay.connect(RELAY_URI);
    console.log(`connected to ${RELAY_URI}`);

    // Start web server if enabled (only once)
    if (WEB_PANEL_ENABLED && !webServerStarted) {
      startWebServer({
        getRelay,
        getTotalAmountSent,
        getCachedInvoiceResults,
        getPaymentHistory,
        getCachedTransactions,
        getLogBuffer,
        getCachedBalanceData
      });
      webServerStarted = true;
    }

    relay.onclose = () => {
      console.log("Relay connection closed. Reconnecting in 5 seconds...");
      if (balancePollingInterval) {
        clearInterval(balancePollingInterval);
        balancePollingInterval = null;
      }
      setTimeout(connectRelay, 5000);
    };

    relay.subscribe(
      [
        {
          authors: [NWC_CONNECTION_PUBKEY],
          kinds: [NWCWalletRequest],
        },
      ],
      {
        onevent(event) {
          console.log("NWC request:", event);
          handleNwcRequest(relay, event);
        },
      },
      {
        onclose(reason) {
          console.log("Relay subscription closed: ", reason);
        },
      },
    );

    // Start balance polling after relay connects
    startBalancePolling();
  } catch (err) {
    console.error(`Failed to connect to relay: ${err}. Retrying in 5 seconds...`);
    setTimeout(connectRelay, 5000);
  }
};

const updateBalanceData = async () => {
  try {
    if (!WALLET_BALANCE_ENABLED && !TRANSACTION_HISTORY_ENABLED) {
      console.log("Skipping update: both balance and transactions are disabled");
      return;
    }

    console.log("Updating balance data...");

    let balanceInMillisats = 0;
    let incoming24h = 0;
    let outgoing24h = 0;

    if (WALLET_BALANCE_ENABLED) {
      // Fetch current balance
      const balances = await getBalance();
      const btcBalance = balances.find((b) => b.currency === "BTC");
      balanceInMillisats = btcBalance
        ? Math.floor(parseFloat(btcBalance.total) * 100_000_000 * 1000)
        : 0;

      // Fetch incoming invoices from last 24h
      const paidInvoices = await listPaidInvoicesLast24Hours();
      if (paidInvoices.items && Array.isArray(paidInvoices.items)) {
        paidInvoices.items.forEach((invoice) => {
          const invoiceAmount = Math.floor(
            parseFloat(invoice.amount?.amount || 0) * 100_000_000 * 1000,
          );
          incoming24h += invoiceAmount;
        });
      }

      // Calculate outgoing from local payment history (last 24h)
      const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
      paymentHistory.forEach((payment) => {
        if (payment.timestamp >= twentyFourHoursAgo && payment.type === 'outgoing') {
          outgoing24h += payment.amount;
        }
      });
    }

    if (TRANSACTION_HISTORY_ENABLED) {
      // Fetch and cache all transactions from Strike API
      const { items } = await listInvoices({ limit: 100 });
      const transactions = items.map((invoice) => ({
        type: "incoming",
        invoice: invoice.invoiceId,
        description: invoice.description || "",
        amount: Math.floor(
          parseFloat(invoice.amount?.amount || 0) * 100_000_000 * 1000,
        ),
        timestamp: Math.floor(new Date(invoice.created).getTime() / 1000),
        state: invoice.state,
        currency: invoice.amount?.currency
      }));
      cachedTransactions.length = 0;
      cachedTransactions.push(...transactions);
    }

    // Update cached data
    if (WALLET_BALANCE_ENABLED) {
      cachedBalanceData.totalBalance = balanceInMillisats;
      cachedBalanceData.incoming24h = incoming24h;
      cachedBalanceData.outgoing24h = outgoing24h;
    }
    cachedBalanceData.lastUpdated = new Date().toISOString();

    // Log appropriate message based on what was updated
    if (WALLET_BALANCE_ENABLED && TRANSACTION_HISTORY_ENABLED) {
      console.log(`Balance updated: ${balanceInMillisats} sats, in24h: ${incoming24h}, out24h: ${outgoing24h}, txs: ${cachedTransactions.length}`);
    } else if (WALLET_BALANCE_ENABLED) {
      console.log(`Balance updated: ${balanceInMillisats} sats, in24h: ${incoming24h}, out24h: ${outgoing24h} (transactions disabled)`);
    } else {
      console.log(`Transactions updated: ${cachedTransactions.length} txs (balance disabled)`);
    }
  } catch (err) {
    console.error(`Error updating balance data: ${err}`);
  }
};

const startBalancePolling = () => {
  if (balancePollingInterval) {
    clearInterval(balancePollingInterval);
  }

  // Initial update
  updateBalanceData();

  // Set up polling interval
  const intervalMs = parseInterval(BALANCE_POLLING_INTERVAL);
  console.log(`Starting balance polling every ${BALANCE_POLLING_INTERVAL} (${intervalMs}ms)`);

  balancePollingInterval = setInterval(updateBalanceData, intervalMs);
};

const start = async () => {
  initializeLogger();
  await connectRelay();
};

const decryptNwcRequestContent = async (eventContent) => {
  try {
    return JSON.parse(
      await decrypt(NWC_CONNECTION_SECRET, NWC_SERVICE_PUBKEY, eventContent),
    );
  } catch (err) {
    console.error(`error decrypting NWC request: ${err}`);
    throw new Error(UNAUTHORIZED);
  }
};

const getErrorMessage = ({ requestMethod, errorCode }) => {
  switch (errorCode) {
    case UNAUTHORIZED:
      return "Unable to decrypt NWC request content.";
    case NOT_IMPLEMENTED:
      return `${requestMethod} not currently supported.`;
    case QUOTA_EXCEEDED:
      return `Payment would exceed max quota of ${TOTAL_MAX_SEND_AMOUNT_IN_SATS}.`;
    case PAYMENT_FAILED:
      return "Unable to complete payment.";
    case NOT_FOUND:
      return "Unable to find invoice.";
    default:
      return "Something unexpected happened.";
  }
};

const makeNwcResponseEvent = async ({
  eventId,
  requestMethod,
  result,
  errorCode,
}) => {
  const content = { result_type: requestMethod };

  if (errorCode) {
    content.error = {
      code: errorCode,
      message: getErrorMessage({ requestMethod, errorCode }),
    };
  } else {
    content.result = result;
  }
  const encryptedContent = await encrypt(
    NWC_CONNECTION_SECRET,
    NWC_SERVICE_PUBKEY,
    JSON.stringify(content),
  );
  const eventTemplate = {
    kind: NWCWalletResponse,
    created_at: Math.round(Date.now() / 1000),
    content: encryptedContent,
    tags: [
      ["p", AUTHORIZED_PUBKEY],
      ["e", eventId],
    ],
  };

  console.log(content);

  return finalizeEvent(eventTemplate, NWC_CONNECTION_SECRET);
};

const extractAmountInSats = (invoice) => {
  return (
    lightBolt11Decoder
      .decode(invoice)
      .sections.find(({ name }) => name === "amount").value / 1000
  );
};

const handlePayInvoiceRequest = async (nwcRequestContent) => {
  const invoice = nwcRequestContent.params?.invoice;
  const amountInSats = invoice ? extractAmountInSats(invoice) : 0;

  if (totalAmountSentInSats + amountInSats > TOTAL_MAX_SEND_AMOUNT_IN_SATS) {
    throw new Error("QUOTA_EXCEEDED");
  }

  try {
    const paymentResult = await payInvoice(invoice);
    totalAmountSentInSats = totalAmountSentInSats + amountInSats;
    console.log(`successfully paid ${amountInSats} sats`);
    console.log(
      `total amount of sats sent since this wallet service has been running: ${totalAmountSentInSats}\n\n`,
    );

    // Store payment details for history
    paymentHistory.push({
      type: 'outgoing',
      invoice: invoice,
      amount: amountInSats,
      timestamp: Math.floor(Date.now() / 1000),
      description: nwcRequestContent.params?.comment || 'Zap',
      status: 'sent',
      paymentId: paymentResult.paymentId || null
    });

    return { preimage: "gfy" };
  } catch (err) {
    console.error(`error making payment: ${err}`);
    throw new Error(PAYMENT_FAILED);
  }
};

const handleMakeInvoiceRequest = async (nwcRequestContent) => {
  const { amount, description } = nwcRequestContent.params;

  try {
    const { invoiceId, invoice, state, createdAt, expiresAt } =
      await makeInvoice({
        amountInMillisats: amount,
        description,
      });
    const result = {
      type: "incoming",
      invoice,
      description,
      amount,
      created_at: createdAt,
      expires_at: expiresAt,
      metadata: { state, invoice_id: invoiceId },
    };

    // cache result for lookup_invoice requests
    cachedInvoiceResults[invoice] = result;

    return result;
  } catch (err) {
    console.error(`error making invoice: ${err}`);
    throw new Error(INTERNAL);
  }
};

const handleLookupInvoiceRequest = async (nwcRequestContent) => {
  const { invoice } = nwcRequestContent.params;
  const cachedInvoiceResult = cachedInvoiceResults[invoice];

  if (!cachedInvoiceResult) {
    throw new Error(NOT_FOUND);
  }

  try {
    const invoiceId = cachedInvoiceResult.metadata.invoice_id;

    cachedInvoiceResult.metadata.state = await lookupInvoice(invoiceId);

    return cachedInvoiceResult;
  } catch (err) {
    console.error(`error looking up invoice: ${err}`);
    throw new Error(INTERNAL);
  }
};

const handleGetBalanceRequest = async () => {
  try {
    const balances = await getBalance();
    const btcBalance = balances.find((b) => b.currency === "BTC");
    const balanceInMillisats = btcBalance
      ? Math.floor(parseFloat(btcBalance.total) * 100_000_000 * 1000)
      : 0;

    return { balance: balanceInMillisats };
  } catch (err) {
    console.error(`error getting balance: ${err}`);
    throw new Error(INTERNAL);
  }
};

const handleListTransactionsRequest = async (nwcRequestContent) => {
  const { limit } = nwcRequestContent.params || {};

  try {
    const { items } = await listInvoices({ limit: limit || 50 });

    const transactions = items.map((invoice) => ({
      type: "incoming",
      invoice: invoice.invoiceId,
      description: invoice.description || "",
      amount: Math.floor(
        parseFloat(invoice.amount?.amount || 0) * 100_000_000 * 1000,
      ),
      created_at: Math.floor(new Date(invoice.created).getTime() / 1000),
      expires_at: null,
      metadata: {
        state: invoice.state,
        currency: invoice.amount?.currency,
      },
    }));

    return { transactions };
  } catch (err) {
    console.error(`error listing transactions: ${err}`);
    throw new Error(INTERNAL);
  }
};

const handleNwcRequest = async (relay, event) => {
  let errorCode = null;
  let result = null;
  let nwcRequestContent = null;

  try {
    nwcRequestContent = await decryptNwcRequestContent(event.content);
    console.log(nwcRequestContent);

    if (nwcRequestContent.method === "pay_invoice") {
      result = await handlePayInvoiceRequest(nwcRequestContent);
    } else if (nwcRequestContent.method === "make_invoice") {
      result = await handleMakeInvoiceRequest(nwcRequestContent);
    } else if (nwcRequestContent.method === "lookup_invoice") {
      result = await handleLookupInvoiceRequest(nwcRequestContent);
    } else if (nwcRequestContent.method === "get_balance") {
      if (!WALLET_BALANCE_ENABLED) {
        throw new Error(NOT_IMPLEMENTED);
      }
      result = await handleGetBalanceRequest();
    } else if (nwcRequestContent.method === "list_transactions") {
      if (!TRANSACTION_HISTORY_ENABLED) {
        throw new Error(NOT_IMPLEMENTED);
      }
      result = await handleListTransactionsRequest(nwcRequestContent);
    } else {
      errorCode = NOT_IMPLEMENTED;
    }
  } catch (err) {
    errorCode = err.message;
  }

  try {
    const nwcResponse = await makeNwcResponseEvent({
      eventId: event.id,
      requestMethod: nwcRequestContent?.method ?? "unknown",
      result,
      errorCode,
    });
    console.log("NWC response:", nwcResponse);

    if (relay && relay.connected) {
      relay.publish(nwcResponse);
    } else {
      console.error("Relay not connected, unable to publish response");
    }
  } catch (err) {
    console.error("failed to publish NWC response", err);
  }
};

start();
