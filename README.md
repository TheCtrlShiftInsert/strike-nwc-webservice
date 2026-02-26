# strike-nwc-service
Nostr Wallet Connect service using Strike API.

## Supported NWC Commands

`pay_invoice` - requires `partner.payment-quote.lightning.create` and `partner.payment-quote.execute` Strike API scopes.

`make_invoice` - requires `partner.invoice.create` and `partner.invoice.quote.generate` Strike API scopes.

`lookup_invoice` - requires `partner.invoice.read` Strike API scope.

`get_balance` - optional, requires `partner.balance.read` Strike API scope. Enabled by setting `WALLET_BALANCE=ENABLED` in your .env file.

`list_transactions` - optional, requires `partner.invoice.read` Strike API scope. Enabled by setting `TRANSACTION_HISTORY=ENABLED` in your .env file.

## Web Panel

The service includes an optional web panel for real-time monitoring and configuration. To enable it, set `WEB_PANEL=ENABLED` in your .env file.

The web panel provides:
- Real-time connection status and metrics
- NWC connection string display with QR code
- Live log streaming
- Strike API ACL verification/testing

Configuration options:
- `WEB_PANEL` - Set to `ENABLED` to turn on the web panel (default: disabled)
- `WEB_PANEL_PORT` - Port for the web panel (default: 3000)
- `WEB_PANEL_HOST` - Host/IP to bind to (default: 127.0.0.1). Use comma-separated values for multiple interfaces (e.g., `127.0.0.1,100.x.x.x` for Tailscale access)

Access the web panel at `http://localhost:3000` (or your configured host/port) after starting the service.

## Helper Scripts

`npm run generate-secret` will randomly generate a 32 byte hex encoded string which you can use to create your `NWC_SERVICE_PRIVKEY` and `NWC_CONNECTION_SECRET` env vars.

`npm run print-nwc` will print out your NWC connection string that you can use in Nostr clients such as Damus to make payments.

## Usage

1. Create an account with Strike if you don't already have one https://strike.me/download/
1. Get a Strike API key from https://dashboard.strike.me/
1. Install the dependencies using npm or yarn or whatever your heart desires
1. Create a .env file with all the required env variables (see .env.example)
1. Make sure you have money in your Strike account
1. Print your NWC connection by running `npm run print-nwc` and copy it into whatever Nostr client you'd like to use to make payments
1. Run the server `npm start`. If you have [pm2](https://pm2.keymetrics.io/) installed, start the server by running `pm2 start src/index.js` instead of `npm start`.

Make sure the server is running whenever making payments.
