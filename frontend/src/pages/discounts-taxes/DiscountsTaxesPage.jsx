import React, { useState, useEffect } from 'react';
import { discountsApi } from '../../api/discountsApi';
import { productsApi } from '../../api/productsApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Plus, Percent, Tag, Power, ShieldAlert, Check } from 'lucide-react';

export const DiscountsTaxesPage = () => {
  const [activeTab, setActiveTab] = useState('discounts'); // 'discounts' | 'taxes'
  const [discounts, setDiscounts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Discount Modal State
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState({
    code: '',
    description: '',
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    scope: 'SUBSCRIPTION',
    min_purchase_amount: 0,
    min_quantity: 1,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    usage_limit: '',
    applicable_product_ids: [],
  });

  // Tax Modal State
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [taxForm, setTaxForm] = useState({
    name: '',
    rate_percentage: 18.0,
  });

  const { addToast } = useToast();

  const loadData = async () => {
    try {
      const [dRes, tRes, pRes] = await Promise.all([
        discountsApi.getDiscounts(),
        discountsApi.getTaxRates(),
        productsApi.getProducts(),
      ]);
      setDiscounts(dRes.data);
      setTaxes(tRes.data);
      setProducts(pRes.data);
    } catch (err) {
      addToast(err.message || 'Failed to load rules', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    if (!discountForm.code.trim()) {
      addToast('Coupon code is required', 'error');
      return;
    }

    try {
      await discountsApi.createDiscount({
        ...discountForm,
        usage_limit: discountForm.usage_limit ? Number(discountForm.usage_limit) : null,
      });
      addToast(`Discount coupon ${discountForm.code.toUpperCase()} created!`, 'success');
      setDiscountModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Creation failed', 'error');
    }
  };

  const handleCreateTax = async (e) => {
    e.preventDefault();
    if (!taxForm.name.trim()) {
      addToast('Tax name is required', 'error');
      return;
    }

    try {
      await discountsApi.createTaxRate(taxForm);
      addToast(`Tax rate ${taxForm.name} configured!`, 'success');
      setTaxModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Creation failed', 'error');
    }
  };

  const handleToggleDiscount = async (id) => {
    try {
      await discountsApi.toggleDiscountStatus(id);
      addToast('Discount status updated', 'info');
      loadData();
    } catch (err) {
      addToast(err.message || 'Update failed', 'error');
    }
  };

  const discountColumns = [
    {
      header: 'Coupon Code',
      key: 'code',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono font-bold text-slate-900 text-sm tracking-wide bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              {row.code}
            </span>
            <p className="text-xs text-slate-400 mt-1">{row.description || 'Promotional coupon'}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Benefit Value',
      key: 'discount_value',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-indigo-600 text-sm">
          {row.discount_type === 'PERCENTAGE'
            ? `${row.discount_value}% OFF`
            : `${formatCurrency(row.discount_value)} FLAT`}
        </span>
      ),
    },
    {
      header: 'Eligibility Criteria',
      key: 'min_purchase_amount',
      render: (row) => (
        <div className="text-xs text-slate-600">
          <p>Min Purchase: {formatCurrency(row.min_purchase_amount)}</p>
          <p className="text-[11px] text-slate-400">Min Qty: {row.min_quantity} item(s)</p>
        </div>
      ),
    },
    {
      header: 'Validity Period',
      key: 'start_date',
      render: (row) => (
        <span className="text-xs text-slate-600 font-medium">
          {formatDate(row.start_date)} → {row.end_date ? formatDate(row.end_date) : 'Ongoing'}
        </span>
      ),
    },
    {
      header: 'Usage Limits',
      key: 'times_used',
      render: (row) => (
        <span className="text-xs text-slate-700">
          {row.times_used} / {row.usage_limit ? `${row.usage_limit} limit` : 'Unlimited'}
        </span>
      ),
    },
    {
      header: 'Status',
      key: 'is_active',
      render: (row) => <StatusBadge status={row.is_active ? 'ACTIVE' : 'CLOSED'} />,
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <button
          onClick={() => handleToggleDiscount(row.id)}
          className={`p-1.5 rounded-lg transition-colors ml-auto ${
            row.is_active
              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
          }`}
          title={row.is_active ? 'Disable Coupon' : 'Enable Coupon'}
        >
          <Power className="w-4 h-4" />
        </button>
      ),
    },
  ];

  const taxColumns = [
    {
      header: 'Tax Authority / Name',
      key: 'name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Percent className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.name}</p>
            <p className="text-xs text-slate-400">System tax calculation rule</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Applied Rate %',
      key: 'rate_percentage',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-slate-900 text-sm">{row.rate_percentage}%</span>
      ),
    },
    {
      header: 'Status',
      key: 'is_active',
      render: (row) => <StatusBadge status={row.is_active ? 'ACTIVE' : 'CLOSED'} />,
    },
  ];

  if (loading) return <Loader message="Loading taxes & discount rules..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Discounts & Taxes</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure fiscal tax rates, percentage/fixed coupons, usage caps, and product eligibility
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'discounts' ? (
            <button
              onClick={() => setDiscountModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Coupon Code</span>
            </button>
          ) : (
            <button
              onClick={() => setTaxModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Tax Rate</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm">
        <button
          onClick={() => setActiveTab('discounts')}
          className={`pb-3 font-semibold transition-colors relative ${
            activeTab === 'discounts'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Discount Coupons ({discounts.length})
        </button>
        <button
          onClick={() => setActiveTab('taxes')}
          className={`pb-3 font-semibold transition-colors relative ${
            activeTab === 'taxes'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Tax Rates ({taxes.length})
        </button>
      </div>

      {/* Tables based on active tab */}
      {activeTab === 'discounts' ? (
        <DataTable
          columns={discountColumns}
          data={discounts}
          searchKey="code"
          searchPlaceholder="Search coupon by code..."
        />
      ) : (
        <DataTable
          columns={taxColumns}
          data={taxes}
          searchKey="name"
          searchPlaceholder="Search tax rate by name..."
        />
      )}

      {/* Create Discount Modal */}
      <Modal
        isOpen={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        title="Create Promotional Discount"
        maxWidth="max-w-xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDiscountModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateDiscount}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
            >
              Save Coupon Code
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateDiscount} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Coupon Code *</label>
              <input
                type="text"
                required
                value={discountForm.code}
                onChange={(e) => setDiscountForm({ ...discountForm, code: e.target.value.toUpperCase() })}
                placeholder="PROMO2026"
                className="w-full px-3 py-2 text-xs uppercase font-mono font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Discount Type</label>
              <select
                value={discountForm.discount_type}
                onChange={(e) => setDiscountForm({ ...discountForm, discount_type: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount ($)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Value ({discountForm.discount_type === 'PERCENTAGE' ? '%' : '$'}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={discountForm.discount_value}
                onChange={(e) => setDiscountForm({ ...discountForm, discount_value: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Usage Limit (Leave blank for unlimited)</label>
              <input
                type="number"
                min="1"
                value={discountForm.usage_limit}
                onChange={(e) => setDiscountForm({ ...discountForm, usage_limit: e.target.value })}
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Min Purchase ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discountForm.min_purchase_amount}
                onChange={(e) => setDiscountForm({ ...discountForm, min_purchase_amount: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Min Quantity</label>
              <input
                type="number"
                min="1"
                value={discountForm.min_quantity}
                onChange={(e) => setDiscountForm({ ...discountForm, min_quantity: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={discountForm.start_date}
                onChange={(e) => setDiscountForm({ ...discountForm, start_date: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date (Expiration)</label>
              <input
                type="date"
                value={discountForm.end_date}
                onChange={(e) => setDiscountForm({ ...discountForm, end_date: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Create Tax Rate Modal */}
      <Modal
        isOpen={taxModalOpen}
        onClose={() => setTaxModalOpen(false)}
        title="Configure Fiscal Tax Rate"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setTaxModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateTax}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
            >
              Add Tax Rate
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateTax} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tax Label *</label>
            <input
              type="text"
              required
              value={taxForm.name}
              onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
              placeholder="e.g. Standard GST 18%"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Rate Percentage (%) *</label>
            <input
              type="number"
              step="0.001"
              min="0"
              max="100"
              required
              value={taxForm.rate_percentage}
              onChange={(e) => setTaxForm({ ...taxForm, rate_percentage: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
