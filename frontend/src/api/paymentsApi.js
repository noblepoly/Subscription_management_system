import { apiRequest } from './client';

export const paymentsApi = {
  async getPayments(params = {}) {
    const query = new URLSearchParams();
    if (params.customerId) query.append('customer_id', params.customerId);
    if (params.status && params.status !== 'ALL') query.append('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';

    try {
      const { data } = await apiRequest(`/payments${qs}`, { method: 'GET' });
      const list = data.payments || data.data?.payments || (Array.isArray(data) ? data : []);
      return { data: list };
    } catch {
      return { data: [] };
    }
  },

  async recordPayment(paymentData) {
    const { data } = await apiRequest('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
    return data.payment || data.data?.payment || data;
  },

  async verifyPayment(paymentId, staffId) {
    const { data } = await apiRequest(`/payments/${paymentId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ staff_id: staffId }),
    });
    return data.payment || data.data?.payment || data;
  },
};
