import React, { useState, useEffect } from 'react';
import { productsApi } from '../../api/productsApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { formatCurrency } from '../../utils/formatters';
import { Plus, Package, Edit, Trash2, Layers, Check } from 'lucide-react';

export const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    product_type: 'SOFTWARE',
    sales_price: 99.00,
    cost_price: 20.00,
    description: '',
    notes: '',
    variants: [],
  });

  // Variant sub-form state inside product modal
  const [newVariant, setNewVariant] = useState({
    variant_name: '',
    sku: '',
    additional_price: 0,
  });

  const { addToast } = useToast();

  const loadProducts = async () => {
    try {
      const { data } = await productsApi.getProducts();
      setProducts(data);
    } catch (err) {
      addToast(err.message || 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      product_type: 'SOFTWARE',
      sales_price: 99.00,
      cost_price: 20.00,
      description: '',
      notes: '',
      variants: [],
    });
    setNewVariant({ variant_name: '', sku: '', additional_price: 0 });
    setModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      product_type: product.product_type,
      sales_price: product.sales_price,
      cost_price: product.cost_price,
      description: product.description || '',
      notes: product.notes || '',
      variants: [...(product.variants || [])],
    });
    setModalOpen(true);
  };

  const handleAddVariant = () => {
    if (!newVariant.variant_name.trim()) {
      addToast('Please enter a variant name', 'error');
      return;
    }
    setFormData({
      ...formData,
      variants: [
        ...formData.variants,
        {
          id: `v-temp-${Date.now()}`,
          variant_name: newVariant.variant_name.trim(),
          sku: newVariant.sku.trim() || null,
          additional_price: Number(newVariant.additional_price) || 0,
        },
      ],
    });
    setNewVariant({ variant_name: '', sku: '', additional_price: 0 });
  };

  const handleRemoveVariant = (index) => {
    setFormData({
      ...formData,
      variants: formData.variants.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast('Product name is required', 'error');
      return;
    }

    try {
      if (editingProduct) {
        await productsApi.updateProduct(editingProduct.id, formData);
        addToast('Product updated successfully', 'success');
      } else {
        await productsApi.createProduct(formData);
        addToast('Product created successfully', 'success');
      }
      setModalOpen(false);
      loadProducts();
    } catch (err) {
      addToast(err.message || 'Operation failed', 'error');
    }
  };

  const columns = [
    {
      header: 'Product Name',
      key: 'name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.name}</p>
            <p className="text-xs text-slate-400 truncate max-w-xs">{row.description || 'No description'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Type',
      key: 'product_type',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
          {row.product_type}
        </span>
      ),
    },
    {
      header: 'Sales Price',
      key: 'sales_price',
      sortable: true,
      render: (row) => <span className="font-semibold text-slate-900">{formatCurrency(row.sales_price)}</span>,
    },
    {
      header: 'Cost Price',
      key: 'cost_price',
      sortable: true,
      render: (row) => <span className="text-slate-500">{formatCurrency(row.cost_price)}</span>,
    },
    {
      header: 'Variants',
      key: 'variants',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.variants && row.variants.length > 0 ? (
            row.variants.map((v) => (
              <span
                key={v.id}
                className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200"
                title={`+${formatCurrency(v.additional_price)}`}
              >
                {v.variant_name} (+{formatCurrency(v.additional_price)})
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400">None (Base)</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'is_active',
      render: (row) => (
        <StatusBadge status={row.is_active ? 'ACTIVE' : 'CLOSED'} />
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => openEditModal(row)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Edit Product"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  if (loading) return <Loader message="Loading product catalog..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products & Catalog</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage software offerings, subscription add-ons, and pricing variants
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={products}
        searchKey="name"
        searchPlaceholder="Search products by title..."
      />

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Brightloop Cloud CRM"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Product Type</label>
              <select
                value={formData.product_type}
                onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="SOFTWARE">Software (SaaS)</option>
                <option value="SERVICE">Service (SLA / Consulting)</option>
                <option value="PHYSICAL">Physical Hardware</option>
                <option value="CONSUMABLE">Consumable License</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sales Price ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.sales_price}
                onChange={(e) => setFormData({ ...formData, sales_price: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cost Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows="2"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enterprise subscription features and capabilities..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Product Variants Sub-form */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Product Variants & Add-ons
              </span>
              <span className="text-[11px] text-slate-400">e.g. Starter, Pro, Enterprise</span>
            </div>

            {/* List of existing variants */}
            {formData.variants.length > 0 && (
              <div className="space-y-2">
                {formData.variants.map((v, i) => (
                  <div
                    key={v.id || i}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{v.variant_name}</span>
                      {v.sku && <span className="text-slate-400 ml-2">SKU: {v.sku}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-emerald-600">
                        +{formatCurrency(v.additional_price)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(i)}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new variant inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <input
                type="text"
                placeholder="Variant Name (e.g. Pro 25 Users)"
                value={newVariant.variant_name}
                onChange={(e) => setNewVariant({ ...newVariant, variant_name: e.target.value })}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="SKU (optional)"
                value={newVariant.sku}
                onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value })}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Extra $"
                  value={newVariant.additional_price}
                  onChange={(e) => setNewVariant({ ...newVariant, additional_price: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
