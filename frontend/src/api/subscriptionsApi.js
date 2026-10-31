import { apiRequest } from './client';

export const subscriptionsApi = {
  async getSubscriptions(params = {}) {
    const query = new URLSearchParams();
    if (params.customerId) query.append('customer_id', params.customerId);
    if (params.status && params.status !== 'ALL') query.append('status', params.status);
    if (params.search) query.append('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';

    const { data } = await apiRequest(`/subscriptions${qs}`, { method: 'GET' });
    const list = data.subscriptions || data.data?.subscriptions || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async getSubscriptionById(id) {
    const { data } = await apiRequest(`/subscriptions/${id}`, { method: 'GET' });
    return data.subscription || data.data?.subscription || data;
  },

  async createSubscription(subData) {
    const payload = {
      customer_id: subData.customer_id,
      plan_id: subData.plan_id,
      status: subData.status || 'CONFIRMED',
      notes: subData.notes || null,
      items: (subData.items || []).map((it) => ({
        product_id: it.product_id,
        variant_id: it.variant_id || null,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        additional_price: Number(it.additional_price) || 0,
      })),
    };

    const { data } = await apiRequest('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.subscription || data.data?.subscription || data;
  },

  async updateSubscriptionStatus(id, action, payload = {}) {
    const { data } = await apiRequest(`/subscriptions/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ action: action.toUpperCase(), ...payload }),
    });
    return data.subscription || data.data?.subscription || data;
  },
};
