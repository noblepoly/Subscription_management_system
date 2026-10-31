import { apiRequest } from './client';
import { validatePassword } from '../utils/validation';

export const authApi = {
  async login(email, password) {
    const { data } = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    // Backend returns { success: true, user: {...}, token: "..." }
    const user = data.user || data.data?.user;
    const token = data.token || data.data?.token;
    return { user, token };
  },

  async register(userData) {
    const { email, password, full_name, company_name, phone, billing_address } = userData;
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message);
    }

    const { data } = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        full_name: full_name.trim(),
        company_name: company_name ? company_name.trim() : null,
        phone: phone ? phone.trim() : null,
        billing_address: billing_address ? billing_address.trim() : null,
      }),
    });
    const user = data.user || data.data?.user;
    const token = data.token || data.data?.token;
    return { user, token, message: data.message };
  },

  async getCurrentUser() {
    const { data } = await apiRequest('/auth/me', { method: 'GET' });
    return data.user || data.data?.user;
  },

  async requestPasswordReset(email) {
    const { data } = await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    return data;
  },

  async resetPassword(token, newPassword) {
    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) {
      throw new Error(pwdCheck.message);
    }

    const { data } = await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: token.trim(), new_password: newPassword }),
    });
    return data;
  },
};
