import { apiRequest } from './client';

export const quotationsApi = {
  async getQuotations(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.include_inactive) query.append('include_inactive', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';

    const { data } = await apiRequest(`/quotations${qs}`, { method: 'GET' });
    const list = data.quotations || data.data?.quotations || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async getQuotationById(id) {
    const { data } = await apiRequest(`/quotations/${id}`, { method: 'GET' });
    return data.quotation || data.data?.quotation || data;
  },

  async createQuotation(quotData) {
    const payload = {
      name: quotData.name.trim(),
      description: quotData.description || null,
      plan_id: quotData.plan_id || null,
      default_validity_days: Number(quotData.default_validity_days) || 30,
      terms_and_conditions: quotData.terms_and_conditions || null,
      items: (quotData.items || []).map((it) => ({
        product_id: it.product_id,
        variant_id: it.variant_id || null,
        quantity: Number(it.quantity) || 1,
        override_unit_price: it.override_unit_price !== undefined ? Number(it.override_unit_price) : Number(it.unit_price) || 0,
      })),
    };

    const { data } = await apiRequest('/quotations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.quotation || data.data?.quotation || data;
  },

  async updateQuotation(id, quotData) {
    const payload = {
      name: quotData.name?.trim(),
      description: quotData.description,
      plan_id: quotData.plan_id || null,
      default_validity_days: quotData.default_validity_days !== undefined ? Number(quotData.default_validity_days) : undefined,
      terms_and_conditions: quotData.terms_and_conditions,
      is_active: quotData.is_active,
      items: (quotData.items || []).map((it) => ({
        product_id: it.product_id,
        variant_id: it.variant_id || null,
        quantity: Number(it.quantity) || 1,
        override_unit_price: it.override_unit_price !== undefined ? Number(it.override_unit_price) : Number(it.unit_price) || 0,
      })),
    };

    const { data } = await apiRequest(`/quotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return data.quotation || data.data?.quotation || data;
  },

  async convertToSubscription(quotationId, customerId) {
    const { data } = await apiRequest(`/quotations/${quotationId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId }),
    });
    return data.subscription || data.data?.subscription || data;
  },
};
