import { apiRequest, mockStore } from './client';

export const plansApi = {
  async getPlans() {
    return apiRequest('/plans', { method: 'GET' }, async () => {
      return [...mockStore.plans];
    });
  },

  async createPlan(planData) {
    return apiRequest(
      '/plans',
      {
        method: 'POST',
        body: JSON.stringify(planData),
      },
      async () => {
        const newPlan = {
          id: `plan-${Date.now()}`,
          name: planData.name,
          billing_interval: planData.billing_interval || 'MONTHLY',
          interval_count: Number(planData.interval_count) || 1,
          minimum_quantity: Number(planData.minimum_quantity) || 1,
          base_price: Number(planData.base_price) || 0,
          available_from: planData.available_from || new Date().toISOString().split('T')[0],
          available_to: planData.available_to || null,
          auto_close: Boolean(planData.auto_close),
          auto_close_days: Number(planData.auto_close_days) || 0,
          is_active: planData.is_active !== false,
        };
        mockStore.plans.unshift(newPlan);
        mockStore.persist('plans');
        return newPlan;
      }
    );
  },

  async updatePlan(id, planData) {
    return apiRequest(
      `/plans/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(planData),
      },
      async () => {
        const idx = mockStore.plans.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error('Plan not found');
        mockStore.plans[idx] = {
          ...mockStore.plans[idx],
          ...planData,
          base_price: Number(planData.base_price ?? mockStore.plans[idx].base_price),
          interval_count: Number(planData.interval_count ?? mockStore.plans[idx].interval_count),
        };
        mockStore.persist('plans');
        return mockStore.plans[idx];
      }
    );
  },

  async togglePlanStatus(id) {
    return apiRequest(
      `/plans/${id}/toggle`,
      { method: 'PATCH' },
      async () => {
        const idx = mockStore.plans.findIndex((p) => p.id === id);
        if (idx !== -1) {
          mockStore.plans[idx].is_active = !mockStore.plans[idx].is_active;
          mockStore.persist('plans');
          return mockStore.plans[idx];
        }
        throw new Error('Plan not found');
      }
    );
  },
};
