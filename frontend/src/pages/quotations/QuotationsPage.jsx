import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quotationsApi } from '../../api/quotationsApi';
import { productsApi } from '../../api/productsApi';
import { plansApi } from '../../api/plansApi';
import { usersApi } from '../../api/usersApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Plus, FileText, ArrowRight, Trash2, Layers, CheckCircle } from 'lucide-react';

export const QuotationsPage = () => {
  const [quotations, setQuotations] = useState([]);
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Builder Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    plan_id: '',
    default_validity_days: 30,
    terms_and_conditions: 'Payment due within 30 days of invoice date. Software licensed per terms of service.',
    customer_id: '',
    items: [],
  });

  // Convert Modal State
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [converting, setConverting] = useState(false);

  const { addToast } = useToast();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [qRes, pRes, plRes, cRes] = await Promise.all([
        quotationsApi.getQuotations(),
        productsApi.getProducts(),
        plansApi.getPlans(),
        usersApi.getCustomers(),
      ]);
      setQuotations(qRes.data);
      setProducts(pRes.data);
      setPlans(plRes.data);
      setCustomers(cRes.data);
    } catch (err) {
      addToast(err.message || 'Failed to load quotations catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      plan_id: plans[0]?.id || '',
      default_validity_days: 30,
      terms_and_conditions: 'Payment due within 30 days of invoice date.',
      customer_id: customers[0]?.id || '',
      items: products[0]
        ? [
            {
              product_id: products[0].id,
              product_name: products[0].name,
              variant_id: products[0].variants[0]?.id || null,
              variant_name: products[0].variants[0]?.variant_name || null,
              quantity: 1,
              unit_price: products[0].sales_price,
              additional_price: products[0].variants[0]?.additional_price || 0,
            },
          ]
        : [],
    });
    setModalOpen(true);
  };

  const handleAddItem = () => {
    if (products.length === 0) return;
    const prod = products[0];
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          product_id: prod.id,
          product_name: prod.name,
          variant_id: prod.variants[0]?.id || null,
          variant_name: prod.variants[0]?.variant_name || null,
          quantity: 1,
          unit_price: prod.sales_price,
          additional_price: prod.variants[0]?.additional_price || 0,
        },
      ],
    });
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...formData.items];
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        updated[index].product_id = prod.id;
        updated[index].product_name = prod.name;
        updated[index].unit_price = prod.sales_price;
        updated[index].variant_id = prod.variants[0]?.id || null;
        updated[index].variant_name = prod.variants[0]?.variant_name || null;
        updated[index].additional_price = prod.variants[0]?.additional_price || 0;
      }
    } else if (field === 'variant_id') {
      const prod = products.find((p) => p.id === updated[index].product_id);
      const variant = prod?.variants?.find((v) => v.id === value);
      updated[index].variant_id = variant ? variant.id : null;
      updated[index].variant_name = variant ? variant.variant_name : null;
      updated[index].additional_price = variant ? variant.additional_price : 0;
    } else {
      updated[index][field] = value;
    }
    setFormData({ ...formData, items: updated });
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, it) => {
      const unit = Number(it.unit_price) || 0;
      const add = Number(it.additional_price) || 0;
      const qty = Number(it.quantity) || 1;
      return sum + (unit + add) * qty;
    }, 0);
  };

  const handleCreateQuotation = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast('Quotation name is required', 'error');
      return;
    }
    if (formData.items.length === 0) {
      addToast('At least one product item is required', 'error');
      return;
    }

    try {
      const payload = {
        ...formData,
        total_estimated: calculateSubtotal(),
      };
      await quotationsApi.createQuotation(payload);
      addToast('Quotation template created successfully', 'success');
      setModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to save quotation', 'error');
    }
  };

  const openConvertModal = (quot) => {
    setSelectedQuotation(quot);
    setSelectedCustomerId(quot.customer_id || customers[0]?.id || '');
    setConvertModalOpen(true);
  };

  const handleConvert = async () => {
    if (!selectedQuotation || !selectedCustomerId) {
      addToast('Please select a customer for this subscription', 'error');
      return;
    }
    setConverting(true);
    try {
      const { data: newSub } = await quotationsApi.convertToSubscription(
        selectedQuotation.id,
        selectedCustomerId
      );
      addToast(`Quotation converted into Subscription ${newSub.subscription_number}!`, 'success');
      setConvertModalOpen(false);
      navigate('/subscriptions');
    } catch (err) {
      addToast(err.message || 'Conversion failed', 'error');
    } finally {
      setConverting(false);
    }
  };

  const columns = [
    {
      header: 'Quotation Package',
      key: 'name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.name}</p>
            <p className="text-xs text-slate-400">{row.plan_name || 'Associated Plan'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Validity',
      key: 'default_validity_days',
      render: (row) => (
        <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md font-medium">
          {row.default_validity_days} Days
        </span>
      ),
    },
    {
      header: 'Items Included',
      key: 'items',
      render: (row) => (
        <div className="text-xs text-slate-700">
          {(row.items || []).map((it, i) => (
            <div key={it.id || i}>
              {it.quantity}x {it.product_name} {it.variant_name ? `(${it.variant_name})` : ''}
            </div>
          ))}
        </div>
      ),
    },
    {
      header: 'Est. Total',
      key: 'total_estimated',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-slate-900">
          {formatCurrency(
            row.total_estimated ||
              (row.items || []).reduce((acc, it) => acc + (it.line_total || 0), 0)
          )}
        </span>
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <button
          onClick={() => openConvertModal(row)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200 transition-colors"
          title="Convert directly to confirmed subscription"
        >
          <span>Convert to Sub</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  if (loading) return <Loader message="Loading quotations & pricing templates..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quotations & Proposals</h1>
          <p className="text-xs text-slate-500 mt-1">
            Build reusable proposal packages with line items and convert directly into subscriptions
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Quotation Template</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={quotations}
        searchKey="name"
        searchPlaceholder="Search quotations..."
      />

      {/* Quotation Builder Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Quotation Package Builder"
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-left">
              <span className="text-xs text-slate-400 block">Calculated Total:</span>
              <span className="text-base font-bold text-slate-900">
                {formatCurrency(calculateSubtotal())}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateQuotation}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
              >
                Save Quotation Template
              </button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateQuotation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Package Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enterprise CRM + SLA Bundle"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Subscription Plan</label>
              <select
                value={formData.plan_id}
                onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.billing_interval})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Validity (Days)</label>
              <input
                type="number"
                min="1"
                value={formData.default_validity_days}
                onChange={(e) => setFormData({ ...formData, default_validity_days: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Default Customer (Optional)</label>
              <select
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">-- Generic Template (Any Customer) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.company_name || c.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Line Items List */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Line Items & Software Products
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Product
              </button>
            </div>

            <div className="space-y-2">
              {formData.items.map((it, idx) => {
                const currentProd = products.find((p) => p.id === it.product_id);
                const hasVariants = currentProd?.variants && currentProd.variants.length > 0;

                return (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs"
                  >
                    {/* Select Product */}
                    <select
                      value={it.product_id}
                      onChange={(e) => handleUpdateItem(idx, 'product_id', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${p.sales_price})
                        </option>
                      ))}
                    </select>

                    {/* Select Variant if available */}
                    {hasVariants && (
                      <select
                        value={it.variant_id || ''}
                        onChange={(e) => handleUpdateItem(idx, 'variant_id', e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg flex-1"
                      >
                        {currentProd.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.variant_name} (+${v.additional_price})
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Qty */}
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-400">Qty:</span>
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                        className="w-14 px-2 py-1.5 border border-slate-300 rounded-lg text-center"
                      />
                    </div>

                    {/* Line Total */}
                    <span className="font-semibold text-slate-800 sm:w-20 text-right">
                      {formatCurrency(
                        ((Number(it.unit_price) || 0) + (Number(it.additional_price) || 0)) *
                          (Number(it.quantity) || 1)
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      {/* Convert to Subscription Modal */}
      <Modal
        isOpen={convertModalOpen}
        onClose={() => setConvertModalOpen(false)}
        title="Convert Quotation to Subscription"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConvertModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConvert}
              disabled={converting}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs flex items-center gap-2"
            >
              {converting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <span>Confirm Conversion</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Converting <strong>{selectedQuotation?.name}</strong> will create a new subscription in <strong>CONFIRMED</strong> state, lock in line item pricing, and ready it for billing activation.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Select Customer Account *</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.company_name || c.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};
