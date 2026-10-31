import React, { useState, useEffect } from 'react';
import { subscriptionsApi } from '../../api/subscriptionsApi';
import { plansApi } from '../../api/plansApi';
import { usersApi } from '../../api/usersApi';
import { productsApi } from '../../api/productsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Plus,
  Repeat,
  Play,
  Pause,
  XCircle,
  RefreshCw,
  Eye,
  Trash2,
  Layers,
  Calendar,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

export const SubscriptionsPage = () => {
  const { user, isStaffOrAdmin } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState(null);

  // Lifecycle Action State
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState({ sub: null, action: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [closureReason, setClosureReason] = useState('');

  // Create Subscription Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSubData, setNewSubData] = useState({
    customer_id: '',
    plan_id: '',
    items: [],
    notes: '',
  });

  const { addToast } = useToast();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isStaffOrAdmin) {
        const [sRes, pRes, cRes, prRes] = await Promise.all([
          subscriptionsApi.getSubscriptions(),
          plansApi.getPlans(),
          usersApi.getCustomers(),
          productsApi.getProducts(),
        ]);
        setSubscriptions(sRes.data);
        setPlans(pRes.data);
        setCustomers(cRes.data);
        setProducts(prRes.data);
      } else {
        // Customer view: only load their subscriptions
        const sRes = await subscriptionsApi.getSubscriptions();
        setSubscriptions(sRes.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load subscription data');
      addToast(err.message || 'Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.role]);

  const openActionDialog = (sub, action) => {
    setActionTarget({ sub, action });
    setClosureReason('');
    setConfirmDialogOpen(true);
  };

  const executeLifecycleAction = async () => {
    const { sub, action } = actionTarget;
    if (!sub || !action) return;

    setActionLoading(true);
    try {
      await subscriptionsApi.updateSubscriptionStatus(sub.id, action, {
        closure_reason: closureReason || `Manual ${action} action executed`,
      });
      addToast(`Subscription ${sub.subscription_number} status updated to ${action}`, 'success');
      setConfirmDialogOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openCreateModal = () => {
    const defaultPlan = plans[0];
    const defaultCust = customers[0];
    const defaultProd = products[0];

    const initialItem = defaultProd
      ? {
          product_id: defaultProd.id,
          product_name: defaultProd.name,
          variant_id: defaultProd.variants?.[0]?.id || '',
          variant_name: defaultProd.variants?.[0]?.variant_name || '',
          quantity: 1,
          unit_price: Number(defaultProd.sales_price) || 0,
          additional_price: Number(defaultProd.variants?.[0]?.additional_price) || 0,
        }
      : null;

    setNewSubData({
      customer_id: defaultCust?.id || '',
      plan_id: defaultPlan?.id || '',
      notes: '',
      items: initialItem ? [initialItem] : [],
    });
    setCreateModalOpen(true);
  };

  const handleAddItem = () => {
    const defaultProd = products[0];
    if (!defaultProd) return;

    setNewSubData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: defaultProd.id,
          product_name: defaultProd.name,
          variant_id: defaultProd.variants?.[0]?.id || '',
          variant_name: defaultProd.variants?.[0]?.variant_name || '',
          quantity: 1,
          unit_price: Number(defaultProd.sales_price) || 0,
          additional_price: Number(defaultProd.variants?.[0]?.additional_price) || 0,
        },
      ],
    }));
  };

  const handleRemoveItem = (index) => {
    setNewSubData((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const handleItemChange = (index, field, value) => {
    setNewSubData((prev) => {
      const updated = [...prev.items];
      const item = { ...updated[index] };

      if (field === 'product_id') {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          item.product_id = prod.id;
          item.product_name = prod.name;
          item.variant_id = prod.variants?.[0]?.id || '';
          item.variant_name = prod.variants?.[0]?.variant_name || '';
          item.unit_price = Number(prod.sales_price) || 0;
          item.additional_price = Number(prod.variants?.[0]?.additional_price) || 0;
        }
      } else if (field === 'variant_id') {
        const prod = products.find((p) => p.id === item.product_id);
        const variant = prod?.variants?.find((v) => v.id === value);
        item.variant_id = value || '';
        item.variant_name = variant?.variant_name || '';
        item.additional_price = Number(variant?.additional_price) || 0;
      } else if (field === 'quantity') {
        item.quantity = Math.max(1, parseInt(value, 10) || 1);
      } else if (field === 'unit_price') {
        item.unit_price = Math.max(0, parseFloat(value) || 0);
      }

      updated[index] = item;
      return { ...prev, items: updated };
    });
  };

  const handleCreateSubscription = async (e) => {
    e.preventDefault();
    if (!newSubData.customer_id) {
      addToast('Customer selection is required', 'error');
      return;
    }
    if (!newSubData.plan_id) {
      addToast('Plan selection is required', 'error');
      return;
    }
    if (newSubData.items.length === 0) {
      addToast('At least one item is required', 'error');
      return;
    }

    setCreating(true);
    try {
      await subscriptionsApi.createSubscription({
        customer_id: newSubData.customer_id,
        plan_id: newSubData.plan_id,
        notes: newSubData.notes,
        status: 'CONFIRMED',
        items: newSubData.items,
      });
      addToast('Subscription created and confirmed successfully', 'success');
      setCreateModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Creation failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  const subtotalEstimate = newSubData.items.reduce(
    (acc, it) => acc + (Number(it.unit_price) + Number(it.additional_price || 0)) * (Number(it.quantity) || 1),
    0
  );

  const filterOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'Paused', value: 'PAUSED' },
    { label: 'Closed', value: 'CLOSED' },
    { label: 'Cancelled', value: 'CANCELLED' },
    { label: 'Draft', value: 'DRAFT' },
  ];

  const columns = [
    {
      header: 'Subscription #',
      key: 'subscription_number',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.subscription_number}</p>
            {isStaffOrAdmin && <p className="text-xs text-slate-400">{row.customer_name || 'Customer'}</p>}
          </div>
        </div>
      ),
    },
    {
      header: 'Plan & Cycle',
      key: 'plan_name',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-800 text-xs">{row.plan_name}</p>
          <span className="text-[11px] text-slate-400">
            {row.billing_interval} {row.interval_count > 1 ? `(x${row.interval_count})` : ''}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Next Billing',
      key: 'next_billing_date',
      sortable: true,
      render: (row) => (
        <div className="text-xs">
          <p className="text-slate-700 font-medium">{formatDate(row.next_billing_date)}</p>
          {row.last_billed_date && (
            <p className="text-[10px] text-slate-400">Last: {formatDate(row.last_billed_date)}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Recurring Total',
      key: 'recurring_total',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-slate-900">{formatCurrency(row.recurring_total)}</span>
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {/* Detail View */}
          <button
            onClick={() => {
              setSelectedSub(row);
              setDetailModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>

          {isStaffOrAdmin && (
            <>
              {/* Transition: CONFIRMED or DRAFT -> ACTIVATE */}
              {(row.status === 'CONFIRMED' || row.status === 'DRAFT') && (
                <button
                  onClick={() => openActionDialog(row, 'ACTIVATE')}
                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="Activate Subscription"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Activate</span>
                </button>
              )}

              {/* Transition: ACTIVE -> PAUSE */}
              {row.status === 'ACTIVE' && (
                <button
                  onClick={() => openActionDialog(row, 'PAUSE')}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  title="Pause Subscription"
                >
                  <Pause className="w-4 h-4" />
                </button>
              )}

              {/* Transition: PAUSED -> RESUME */}
              {row.status === 'PAUSED' && (
                <button
                  onClick={() => openActionDialog(row, 'RESUME')}
                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="Resume Subscription"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Resume</span>
                </button>
              )}

              {/* Transition: ACTIVE or PAUSED -> CLOSE */}
              {(row.status === 'ACTIVE' || row.status === 'PAUSED') && (
                <button
                  onClick={() => openActionDialog(row, 'CLOSE')}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Early Close Subscription"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <Loader message="Loading subscription records from server..." />;

  if (error && subscriptions.length === 0) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isStaffOrAdmin ? 'Subscription Management' : 'My Subscriptions'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isStaffOrAdmin
              ? 'Track subscription states (Draft → Confirmed → Active → Closed), renewal dates & billing terms'
              : 'Review your active software subscriptions, billing schedules, and item details'}
          </p>
        </div>

        {isStaffOrAdmin && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Subscription</span>
          </button>
        )}
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState
          title="No Subscriptions Found"
          description={
            isStaffOrAdmin
              ? 'No subscription records exist yet. Enroll a customer or convert an existing quotation.'
              : "You don't have any active subscriptions yet."
          }
          actionText={isStaffOrAdmin ? 'Create Subscription' : null}
          onAction={isStaffOrAdmin ? openCreateModal : null}
        />
      ) : (
        <DataTable
          columns={columns}
          data={subscriptions}
          searchKey="subscription_number"
          searchPlaceholder="Search by subscription # or customer..."
          filterKey="status"
          filterOptions={filterOptions}
        />
      )}

      {/* Subscription Details Modal */}
      {selectedSub && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Subscription Details: ${selectedSub.subscription_number}`}
          maxWidth="max-w-2xl"
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
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                <StatusBadge status={selectedSub.status} className="mt-1" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Plan Tier</span>
                <span className="text-xs font-semibold text-slate-800 block mt-1">{selectedSub.plan_name}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Next Billing</span>
                <span className="text-xs font-semibold text-slate-800 block mt-1">
                  {formatDate(selectedSub.next_billing_date)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Recurring Total</span>
                <span className="text-xs font-bold text-indigo-600 block mt-1">
                  {formatCurrency(selectedSub.recurring_total)}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Itemized Products & Quantities
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                {(selectedSub.items || []).map((it) => (
                  <div key={it.id || it.product_id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{it.product_name}</p>
                      {it.variant_name && <p className="text-[11px] text-slate-400">Variant: {it.variant_name}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">
                        {it.quantity}x @ {formatCurrency(it.unit_price)}
                        {it.additional_price > 0 && ` (+${formatCurrency(it.additional_price)})`}
                      </p>
                      <p className="text-[11px] text-slate-500 font-bold">{formatCurrency(it.line_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatCurrency(selectedSub.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount Applied:</span>
                <span className="text-rose-600">-{formatCurrency(selectedSub.discount_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax Amount:</span>
                <span>+{formatCurrency(selectedSub.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-sm pt-2 border-t border-slate-200">
                <span>Recurring Cycle Total:</span>
                <span className="text-indigo-600">{formatCurrency(selectedSub.recurring_total)}</span>
              </div>
            </div>

            {selectedSub.closure_reason && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <strong>Closure Reason:</strong> {selectedSub.closure_reason}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create Subscription Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Subscription"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSubscription} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Customer *</label>
              <select
                value={newSubData.customer_id}
                onChange={(e) => setNewSubData({ ...newSubData, customer_id: e.target.value })}
                required
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">Select a customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Billing Plan *</label>
              <select
                value={newSubData.plan_id}
                onChange={(e) => setNewSubData({ ...newSubData, plan_id: e.target.value })}
                required
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">Select a plan...</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.billing_interval})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-800">Subscription Products</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              {newSubData.items.map((item, index) => {
                const prod = products.find((p) => p.id === item.product_id);
                const variants = prod?.variants || [];

                return (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                    <div className="col-span-4">
                      <select
                        value={item.product_id}
                        onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded-lg"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-3">
                      {variants.length > 0 ? (
                        <select
                          value={item.variant_id}
                          onChange={(e) => handleItemChange(index, 'variant_id', e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-200 rounded-lg"
                        >
                          <option value="">Standard</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.variant_name} (+{formatCurrency(v.additional_price)})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic px-1">No variants</span>
                      )}
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded-lg text-center"
                        placeholder="Qty"
                      />
                    </div>

                    <div className="col-span-2 text-right font-semibold text-slate-700">
                      {formatCurrency(
                        (Number(item.unit_price) + Number(item.additional_price || 0)) * item.quantity
                      )}
                    </div>

                    <div className="col-span-1 text-right">
                      {newSubData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 flex justify-between text-xs font-semibold text-slate-800 px-1">
                <span>Estimated Items Subtotal:</span>
                <span className="text-indigo-600 font-bold">{formatCurrency(subtotalEstimate)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes / Terms</label>
            <textarea
              value={newSubData.notes}
              onChange={(e) => setNewSubData({ ...newSubData, notes: e.target.value })}
              rows={2}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="Optional enrollment notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Enroll & Confirm Subscription'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog for Lifecycle Actions */}
      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={executeLifecycleAction}
        loading={actionLoading}
        title={`${actionTarget.action} Subscription`}
        message={
          actionTarget.action === 'CLOSE'
            ? 'Early-closing this subscription will cancel upcoming billing cycles. Are you sure you wish to proceed?'
            : `Are you sure you want to transition ${actionTarget.sub?.subscription_number} to ${actionTarget.action}?`
        }
        confirmText={`Proceed (${actionTarget.action})`}
        isDestructive={actionTarget.action === 'CLOSE'}
      />
    </div>
  );
};
