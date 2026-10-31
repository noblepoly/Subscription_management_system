/**
 * Centralized API Client for Brightloop System.
 * Connects directly to Flask REST backend endpoints (/api/...).
 * Enforces real backend authorization tokens and proper error propagation.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('bl_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      data.error ||
      data.message ||
      `Request to ${endpoint} failed with status ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }

  return { data, status: response.status };
}
