import { apiRequest } from './client';

export const plansApi = {
  async getPlans(params = {}) {
    const query = new URLSearchParams();
    if (params.billing_interval) query.append('billing_interval', params.billing_interval);
    if (params.include_inactive) query.append('include_inactive', 'true');

    const qs = query.toString() ? `?${query.toString()}` : '';
    const { data } = await apiRequest(`/plans${qs}`, { method: 'GET' });
    const list = data.plans || data.data?.plans || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async getPlanById(id) {
    const { data } = await apiRequest(`/plans/${id}`, { method: 'GET' });
    return data.plan || data.data?.plan || data;
  },

  async createPlan(planData) {
    const payload = {
      name: planData.name.trim(),
      billing_interval: planData.billing_interval || 'MONTHLY',
      interval_count: Number(planData.interval_count) || 1,
      minimum_quantity: Number(planData.minimum_quantity) || 1,
      base_price: Number(planData.base_price) || 0,
      available_from: planData.available_from || new Date().toISOString().split('T')[0],
      available_to: planData.available_to || null,
      auto_close: Boolean(planData.auto_close),
      auto_close_days: Number(planData.auto_close_days) || 0,
    };

    const { data } = await apiRequest('/plans', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.plan || data.data?.plan || data;
  },

  async updatePlan(id, planData) {
    const payload = {
      name: planData.name?.trim(),
      billing_interval: planData.billing_interval,
      interval_count: planData.interval_count !== undefined ? Number(planData.interval_count) : undefined,
      minimum_quantity: planData.minimum_quantity !== undefined ? Number(planData.minimum_quantity) : undefined,
      base_price: planData.base_price !== undefined ? Number(planData.base_price) : undefined,
      available_from: planData.available_from || null,
      available_to: planData.available_to || null,
      auto_close: planData.auto_close !== undefined ? Boolean(planData.auto_close) : undefined,
      auto_close_days: planData.auto_close_days !== undefined ? Number(planData.auto_close_days) : undefined,
      is_active: planData.is_active,
    };

    const { data } = await apiRequest(`/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return data.plan || data.data?.plan || data;
  },

  async togglePlanStatus(id) {
    // Try PATCH toggle or PUT with inverted is_active
    try {
      const { data } = await apiRequest(`/plans/${id}/toggle`, { method: 'PATCH' });
      return data.plan || data;
    } catch {
      const current = await this.getPlanById(id);
      return this.updatePlan(id, { is_active: !current.is_active });
    }
  },
};
