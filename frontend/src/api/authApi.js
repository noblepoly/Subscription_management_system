import { apiRequest, mockStore } from './client';
import { validatePassword } from '../utils/validation';

export const authApi = {
  async login(email, password) {
    return apiRequest(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      async () => {
        const user = mockStore.users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (!user) {
          throw new Error('Invalid email or password');
        }
        // In mock mode, allow standard password or demo
        const fakeToken = `mock-jwt-token-${user.id}-${Date.now()}`;
        return {
          token: fakeToken,
          user: { ...user },
        };
      }
    );
  },

  async register(userData) {
    const { email, password, full_name, company_name, phone, billing_address } = userData;
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message);
    }

    return apiRequest(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          full_name,
          company_name,
          phone,
          billing_address,
        }),
      },
      async () => {
        const exists = mockStore.users.some(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (exists) {
          throw new Error('An account with this email already exists.');
        }

        const newUser = {
          id: `u-${Date.now()}`,
          email,
          full_name,
          company_name: company_name || null,
          role: 'CUSTOMER', // Strict invariant: public registration ALWAYS creates CUSTOMER
          phone: phone || null,
          billing_address: billing_address || null,
          is_active: true,
          created_at: new Date().toISOString(),
        };

        mockStore.users.push(newUser);
        mockStore.persist('users');

        return {
          token: `mock-jwt-token-${newUser.id}`,
          user: newUser,
          message: 'Registration successful! Welcome to Brightloop.',
        };
      }
    );
  },

  async requestPasswordReset(email) {
    return apiRequest(
      '/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      async () => {
        const user = mockStore.users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (!user) {
          return { message: 'If an account exists, a reset link will be sent.' };
        }
        return {
          message: 'Password reset link simulated. Check instructions.',
          reset_token: `rst-${Math.random().toString(36).substring(2, 10)}`,
        };
      }
    );
  },

  async resetPassword(token, newPassword) {
    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message);
    }

    return apiRequest(
      '/auth/reset-password',
      {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
      },
      async () => {
        return { message: 'Password successfully updated. You may now log in.' };
      }
    );
  },

  async getProfile() {
    return apiRequest(
      '/auth/profile',
      { method: 'GET' },
      async () => {
        const currentUserId = localStorage.getItem('bl_user_id');
        const user = mockStore.users.find((u) => u.id === currentUserId) || mockStore.users[0];
        return { user };
      }
    );
  },
};
