import { apiRequest } from './client';

export const productsApi = {
  async getProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.product_type) query.append('product_type', params.product_type);
    if (params.include_inactive) query.append('include_inactive', 'true');

    const qs = query.toString() ? `?${query.toString()}` : '';
    const { data } = await apiRequest(`/products${qs}`, { method: 'GET' });
    const list = data.products || data.data?.products || (Array.isArray(data) ? data : []);
    return { data: list };
  },

  async getProductById(id) {
    const { data } = await apiRequest(`/products/${id}`, { method: 'GET' });
    return data.product || data.data?.product || data;
  },

  async createProduct(productData) {
    const payload = {
      name: productData.name.trim(),
      product_type: productData.product_type || 'SOFTWARE',
      sales_price: Number(productData.sales_price) || 0,
      cost_price: Number(productData.cost_price) || 0,
      description: productData.description || null,
      notes: productData.notes || null,
      variants: (productData.variants || []).map((v) => ({
        variant_name: v.variant_name.trim(),
        sku: v.sku ? v.sku.trim() : null,
        additional_price: Number(v.additional_price) || 0,
      })),
    };

    const { data } = await apiRequest('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.product || data.data?.product || data;
  },

  async updateProduct(id, productData) {
    const payload = {
      name: productData.name?.trim(),
      product_type: productData.product_type,
      sales_price: productData.sales_price !== undefined ? Number(productData.sales_price) : undefined,
      cost_price: productData.cost_price !== undefined ? Number(productData.cost_price) : undefined,
      description: productData.description || null,
      notes: productData.notes || null,
      is_active: productData.is_active,
    };

    const { data } = await apiRequest(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return data.product || data.data?.product || data;
  },

  async deleteProduct(id) {
    const { data } = await apiRequest(`/products/${id}`, { method: 'DELETE' });
    return data;
  },
};
