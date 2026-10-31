import React, { useState, useEffect } from 'react';
import { plansApi } from '../../api/plansApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Plus, CalendarDays, Edit, Power, Check, Clock } from 'lucide-react';

export const PlansPage = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    billing_interval: 'MONTHLY',
    interval_count: 1,
    minimum_quantity: 1,
    base_price: 99.00,
    available_from: new Date().toISOString().split('T')[0],
    available_to: '',
    auto_close: false,
    auto_close_days: 0,
  });

  const { addToast } = useToast();

  const loadPlans = async () => {
    try {
      const { data } = await plansApi.getPlans();
      setPlans(data);
    } catch (err) {
      addToast(err.message || 'Failed to load plans', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      billing_interval: 'MONTHLY',
      interval_count: 1,
      minimum_quantity: 1,
      base_price: 99.00,
      available_from: new Date().toISOString().split('T')[0],
      available_to: '',
      auto_close: false,
      auto_close_days: 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      billing_interval: plan.billing_interval,
      interval_count: plan.interval_count || 1,
      minimum_quantity: plan.minimum_quantity || 1,
      base_price: plan.base_price,
      available_from: plan.available_from || '',
      available_to: plan.available_to || '',
      auto_close: Boolean(plan.auto_close),
      auto_close_days: plan.auto_close_days || 0,
    });
    setModalOpen(true);
  };

  const handleToggleStatus = async (id) => {
    try {
      await plansApi.togglePlanStatus(id);
      addToast('Plan status updated', 'info');
      loadPlans();
    } catch (err) {
      addToast(err.message || 'Status update failed', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast('Plan name is required', 'error');
      return;
    }

    try {
      if (editingPlan) {
        await plansApi.updatePlan(editingPlan.id, formData);
        addToast('Subscription plan updated', 'success');
      } else {
        await plansApi.createPlan(formData);
        addToast('Subscription plan created', 'success');
      }
      setModalOpen(false);
      loadPlans();
    } catch (err) {
      addToast(err.message || 'Plan operation failed', 'error');
    }
  };

  const columns = [
    {
      header: 'Plan Name',
      key: 'name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.name}</p>
            <p className="text-xs text-slate-400">
              {row.interval_count > 1 ? `Every ${row.interval_count} ` : 'Every '}
              {row.billing_interval.toLowerCase()}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'Billing Interval',
      key: 'billing_interval',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md">
          {row.billing_interval} {row.interval_count > 1 ? `(x${row.interval_count})` : ''}
        </span>
      ),
    },
    {
      header: 'Base Price',
      key: 'base_price',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-slate-900">{formatCurrency(row.base_price)}</span>
      ),
    },
    {
      header: 'Min Qty',
      key: 'minimum_quantity',
      render: (row) => <span className="text-slate-600">{row.minimum_quantity} license(s)</span>,
    },
    {
      header: 'Auto Close',
      key: 'auto_close',
      render: (row) =>
        row.auto_close ? (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium border border-amber-200">
            Yes ({row.auto_close_days} days)
          </span>
        ) : (
          <span className="text-xs text-slate-400">Continuous</span>
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
            title="Edit Plan"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggleStatus(row.id)}
            className={`p-1.5 rounded-lg transition-colors ${
              row.is_active
                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
            }`}
            title={row.is_active ? 'Deactivate Plan' : 'Activate Plan'}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  if (loading) return <Loader message="Loading subscription plans..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscription Plans</h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure recurring cadences (Daily, Weekly, Monthly, Yearly), terms, and auto-closing policies
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Plan</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={plans}
        searchKey="name"
        searchPlaceholder="Search plans by name..."
      />

      {/* Plan Form Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPlan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
        maxWidth="max-w-xl"
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
              {editingPlan ? 'Save Plan' : 'Create Plan'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Plan Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enterprise Growth Quarterly"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Billing Interval</label>
              <select
                value={formData.billing_interval}
                onChange={(e) => setFormData({ ...formData, billing_interval: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Interval Count (e.g. 3 for Quarterly)
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.interval_count}
                onChange={(e) => setFormData({ ...formData, interval_count: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Base Price ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.base_price}
                onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Minimum Quantity</label>
              <input
                type="number"
                min="1"
                required
                value={formData.minimum_quantity}
                onChange={(e) => setFormData({ ...formData, minimum_quantity: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Auto Close Setting */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800">Auto-Close Plan Policy</p>
                <p className="text-[11px] text-slate-400">
                  Automatically expire and transition subscriptions to CLOSED after term
                </p>
              </div>
              <input
                type="checkbox"
                checked={formData.auto_close}
                onChange={(e) => setFormData({ ...formData, auto_close: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300"
              />
            </div>

            {formData.auto_close && (
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Term Duration in Days (e.g. 365)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.auto_close_days}
                  onChange={(e) => setFormData({ ...formData, auto_close_days: e.target.value })}
                  placeholder="365"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
};
