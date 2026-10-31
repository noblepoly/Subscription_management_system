import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quotationsApi } from '../../api/quotationsApi';
import { productsApi } from '../../api/productsApi';
import { plansApi } from '../../api/plansApi';
import { usersApi } from '../../api/usersApi';
import { discountsApi } from '../../api/discountsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Plus,
  FileText,
  ArrowRight,
  Trash2,
  Layers,
  Edit,
  Eye,
  Calculator,
  Percent,
} from 'lucide-react';

export const QuotationsPage = () => {
  const [quotations, setQuotations] = useState([]);
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Builder Modal State (Create or Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuotationId, setEditingQuotationId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    plan_id: '',
    default_validity_days: 30,
    terms_and_conditions: 'Standard 30-day payment terms.',
    tax_rate_percentage: 18.0,
    discount_value: 0,
    discount_type: 'PERCENTAGE', // PERCENTAGE or FIXED
    items: [],
  });

  // Convert to Subscription Modal State
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [converting, setConverting] = useState(false);

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [activeQuotation, setActiveQuotation] = useState(null);

  const { isStaffOrAdmin, isCustomer } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, pRes, plRes, cRes, tRes, dRes] = await Promise.all([
        quotationsApi.getQuotations(),
        productsApi.getProducts(),
        plansApi.getPlans(),
        isStaffOrAdmin ? usersApi.getCustomers() : Promise.resolve({ data: [] }),
        discountsApi.getTaxRates(),
        discountsApi.getDiscounts(),
      ]);
      setQuotations(qRes.data || []);
      setProducts(pRes.data || []);
      setPlans(plRes.data || []);
      setCustomers(cRes.data || []);
      setTaxRates(tRes.data || []);
      setDiscounts(dRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load quotations catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingQuotationId(null);
    const defaultTax = taxRates[0]?.rate_percentage ?? 18.0;
    setFormData({
      name: '',
      description: '',
      plan_id: plans[0]?.id || '',
      default_validity_days: 30,
      terms_and_conditions: 'Payment due within 30 days. Software licensed under enterprise terms.',
      tax_rate_percentage: defaultTax,
      discount_value: 0,
      discount_type: 'PERCENTAGE',
      items: products[0]
        ? [
            {
              product_id: products[0].id,
              product_name: products[0].name,
              variant_id: products[0].variants?.[0]?.id || null,
              variant_name: products[0].variants?.[0]?.variant_name || null,
              quantity: 1,
              unit_price: products[0].sales_price,
              override_unit_price: products[0].sales_price,
              additional_price: products[0].variants?.[0]?.additional_price || 0,
            },
          ]
        : [],
    });
    setModalOpen(true);
  };

  const openEditModal = (quot) => {
    setEditingQuotationId(quot.id);
    setFormData({
      name: quot.name || '',
      description: quot.description || '',
      plan_id: quot.plan_id || plans[0]?.id || '',
      default_validity_days: quot.default_validity_days || 30,
      terms_and_conditions: quot.terms_and_conditions || '',
      tax_rate_percentage: 18.0,
      discount_value: 0,
      discount_type: 'PERCENTAGE',
      items: (quot.items || []).map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name || 'Software License',
        variant_id: it.variant_id || null,
        variant_name: it.variant_name || null,
        quantity: it.quantity || 1,
        unit_price: it.override_unit_price ?? it.unit_price ?? 0,
        override_unit_price: it.override_unit_price ?? it.unit_price ?? 0,
        additional_price: it.additional_price || 0,
      })),
    });
    setModalOpen(true);
  };

  const handleAddItem = () => {
    if (products.length === 0) return;
    const prod = products[0];
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: prod.id,
          product_name: prod.name,
          variant_id: prod.variants?.[0]?.id || null,
          variant_name: prod.variants?.[0]?.variant_name || null,
          quantity: 1,
          unit_price: prod.sales_price,
          override_unit_price: prod.sales_price,
          additional_price: prod.variants?.[0]?.additional_price || 0,
        },
      ],
    }));
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...formData.items];
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        updated[index].product_id = prod.id;
        updated[index].product_name = prod.name;
        updated[index].unit_price = prod.sales_price;
        updated[index].override_unit_price = prod.sales_price;
        updated[index].variant_id = prod.variants?.[0]?.id || null;
        updated[index].variant_name = prod.variants?.[0]?.variant_name || null;
        updated[index].additional_price = prod.variants?.[0]?.additional_price || 0;
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
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Live financial computation: Subtotal, Discount, Tax, Total
  const financialTotals = React.useMemo(() => {
    const subtotal = formData.items.reduce((sum, it) => {
      const price = Number(it.override_unit_price ?? it.unit_price) || 0;
      const add = Number(it.additional_price) || 0;
      const qty = Number(it.quantity) || 1;
      return sum + (price + add) * qty;
    }, 0);

    let discountAmount = 0;
    const discVal = Number(formData.discount_value) || 0;
    if (formData.discount_type === 'PERCENTAGE') {
      discountAmount = (subtotal * discVal) / 100;
    } else {
      discountAmount = Math.min(subtotal, discVal);
    }

    const taxableBase = Math.max(0, subtotal - discountAmount);
    const taxRate = Number(formData.tax_rate_percentage) || 0;
    const taxAmount = (taxableBase * taxRate) / 100;
    const total = taxableBase + taxAmount;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      taxableBase: Number(taxableBase.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }, [formData]);

  const handleSaveQuotation = async (e) => {
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
      if (editingQuotationId) {
        await quotationsApi.updateQuotation(editingQuotationId, formData);
        addToast('Quotation updated successfully', 'success');
      } else {
        await quotationsApi.createQuotation(formData);
        addToast('Quotation created successfully', 'success');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to save quotation', 'error');
    }
  };

  const openConvertModal = (quot) => {
    setSelectedQuotation(quot);
    setSelectedCustomerId(customers[0]?.id || '');
    setConvertModalOpen(true);
  };

  const handleConvert = async () => {
    if (!selectedQuotation || !selectedCustomerId) {
      addToast('Please select a customer for this subscription', 'error');
      return;
    }
    setConverting(true);
    try {
      const newSub = await quotationsApi.convertToSubscription(
        selectedQuotation.id,
        selectedCustomerId
      );
      addToast(`Quotation converted into Subscription ${newSub.subscription_number || ''}!`, 'success');
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
            <p className="text-xs text-slate-400">{row.plan?.name || 'Associated Plan'}</p>
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
      header: 'Status',
      key: 'is_active',
      render: (row) => (
        <StatusBadge status={row.is_active ? 'QUOTATION' : 'CLOSED'} />
      ),
    },
    {
      header: 'Items Included',
      key: 'items',
      render: (row) => (
        <div className="text-xs text-slate-700 space-y-0.5">
          {(row.items || []).map((it, i) => (
            <div key={it.id || i} className="truncate max-w-[200px]">
              {it.quantity}x {it.product_name || 'Item'} {it.variant_name ? `(${it.variant_name})` : ''}
            </div>
          ))}
        </div>
      ),
    },
    {
      header: 'Est. Total',
      key: 'total',
      render: (row) => {
        const estTotal = (row.items || []).reduce((acc, it) => {
          const price = Number(it.override_unit_price ?? it.unit_price) || 0;
          return acc + price * (it.quantity || 1);
        }, 0);
        return <span className="font-bold text-slate-900">{formatCurrency(estTotal)}</span>;
      },
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => {
              setActiveQuotation(row);
              setDetailModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Inspect Quotation"
          >
            <Eye className="w-4 h-4" />
          </button>

          {isStaffOrAdmin && (
            <>
              <button
                onClick={() => openEditModal(row)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Edit Quotation"
              >
                <Edit className="w-4 h-4" />
              </button>

              <button
                onClick={() => openConvertModal(row)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200 transition-colors"
                title="Convert directly to confirmed subscription"
              >
                <span>Convert</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <Loader message="Connecting to quotation registry..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quotations & Proposals</h1>
          <p className="text-xs text-slate-500 mt-1">
            Build and edit custom quotation packages with line items, tax and discount schedules, and convert to active subscriptions
          </p>
        </div>

        {isStaffOrAdmin && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Quotation</span>
          </button>
        )}
      </div>

      {quotations.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Quotations Created"
          message="Create a quotation template to bundle software products and subscription plans for customer proposals."
          action={
            isStaffOrAdmin ? (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs hover:bg-indigo-500"
              >
                Create First Quotation
              </button>
            ) : null
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={quotations}
          searchKey="name"
          searchPlaceholder="Search quotations by name..."
        />
      )}

      {/* Quotation Builder Modal (Create & Edit) */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingQuotationId ? 'Edit Quotation Template' : 'New Quotation Template'}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-left text-xs">
              <span className="text-slate-400 block text-[10px]">Estimated Recurring Total:</span>
              <span className="text-base font-bold text-indigo-600">
                {formatCurrency(financialTotals.total)}
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
                onClick={handleSaveQuotation}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
              >
                {editingQuotationId ? 'Update Quotation' : 'Save Quotation Template'}
              </button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveQuotation} className="space-y-4">
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
                <option value="">-- Select Subscription Plan --</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.billing_interval}) - Base {formatCurrency(p.base_price)}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Description / Notes</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Proposal details..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Line Items Builder */}
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
                          {p.name} ({formatCurrency(p.sales_price)})
                        </option>
                      ))}
                    </select>

                    {/* Select Variant */}
                    {hasVariants && (
                      <select
                        value={it.variant_id || ''}
                        onChange={(e) => handleUpdateItem(idx, 'variant_id', e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg flex-1"
                      >
                        <option value="">Base Variant (+$0)</option>
                        {currentProd.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.variant_name} (+{formatCurrency(v.additional_price)})
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Override Unit Price */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">Unit $:</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={it.override_unit_price}
                        onChange={(e) => handleUpdateItem(idx, 'override_unit_price', e.target.value)}
                        className="w-16 px-1.5 py-1 border border-slate-300 rounded-lg text-right"
                      />
                    </div>

                    {/* Qty */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">Qty:</span>
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                        className="w-12 px-1.5 py-1 border border-slate-300 rounded-lg text-center"
                      />
                    </div>

                    {/* Line Total */}
                    <span className="font-semibold text-slate-800 sm:w-20 text-right">
                      {formatCurrency(
                        ((Number(it.override_unit_price) || 0) + (Number(it.additional_price) || 0)) *
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

          {/* Tax, Discount, and Financial Breakdown Summary */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-indigo-600" />
              Tax, Discount & Financial Breakdown
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Tax Schedule (% GST / VAT)
                </label>
                <select
                  value={formData.tax_rate_percentage}
                  onChange={(e) => setFormData({ ...formData, tax_rate_percentage: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="0">Zero Tax (0%)</option>
                  <option value="10">Standard VAT (10%)</option>
                  <option value="18">GST (18%)</option>
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.rate_percentage}>
                      {t.name} ({t.rate_percentage}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Discount Value ({formData.discount_type === 'PERCENTAGE' ? '%' : '$'})
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                  <select
                    value={formData.discount_type}
                    onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                    className="px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="PERCENTAGE">%</option>
                    <option value="FIXED">$</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="pt-2 border-t border-slate-200 text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-medium text-slate-800">{formatCurrency(financialTotals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Discount Deduction:</span>
                <span>-{formatCurrency(financialTotals.discountAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxable Base:</span>
                <span>{formatCurrency(financialTotals.taxableBase)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax Amount ({formData.tax_rate_percentage}%):</span>
                <span>+{formatCurrency(financialTotals.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-slate-200">
                <span>Estimated Total:</span>
                <span className="text-indigo-600">{formatCurrency(financialTotals.total)}</span>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Convert to Subscription Modal */}
      <Modal
        isOpen={convertModalOpen}
        onClose={() => setConvertModalOpen(false)}
        title="Convert Quotation to Confirmed Subscription"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConvertModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
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
              <span>Convert to Subscription</span>
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Converting <strong>{selectedQuotation?.name}</strong> will create a new subscription in <strong>CONFIRMED</strong> state, lock in line item pricing snapshots, and prepare it for recurring billing.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Assign to Customer *</label>
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

      {/* Inspect Detail Modal */}
      {activeQuotation && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Quotation Details: ${activeQuotation.name}`}
          maxWidth="max-w-xl"
          footer={
            <button
              type="button"
              onClick={() => setDetailModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Close
            </button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Validity:</span>
                <span className="font-semibold text-slate-800">{activeQuotation.default_validity_days} Days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Plan:</span>
                <span className="font-semibold text-slate-800">{activeQuotation.plan?.name || 'Associated Plan'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created:</span>
                <span>{formatDate(activeQuotation.created_at)}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-800 mb-2">Line Items</h4>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {(activeQuotation.items || []).map((it, idx) => (
                  <div key={idx} className="p-2.5 flex justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{it.product_name || 'Software Product'}</p>
                      {it.variant_name && <p className="text-[10px] text-slate-400">Variant: {it.variant_name}</p>}
                    </div>
                    <span className="font-bold text-slate-900">
                      {it.quantity}x @ {formatCurrency(it.override_unit_price ?? it.unit_price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {activeQuotation.terms_and_conditions && (
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <span className="font-semibold text-slate-700 block mb-1">Terms & Conditions:</span>
                <p className="text-slate-500 leading-relaxed">{activeQuotation.terms_and_conditions}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
