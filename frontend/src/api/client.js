import {
  initialUsers,
  initialProducts,
  initialPlans,
  initialTaxRates,
  initialDiscounts,
  initialQuotations,
  initialSubscriptions,
  initialInvoices,
  initialPayments
} from './mockData';

// Persistent in-memory/localStorage store for mock state
const loadStore = (key, defaultData) => {
  try {
    const saved = localStorage.getItem(`bl_mock_${key}`);
    return saved ? JSON.parse(saved) : defaultData;
  } catch {
    return defaultData;
  }
};

const saveStore = (key, data) => {
  try {
    localStorage.setItem(`bl_mock_${key}`, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save mock store ${key}`, e);
  }
};

export const mockStore = {
  users: loadStore('users', initialUsers),
  products: loadStore('products', initialProducts),
  plans: loadStore('plans', initialPlans),
  taxes: loadStore('taxes', initialTaxRates),
  discounts: loadStore('discounts', initialDiscounts),
  quotations: loadStore('quotations', initialQuotations),
  subscriptions: loadStore('subscriptions', initialSubscriptions),
  invoices: loadStore('invoices', initialInvoices),
  payments: loadStore('payments', initialPayments),

  persist(key) {
    saveStore(key, this[key]);
  }
};

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Universal request wrapper.
 * Automatically attempts the real backend API.
 * If backend fails with network error / 404 / 502, seamlessly falls back to mock handler.
 */
export async function apiRequest(endpoint, options = {}, mockHandler = null) {
  const token = localStorage.getItem('bl_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // If backend endpoint is active and returns valid response
    if (response.ok) {
      const data = await response.json();
      return { data, status: response.status, fromBackend: true };
    }

    // If backend returns 401/403/422, respect backend business validation
    if (response.status === 401 || response.status === 403 || response.status === 422) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || `Request failed with status ${response.status}`);
    }

    // If endpoint is not found (404) or server down (502/503), use fallback if provided
    if (mockHandler) {
      console.info(`[API Fallback] Backend ${endpoint} returned ${response.status}. Using client mock handler.`);
      const mockResult = await mockHandler();
      return { data: mockResult, status: 200, fromBackend: false };
    }

    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed with status ${response.status}`);
  } catch (err) {
    // On fetch error (backend offline / CORS / connection refused), invoke fallback
    if (mockHandler) {
      console.info(`[API Offline Fallback] Backend not reachable for ${endpoint}. Using client mock handler.`);
      const mockResult = await mockHandler();
      return { data: mockResult, status: 200, fromBackend: false };
    }
    throw err;
  }
}
