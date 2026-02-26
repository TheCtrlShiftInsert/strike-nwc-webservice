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
} = require("./constants");
const {
  payInvoice,
  makeInvoice,
  lookupInvoice,
  getBalance,
  listInvoices,
} = require("./strike");
const { initializeLogger, getLogBuffer } = require("./logger");
const { startWebServer } = require("./web-server");

useWebSocketImplementation(require("ws"));

let totalAmountSentInSats = 0;
const cachedInvoiceResults = {};
const paymentHistory = [];
let relay = null;
let webServerStarted = false;

// Export getters for web panel
const getTotalAmountSent = () => totalAmountSentInSats;
const getCachedInvoiceResults = () => cachedInvoiceResults;
const getPaymentHistory = () => paymentHistory;
const getRelay = () => relay;

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
        getLogBuffer
      });
      webServerStarted = true;
    }

    relay.onclose = () => {
      console.log("Relay connection closed. Reconnecting in 5 seconds...");
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
  } catch (err) {
    console.error(`Failed to connect to relay: ${err}. Retrying in 5 seconds...`);
    setTimeout(connectRelay, 5000);
  }
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
