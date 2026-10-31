import { apiRequest, mockStore } from './client';

export const subscriptionsApi = {
  async getSubscriptions(params = {}) {
    return apiRequest(
      '/subscriptions',
      { method: 'GET' },
      async () => {
        let list = [...mockStore.subscriptions];
        // Enforce customer scoping if customerId is passed or customer role
        if (params.customerId) {
          list = list.filter((s) => s.customer_id === params.customerId);
        }
        if (params.status && params.status !== 'ALL') {
          list = list.filter((s) => s.status === params.status);
        }
        return list;
      }
    );
  },

  async getSubscriptionById(id) {
    return apiRequest(
      `/subscriptions/${id}`,
      { method: 'GET' },
      async () => {
        const sub = mockStore.subscriptions.find((s) => s.id === id);
        if (!sub) throw new Error('Subscription not found');
        return sub;
      }
    );
  },

  async createSubscription(subData) {
    return apiRequest(
      '/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify(subData),
      },
      async () => {
        const plan = mockStore.plans.find((p) => p.id === subData.plan_id) || mockStore.plans[0];
        const customer = mockStore.users.find((u) => u.id === subData.customer_id) || mockStore.users[2];
        const subCount = mockStore.subscriptions.length + 1;
        const subNumber = `SUB-2026-${String(subCount).padStart(5, '0')}`;

        const subtotal = (subData.items || []).reduce((acc, it) => acc + (Number(it.line_total) || 0), 0);
        const discountAmount = Number(subData.discount_amount) || 0;
        const taxable = Math.max(0, subtotal - discountAmount);
        const taxRate = Number(subData.tax_rate) || 18.0;
        const taxAmount = Number(((taxable * taxRate) / 100).toFixed(2));
        const recurringTotal = Number((taxable + taxAmount).toFixed(2));

        const newSub = {
          id: `sub-${Date.now()}`,
          subscription_number: subNumber,
          customer_id: customer.id,
          customer_name: customer.full_name,
          customer_email: customer.email,
          plan_id: plan.id,
          plan_name: plan.name,
          billing_interval: plan.billing_interval,
          interval_count: plan.interval_count,
          status: subData.status || 'DRAFT',
          start_date: subData.start_date || new Date().toISOString(),
          expiry_date: subData.expiry_date || null,
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          last_billed_date: null,
          paused_at: null,
          closed_at: null,
          closure_reason: null,
          subtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          recurring_total: recurringTotal,
          notes: subData.notes || '',
          created_at: new Date().toISOString(),
          items: (subData.items || []).map((it, idx) => ({
            id: `si-${Date.now()}-${idx}`,
            product_id: it.product_id,
            product_name: it.product_name,
            variant_id: it.variant_id || null,
            variant_name: it.variant_name || null,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            additional_price: Number(it.additional_price) || 0,
            line_total: Number(it.line_total) || 0,
          })),
        };

        mockStore.subscriptions.unshift(newSub);
        mockStore.persist('subscriptions');
        return newSub;
      }
    );
  },

  async updateSubscriptionStatus(id, action, payload = {}) {
    return apiRequest(
      `/subscriptions/${id}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
      },
      async () => {
        const sub = mockStore.subscriptions.find((s) => s.id === id);
        if (!sub) throw new Error('Subscription not found');

        switch (action) {
          case 'CONFIRM':
            sub.status = 'CONFIRMED';
            break;
          case 'ACTIVATE':
            sub.status = 'ACTIVE';
            sub.start_date = sub.start_date || new Date().toISOString();
            break;
          case 'PAUSE':
            sub.status = 'PAUSED';
            sub.paused_at = new Date().toISOString();
            break;
          case 'RESUME':
            sub.status = 'ACTIVE';
            sub.paused_at = null;
            break;
          case 'CLOSE':
            sub.status = 'CLOSED';
            sub.closed_at = new Date().toISOString();
            sub.closure_reason = payload.closure_reason || 'Closed upon client/staff request';
            break;
          case 'RENEW':
            sub.status = 'ACTIVE';
            sub.expiry_date = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            break;
          default:
            throw new Error(`Invalid lifecycle action: ${action}`);
        }

        mockStore.persist('subscriptions');
        return sub;
      }
    );
  },
};
