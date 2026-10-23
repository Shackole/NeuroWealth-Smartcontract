import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock Soroban RPC endpoints
  http.post('*/soroban-rpc', async ({ request }) => {
    return HttpResponse.json({
      jsonrpc: '2.0',
      id: 1,
      result: { status: 'SUCCESS' }
    });
  }),

  // Mock contract API endpoints
  http.post('*/api/contract/deposit', async ({ request }) => {
    let data: any = {};
    try {
      data = await request.json();
    } catch {}
    return HttpResponse.json({
      success: true,
      txHash: '0xmockdeposit1234567890',
      amount: data.amount || 10,
      user: data.user || ''
    });
  }),

  http.post('*/api/contract/withdraw', async ({ request }) => {
    let data: any = {};
    try {
      data = await request.json();
    } catch {}
    return HttpResponse.json({
      success: true,
      txHash: '0xmockwithdraw1234567890',
      amount: data.amount || 5,
      user: data.user || ''
    });
  }),

  http.post('*/api/contract/withdraw_all', async ({ request }) => {
    let data: any = {};
    try {
      data = await request.json();
    } catch {}
    return HttpResponse.json({
      success: true,
      txHash: '0xmockwithdrawall1234567890',
      amountWithdrawn: 1000,
      user: data.user || ''
    });
  }),

  http.post('*/api/contract/set_user_strategy', async ({ request }) => {
    let data: any = {};
    try {
      data = await request.json();
    } catch {}
    return HttpResponse.json({
      success: true,
      strategy: data.strategy || 'balanced',
      user: data.user || ''
    });
  }),

  http.get('*/api/contract/state', () => {
    return HttpResponse.json({
      balance: 1450.85,
      strategy: 'Balanced',
      exchangeRate: 1.042,
      apy: 8.4
    });
  })
];
