const {
  payInvoice,
  makeInvoice,
  lookupInvoice,
  getBalance,
  listInvoices
} = require('./strike');

/**
 * Test pay_invoice ACL (partner.payment-quote.lightning.create)
 */
const testPayInvoice = async () => {
  try {
    // We can't actually test this without a real invoice
    // Instead, we'll verify the API key has access by attempting to create a quote
    // This will fail with invalid invoice but proves the endpoint is accessible
    return {
      scope: 'partner.payment-quote.lightning.create',
      name: 'pay_invoice',
      status: 'unknown',
      message: 'Cannot test without valid invoice - requires manual verification'
    };
  } catch (err) {
    return {
      scope: 'partner.payment-quote.lightning.create',
      name: 'pay_invoice',
      status: 'error',
      message: err.message
    };
  }
};

/**
 * Test make_invoice ACL (partner.invoice.create)
 */
const testMakeInvoice = async () => {
  try {
    // Try to create a minimal invoice (1 sat)
    const result = await makeInvoice({
      amountInMillisats: 1000,
      description: 'ACL Test'
    });

    return {
      scope: 'partner.invoice.create',
      name: 'make_invoice',
      status: 'success',
      message: 'Successfully created test invoice',
      details: {
        invoiceId: result.invoiceId,
        state: result.state
      }
    };
  } catch (err) {
    const isAuthError = err.response?.status === 401 || err.response?.status === 403;
    return {
      scope: 'partner.invoice.create',
      name: 'make_invoice',
      status: isAuthError ? 'missing' : 'error',
      message: isAuthError
        ? 'API key missing partner.invoice.create scope'
        : err.message
    };
  }
};

/**
 * Test lookup_invoice ACL (partner.invoice.read)
 */
const testLookupInvoice = async () => {
  try {
    // Try to list invoices (also uses partner.invoice.read)
    const result = await listInvoices({ limit: 1 });

    return {
      scope: 'partner.invoice.read',
      name: 'lookup_invoice',
      status: 'success',
      message: `Successfully listed invoices (count: ${result.items?.length || 0})`
    };
  } catch (err) {
    const isAuthError = err.response?.status === 401 || err.response?.status === 403;
    return {
      scope: 'partner.invoice.read',
      name: 'lookup_invoice',
      status: isAuthError ? 'missing' : 'error',
      message: isAuthError
        ? 'API key missing partner.invoice.read scope'
        : err.message
    };
  }
};

/**
 * Test get_balance ACL (partner.balance.read)
 */
const testGetBalance = async () => {
  try {
    const balances = await getBalance();

    return {
      scope: 'partner.balance.read',
      name: 'get_balance',
      status: 'success',
      message: 'Successfully retrieved balance',
      details: {
        currencies: balances.map(b => b.currency).join(', ')
      }
    };
  } catch (err) {
    const isAuthError = err.response?.status === 401 || err.response?.status === 403;
    return {
      scope: 'partner.balance.read',
      name: 'get_balance',
      status: isAuthError ? 'missing' : 'error',
      message: isAuthError
        ? 'API key missing partner.balance.read scope'
        : err.message
    };
  }
};

/**
 * Test list_transactions ACL (partner.invoice.read)
 * Note: This uses the same scope as lookup_invoice
 */
const testListTransactions = async () => {
  try {
    const result = await listInvoices({ limit: 1 });

    return {
      scope: 'partner.invoice.read',
      name: 'list_transactions',
      status: 'success',
      message: `Successfully listed transactions (count: ${result.items?.length || 0})`
    };
  } catch (err) {
    const isAuthError = err.response?.status === 401 || err.response?.status === 403;
    return {
      scope: 'partner.invoice.read',
      name: 'list_transactions',
      status: isAuthError ? 'missing' : 'error',
      message: isAuthError
        ? 'API key missing partner.invoice.read scope'
        : err.message
    };
  }
};

/**
 * Run all ACL tests
 */
const testAllACLs = async () => {
  const tests = [
    { fn: testPayInvoice, method: 'pay_invoice' },
    { fn: testMakeInvoice, method: 'make_invoice' },
    { fn: testLookupInvoice, method: 'lookup_invoice' },
    { fn: testGetBalance, method: 'get_balance' },
    { fn: testListTransactions, method: 'list_transactions' }
  ];

  const results = {};

  for (const test of tests) {
    try {
      results[test.method] = await test.fn();
    } catch (err) {
      results[test.method] = {
        name: test.method,
        status: 'error',
        message: err.message
      };
    }
  }

  return results;
};

module.exports = {
  testAllACLs,
  testPayInvoice,
  testMakeInvoice,
  testLookupInvoice,
  testGetBalance,
  testListTransactions
};
