import { apiRequest, mockStore } from './client';
import { validatePassword } from '../utils/validation';

export const usersApi = {
  async getUsers() {
    return apiRequest('/users', { method: 'GET' }, async () => {
      return [...mockStore.users];
    });
  },

  async getCustomers() {
    return apiRequest('/users/customers', { method: 'GET' }, async () => {
      return mockStore.users.filter((u) => u.role === 'CUSTOMER');
    });
  },

  async createStaff(staffData) {
    const { email, password, full_name, phone } = staffData;
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message);
    }

    return apiRequest(
      '/users/staff',
      {
        method: 'POST',
        body: JSON.stringify(staffData),
      },
      async () => {
        const exists = mockStore.users.some(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (exists) throw new Error('A user with this email already exists.');

        const newStaff = {
          id: `u-${Date.now()}`,
          email,
          full_name,
          company_name: 'Brightloop Staff',
          role: 'STAFF', // Created by Admin
          phone: phone || null,
          billing_address: null,
          is_active: true,
          created_at: new Date().toISOString(),
        };

        mockStore.users.push(newStaff);
        mockStore.persist('users');
        return newStaff;
      }
    );
  },

  async toggleUserStatus(id) {
    return apiRequest(
      `/users/${id}/toggle`,
      { method: 'PATCH' },
      async () => {
        const user = mockStore.users.find((u) => u.id === id);
        if (!user) throw new Error('User not found');
        user.is_active = !user.is_active;
        mockStore.persist('users');
        return user;
      }
    );
  },
};
