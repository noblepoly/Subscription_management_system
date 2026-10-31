import { apiRequest } from './client';
import { validatePassword } from '../utils/validation';

export const usersApi = {
  async getUsers(params = {}) {
    const query = new URLSearchParams();
    if (params.role) query.append('role', params.role);
    if (params.is_active !== undefined) query.append('is_active', String(params.is_active));
    if (params.search) query.append('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';

    const { data } = await apiRequest(`/users${qs}`, { method: 'GET' });
    const list = data.data?.users || data.users || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async getCustomers() {
    const { data } = await apiRequest('/users?role=CUSTOMER', { method: 'GET' });
    const list = data.data?.users || data.users || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async createStaff(staffData) {
    const { email, password, full_name, phone, company_name } = staffData;
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message);
    }

    const payload = {
      email: email.trim().toLowerCase(),
      password,
      full_name: full_name.trim(),
      phone: phone ? phone.trim() : null,
      company_name: company_name ? company_name.trim() : 'Brightloop Internal Staff',
    };

    const { data } = await apiRequest('/users/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.data?.user || data.user || data;
  },

  async toggleUserStatus(id) {
    const { data } = await apiRequest(`/users/${id}/toggle`, { method: 'PATCH' });
    return data.data?.user || data.user || data;
  },
};
