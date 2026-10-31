import { apiRequest } from './client';

export const invoicesApi = {
  async getInvoices(params = {}) {
    const query = new URLSearchParams();
    if (params.customerId) query.append('customer_id', params.customerId);
    if (params.status && params.status !== 'ALL') query.append('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';

    try {
      const { data } = await apiRequest(`/invoices${qs}`, { method: 'GET' });
      const list = data.invoices || data.data?.invoices || (Array.isArray(data) ? data : []);
      return { data: list };
    } catch {
      return { data: [] };
    }
  },

  async getInvoiceById(id) {
    const { data } = await apiRequest(`/invoices/${id}`, { method: 'GET' });
    return data.invoice || data.data?.invoice || data;
  },

  async runRecurringBillingCycle() {
    const { data } = await apiRequest('/billing/run-cycle', { method: 'POST' });
    return { data };
  },
};
