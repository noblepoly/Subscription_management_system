import { apiRequest } from './client';

export const discountsApi = {
  // Taxes
  async getTaxRates(params = {}) {
    const query = new URLSearchParams();
    if (params.include_inactive) query.append('include_inactive', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';

    const { data } = await apiRequest(`/taxes${qs}`, { method: 'GET' });
    const list = data.taxes || data.data?.taxes || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async createTaxRate(taxData) {
    const payload = {
      name: taxData.name.trim(),
      rate_percentage: Number(taxData.rate_percentage) || 0,
    };
    const { data } = await apiRequest('/taxes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.tax || data.data?.tax || data;
  },

  // Discounts
  async getDiscounts(params = {}) {
    const query = new URLSearchParams();
    if (params.scope) query.append('scope', params.scope);
    if (params.is_active !== undefined) query.append('is_active', String(params.is_active));
    if (params.search) query.append('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';

    const { data } = await apiRequest(`/discounts${qs}`, { method: 'GET' });
    const list = data.discounts || data.data?.discounts || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async createDiscount(discData) {
    const payload = {
      code: discData.code.toUpperCase().trim(),
      description: discData.description || null,
      discount_type: discData.discount_type || 'PERCENTAGE',
      discount_value: Number(discData.discount_value) || 0,
      scope: discData.scope || 'SUBSCRIPTION',
      min_purchase_amount: Number(discData.min_purchase_amount) || 0,
      min_quantity: Number(discData.min_quantity) || 1,
      start_date: discData.start_date || new Date().toISOString().split('T')[0],
      end_date: discData.end_date || null,
      usage_limit: discData.usage_limit ? Number(discData.usage_limit) : null,
      applicable_product_ids: discData.applicable_product_ids || [],
    };

    const { data } = await apiRequest('/discounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.discount || data.data?.discount || data;
  },

  async toggleDiscountStatus(id) {
    try {
      const { data } = await apiRequest(`/discounts/${id}/toggle`, { method: 'PATCH' });
      return data.discount || data;
    } catch {
      const { data } = await apiRequest(`/discounts/${id}`, { method: 'DELETE' });
      return data;
    }
  },
};
