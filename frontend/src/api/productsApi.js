import { apiRequest, mockStore } from './client';

export const productsApi = {
  async getProducts() {
    return apiRequest('/products', { method: 'GET' }, async () => {
      return [...mockStore.products];
    });
  },

  async createProduct(productData) {
    return apiRequest(
      '/products',
      {
        method: 'POST',
        body: JSON.stringify(productData),
      },
      async () => {
        const newProduct = {
          id: `prod-${Date.now()}`,
          name: productData.name,
          product_type: productData.product_type || 'SOFTWARE',
          sales_price: Number(productData.sales_price) || 0,
          cost_price: Number(productData.cost_price) || 0,
          description: productData.description || '',
          notes: productData.notes || '',
          is_active: productData.is_active !== false,
          variants: (productData.variants || []).map((v, idx) => ({
            id: `v-${Date.now()}-${idx}`,
            product_id: `prod-${Date.now()}`,
            variant_name: v.variant_name,
            sku: v.sku || null,
            additional_price: Number(v.additional_price) || 0,
            is_active: true,
          })),
        };
        mockStore.products.unshift(newProduct);
        mockStore.persist('products');
        return newProduct;
      }
    );
  },

  async updateProduct(id, productData) {
    return apiRequest(
      `/products/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(productData),
      },
      async () => {
        const idx = mockStore.products.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error('Product not found');
        mockStore.products[idx] = {
          ...mockStore.products[idx],
          ...productData,
          sales_price: Number(productData.sales_price ?? mockStore.products[idx].sales_price),
          cost_price: Number(productData.cost_price ?? mockStore.products[idx].cost_price),
        };
        mockStore.persist('products');
        return mockStore.products[idx];
      }
    );
  },

  async deleteProduct(id) {
    return apiRequest(
      `/products/${id}`,
      { method: 'DELETE' },
      async () => {
        const idx = mockStore.products.findIndex((p) => p.id === id);
        if (idx !== -1) {
          mockStore.products[idx].is_active = false;
          mockStore.persist('products');
        }
        return { message: 'Product deactivated successfully' };
      }
    );
  },
};
