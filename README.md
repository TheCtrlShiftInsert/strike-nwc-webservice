# strike-nwc-webservice

Nostr Wallet Connect service using Strike API. Acts as a bridge between Nostr clients and the Strike payment infrastructure, enabling Lightning Network payments through Strike's robust API.

Features:
- Real-time NWC request processing via Nostr relays
- Lightning invoice creation and payment execution
- Balance tracking with configurable polling intervals
- Transaction history logging
- Optional web panel for monitoring and management
- User systemd service for auto-restart on reboots
- Tailscale support for secure remote access

## Supported NWC Commands

`pay_invoice` - Send Lightning payments. Requires `partner.payment-quote.lightning.create` and `partner.payment-quote.execute` Strike API scopes.

`make_invoice` - Create Lightning invoices. Requires `partner.invoice.create` and `partner.invoice.quote.generate` Strike API scopes.

`lookup_invoice` - Check invoice status. Requires `partner.invoice.read` Strike API scope.

`get_balance` - View wallet balance. Optional, requires `partner.balance.read` Strike API scope. Enabled by setting `WALLET_BALANCE=ENABLED` in your .env file.

`list_transactions` - View transaction history. Optional, requires `partner.invoice.read` Strike API scope. Enabled by setting `TRANSACTION_HISTORY=ENABLED` in your .env file.

## Web Panel

The service includes an optional web panel for real-time monitoring and configuration. To enable it, set `WEB_PANEL=ENABLED` in your .env file.

The web panel provides:
- Real-time connection status and metrics
- NWC connection string display with QR code
- Live log streaming
- Strike API ACL verification/testing
- Systemd service management (install/uninstall/restart)
- Balance display (when enabled)
- Transaction history (when enabled)

Configuration options:
- `WEB_PANEL` - Set to `ENABLED` to turn on the web panel (default: disabled)
- `WEB_PANEL_PORT` - Port for the web panel (default: 2021)
- `WEB_PANEL_HOST` - Host/IP to bind to (default: 127.0.0.1). Use comma-separated values for multiple interfaces (e.g., `127.0.0.1,100.x.x.x` for Tailscale access)

**Tailscale Access**: For secure remote access via Tailscale, configure `WEB_PANEL_HOST` with both localhost and your Tailscale IP:
```bash
WEB_PANEL_HOST=127.0.0.1,100.64.0.5
```

Access the web panel at `http://localhost:2021` (or your configured host/port) after starting the service.

## User Service Installation

The service includes a user systemd service for auto-restart on reboots. This allows the service to automatically start when your system boots and recover from failures.

See [service/README.md](service/README.md) for detailed setup instructions.

After initial setup, the web panel at http://localhost:2021 can manage the service with Install/Uninstall/Restart buttons.

## Connection Examples

The service includes helper scripts to test and broadcast NWC requests:

### Broadcast Test Requests

`npm run broadcast-example-make-invoice-req` - Creates and broadcasts a test `make_invoice` request for 69 sats

`npm run broadcast-example-lookup-invoice-req <LN_INVOICE>` - Creates and broadcasts a test `lookup_invoice` request for a specific Lightning invoice

### Helper Scripts

`npm run generate-secret` - Randomly generates a 32-byte hex encoded string which you can use to create your `NWC_SERVICE_PRIVKEY` and `NWC_CONNECTION_SECRET` env vars.

`npm run print-nwc` - Prints out your NWC connection string that you can use in Nostr clients such as Damus to make payments.

## Server API

The web panel exposes a REST API for programmatic access to service features.

### Endpoints

`GET /api/status` - Returns service status and metrics including relay connection, payment statistics, uptime, and feature flags

`GET /api/config` - Returns feature configuration (balance and transaction history enabled status)

`GET /api/balance` - Returns cached balance data (requires `WALLET_BALANCE=ENABLED`):
```json
{
  "totalBalance": 0,
  "incoming24h": 0,
  "outgoing24h": 0,
  "lastUpdated": "2024-02-27T...",
  "quotaUsed": 0,
  "quotaMax": 10000
}
```

`GET /api/transactions` - Returns transaction history (requires `TRANSACTION_HISTORY=ENABLED`). Returns up to 100 transactions sorted by timestamp.

`GET /api/service-status` - Returns systemd service status:
```json
{ "installed": true, "running": true }
```

`POST /api/service-install` - Installs or reinstalls the user systemd service

`POST /api/service-uninstall` - Stops and removes the user systemd service

`POST /api/service-restart` - Restarts the systemd service (web panel will disconnect for 21 seconds)

`POST /api/test-acl` - Tests Strike API ACL permissions for all required scopes

`GET /health` - Simple health check endpoint, returns "OK"

`WS /api/logs` - WebSocket endpoint for real-time log streaming

## Installation & Running

### NPM Installation

```bash
npm install
```

### Running the Service

**Option 1: Direct with npm**
```bash
npm start
```

**Option 2: PM2 (recommended for production)**
```bash
pm2 start src/index.js
```

**Option 3: Systemd Service (auto-restart on reboot)**

First complete the initial setup from [service/README.md](service/README.md), then:
```bash
systemctl --user start strike-connect
systemctl --user enable strike-connect
```

The systemd service automatically restarts on failure after 10 seconds.

## Usage

1. Create an account with Strike if you don't already have one https://strike.me/download/
1. Get a Strike API key from https://dashboard.strike.me/
1. Install the dependencies using npm: `npm install`
1. Create a .env file with all the required env variables (see .env.example)
1. Make sure you have money in your Strike account
1. Print your NWC connection by running `npm run print-nwc` and copy it into whatever Nostr client you'd like to use to make payments
1. Run the server `npm start` (or use PM2 or systemd as described above)

Make sure the server is running whenever making payments.
