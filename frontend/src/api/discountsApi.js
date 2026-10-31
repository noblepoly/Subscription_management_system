import { apiRequest, mockStore } from './client';

export const discountsApi = {
  // Taxes
  async getTaxRates() {
    return apiRequest('/taxes', { method: 'GET' }, async () => {
      return [...mockStore.taxes];
    });
  },

  async createTaxRate(taxData) {
    return apiRequest(
      '/taxes',
      {
        method: 'POST',
        body: JSON.stringify(taxData),
      },
      async () => {
        const newTax = {
          id: `tax-${Date.now()}`,
          name: taxData.name,
          rate_percentage: Number(taxData.rate_percentage) || 0,
          is_active: taxData.is_active !== false,
        };
        mockStore.taxes.push(newTax);
        mockStore.persist('taxes');
        return newTax;
      }
    );
  },

  // Discounts
  async getDiscounts() {
    return apiRequest('/discounts', { method: 'GET' }, async () => {
      return [...mockStore.discounts];
    });
  },

  async createDiscount(discData) {
    return apiRequest(
      '/discounts',
      {
        method: 'POST',
        body: JSON.stringify(discData),
      },
      async () => {
        const exists = mockStore.discounts.some(
          (d) => d.code.toUpperCase() === discData.code.toUpperCase()
        );
        if (exists) throw new Error('A discount with this coupon code already exists.');

        const newDisc = {
          id: `disc-${Date.now()}`,
          code: discData.code.toUpperCase().trim(),
          description: discData.description || '',
          discount_type: discData.discount_type || 'PERCENTAGE',
          discount_value: Number(discData.discount_value) || 0,
          scope: discData.scope || 'SUBSCRIPTION',
          min_purchase_amount: Number(discData.min_purchase_amount) || 0,
          min_quantity: Number(discData.min_quantity) || 1,
          start_date: discData.start_date || new Date().toISOString().split('T')[0],
          end_date: discData.end_date || null,
          usage_limit: discData.usage_limit ? Number(discData.usage_limit) : null,
          times_used: 0,
          is_active: discData.is_active !== false,
          applicable_product_ids: discData.applicable_product_ids || [],
        };
        mockStore.discounts.unshift(newDisc);
        mockStore.persist('discounts');
        return newDisc;
      }
    );
  },

  async toggleDiscountStatus(id) {
    return apiRequest(
      `/discounts/${id}/toggle`,
      { method: 'PATCH' },
      async () => {
        const disc = mockStore.discounts.find((d) => d.id === id);
        if (!disc) throw new Error('Discount not found');
        disc.is_active = !disc.is_active;
        mockStore.persist('discounts');
        return disc;
      }
    );
  },
};
