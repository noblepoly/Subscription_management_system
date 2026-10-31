import { apiRequest, mockStore } from './client';

export const quotationsApi = {
  async getQuotations() {
    return apiRequest('/quotations', { method: 'GET' }, async () => {
      return [...mockStore.quotations];
    });
  },

  async createQuotation(quotData) {
    return apiRequest(
      '/quotations',
      {
        method: 'POST',
        body: JSON.stringify(quotData),
      },
      async () => {
        const plan = mockStore.plans.find((p) => p.id === quotData.plan_id);
        const newQuot = {
          id: `quot-${Date.now()}`,
          name: quotData.name,
          description: quotData.description || '',
          plan_id: quotData.plan_id,
          plan_name: plan ? plan.name : 'Custom Plan',
          default_validity_days: Number(quotData.default_validity_days) || 30,
          terms_and_conditions: quotData.terms_and_conditions || '',
          customer_id: quotData.customer_id || null,
          customer_name: quotData.customer_name || 'Prospect Customer',
          is_active: true,
          total_estimated: Number(quotData.total_estimated) || 0,
          created_at: new Date().toISOString(),
          items: (quotData.items || []).map((it, idx) => ({
            id: `qi-${Date.now()}-${idx}`,
            product_id: it.product_id,
            product_name: it.product_name,
            variant_id: it.variant_id || null,
            variant_name: it.variant_name || null,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            additional_price: Number(it.additional_price) || 0,
            line_total: (Number(it.unit_price) + Number(it.additional_price || 0)) * (Number(it.quantity) || 1),
          })),
        };

        mockStore.quotations.unshift(newQuot);
        mockStore.persist('quotations');
        return newQuot;
      }
    );
  },

  async convertToSubscription(quotationId, customerId) {
    return apiRequest(
      `/quotations/${quotationId}/convert`,
      {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId }),
      },
      async () => {
        const quot = mockStore.quotations.find((q) => q.id === quotationId);
        if (!quot) throw new Error('Quotation not found');

        const customer = mockStore.users.find((u) => u.id === customerId) || {
          id: customerId,
          full_name: 'Converted Customer',
          email: 'customer@client.io',
        };

        const plan = mockStore.plans.find((p) => p.id === quot.plan_id) || mockStore.plans[0];
        const subtotal = quot.items.reduce((sum, item) => sum + item.line_total, 0);
        const taxRate = 18.0; // default standard tax
        const taxAmount = (subtotal * taxRate) / 100;
        const recurringTotal = subtotal + taxAmount;

        const subCount = mockStore.subscriptions.length + 1;
        const subNumber = `SUB-2026-${String(subCount).padStart(5, '0')}`;

        const newSubscription = {
          id: `sub-${Date.now()}`,
          subscription_number: subNumber,
          customer_id: customer.id,
          customer_name: customer.full_name,
          customer_email: customer.email,
          plan_id: plan.id,
          plan_name: plan.name,
          billing_interval: plan.billing_interval,
          interval_count: plan.interval_count,
          status: 'CONFIRMED', // Converted from quotation to confirmed
          start_date: new Date().toISOString(),
          expiry_date: null,
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          last_billed_date: null,
          subtotal,
          discount_amount: 0,
          tax_amount: Number(taxAmount.toFixed(2)),
          recurring_total: Number(recurringTotal.toFixed(2)),
          notes: `Converted from Quotation: ${quot.name}`,
          created_at: new Date().toISOString(),
          items: quot.items.map((it, idx) => ({
            id: `si-${Date.now()}-${idx}`,
            product_id: it.product_id,
            product_name: it.product_name,
            variant_id: it.variant_id,
            variant_name: it.variant_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            additional_price: it.additional_price || 0,
            line_total: it.line_total,
          })),
        };

        mockStore.subscriptions.unshift(newSubscription);
        mockStore.persist('subscriptions');
        return newSubscription;
      }
    );
  },
};
