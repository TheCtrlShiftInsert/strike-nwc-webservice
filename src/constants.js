const { getPublicKey } = require("nostr-tools/pure");

require("dotenv").config();

const STRIKE_API_KEY = process.env.STRIKE_API_KEY;
const STRIKE_SOURCE_CURRENCY = process.env.STRIKE_SOURCE_CURRENCY;
const NWC_SERVICE_PRIVKEY = process.env.NWC_SERVICE_PRIVKEY;
const RELAY_URI = process.env.RELAY_URI;
const AUTHORIZED_PUBKEY = process.env.AUTHORIZED_PUBKEY;
const NWC_CONNECTION_SECRET = process.env.NWC_CONNECTION_SECRET;
const TOTAL_MAX_SEND_AMOUNT_IN_SATS = process.env.TOTAL_MAX_SEND_AMOUNT_IN_SATS
  ? Number(process.env.TOTAL_MAX_SEND_AMOUNT_IN_SATS)
  : 10000;
const WALLET_BALANCE_ENABLED = process.env.WALLET_BALANCE === "ENABLED";
const TRANSACTION_HISTORY_ENABLED =
  process.env.TRANSACTION_HISTORY === "ENABLED";
const WEB_PANEL_ENABLED = process.env.WEB_PANEL === "ENABLED";
const WEB_PANEL_PORT = process.env.WEB_PANEL_PORT || 2021;
const WEB_PANEL_HOST = process.env.WEB_PANEL_HOST || "127.0.0.1";
const BALANCE_POLLING_INTERVAL = process.env.BALANCE_POLLING_INTERVAL || "4h";
const BALANCE_DISPLAY_DEFAULT = process.env.BALANCE_DISPLAY_DEFAULT || "sats";

if (!STRIKE_API_KEY) {
  console.log("Missing STRIKE_API_KEY in .env file.");
  process.exit(1);
}

if (!STRIKE_SOURCE_CURRENCY) {
  console.log("Missing STRIKE_SOURCE_CURRENCY in .env file.");
  process.exit(1);
}

if (!NWC_SERVICE_PRIVKEY) {
  console.log("Missing NWC_SERVICE_PRIVKEY in .env file.");
  console.log(
    "You can run `npm run generate-secret` to create a new private key.",
  );
  process.exit(1);
}

if (!RELAY_URI) {
  console.log("Missing RELAY_URI in .env file");
  process.exit(1);
}

if (!AUTHORIZED_PUBKEY) {
  console.log("Missing AUTHORIZED_PUBKEY in .env file");
  process.exit(1);
}

if (!NWC_CONNECTION_SECRET) {
  console.log("Missing NWC_CONNECTION_SECRET in .env file");
  console.log(
    "You can run `npm run generate-secret` to create a new connection secret.",
  );
  process.exit(1);
}

const parseInterval = (interval) => {
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}. Use format like '30s', '5m', '2h', '1d'`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
};

module.exports = {
  STRIKE_API_KEY,
  STRIKE_SOURCE_CURRENCY,
  NWC_SERVICE_PUBKEY: getPublicKey(NWC_SERVICE_PRIVKEY),
  NWC_SERVICE_PRIVKEY,
  RELAY_URI,
  AUTHORIZED_PUBKEY,
  NWC_CONNECTION_PUBKEY: getPublicKey(NWC_CONNECTION_SECRET),
  NWC_CONNECTION_SECRET,
  TOTAL_MAX_SEND_AMOUNT_IN_SATS,
  WALLET_BALANCE_ENABLED,
  TRANSACTION_HISTORY_ENABLED,
  WEB_PANEL_ENABLED,
  WEB_PANEL_PORT,
  WEB_PANEL_HOST,
  BALANCE_POLLING_INTERVAL,
  BALANCE_DISPLAY_DEFAULT,
  parseInterval,
};
