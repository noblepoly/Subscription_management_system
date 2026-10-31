import React, { useState, useEffect } from 'react';
import { subscriptionsApi } from '../../api/subscriptionsApi';
import { plansApi } from '../../api/plansApi';
import { usersApi } from '../../api/usersApi';
import { productsApi } from '../../api/productsApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Plus,
  Repeat,
  Play,
  Pause,
  XCircle,
  RefreshCw,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  FileCheck,
} from 'lucide-react';

export const SubscriptionsPage = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

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
  const [newSubData, setNewSubData] = useState({
    customer_id: '',
    plan_id: '',
    items: [],
    tax_rate: 18,
    discount_amount: 0,
    notes: '',
  });

  const { addToast } = useToast();

  const loadData = async () => {
    try {
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
    } catch (err) {
      addToast(err.message || 'Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
        closure_reason: closureReason || 'Manual action from dashboard',
      });
      addToast(`Subscription ${sub.subscription_number} status updated: ${action}`, 'success');
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

    setNewSubData({
      customer_id: defaultCust?.id || '',
      plan_id: defaultPlan?.id || '',
      tax_rate: 18,
      discount_amount: 0,
      notes: 'New manual subscription enrollment',
      items: defaultProd
        ? [
            {
              product_id: defaultProd.id,
              product_name: defaultProd.name,
              variant_id: defaultProd.variants[0]?.id || null,
              variant_name: defaultProd.variants[0]?.variant_name || null,
              quantity: 1,
              unit_price: defaultProd.sales_price,
              additional_price: defaultProd.variants[0]?.additional_price || 0,
              line_total:
                Number(defaultProd.sales_price) +
                Number(defaultProd.variants[0]?.additional_price || 0),
            },
          ]
        : [],
    });
    setCreateModalOpen(true);
  };

  const handleCreateSubscription = async (e) => {
    e.preventDefault();
    if (!newSubData.customer_id || !newSubData.plan_id) {
      addToast('Customer and Plan selection required', 'error');
      return;
    }
    if (newSubData.items.length === 0) {
      addToast('At least one item is required', 'error');
      return;
    }

    try {
      await subscriptionsApi.createSubscription({
        ...newSubData,
        status: 'CONFIRMED', // Direct creation goes to CONFIRMED
      });
      addToast('New subscription enrolled successfully', 'success');
      setCreateModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Creation failed', 'error');
    }
  };

  const filterOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'Paused', value: 'PAUSED' },
    { label: 'Closed', value: 'CLOSED' },
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
            <p className="text-xs text-slate-400">{row.customer_name}</p>
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
      header: 'Lifecycle Actions',
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

          {/* Transition: CONFIRMED or DRAFT -> ACTIVATE */}
          {(row.status === 'CONFIRMED' || row.status === 'DRAFT') && (
            <button
              onClick={() => openActionDialog(row, 'ACTIVATE')}
              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1"
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
              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1"
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
        </div>
      ),
    },
  ];

  if (loading) return <Loader message="Loading subscription records..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscription Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track subscription states (Draft → Quotation → Confirmed → Active → Closed), renewal dates & billing terms
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Subscription</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={subscriptions}
        searchKey="subscription_number"
        searchPlaceholder="Search by subscription # or customer..."
        filterKey="status"
        filterOptions={filterOptions}
      />

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
                  <div key={it.id} className="p-3 flex items-center justify-between">
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

      {/* Confirmation Dialog for Lifecycle Actions */}
      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={executeLifecycleAction}
        loading={actionLoading}
        title={`${actionTarget.action} Subscription`}
        message={
          actionTarget.action === 'CLOSE'
            ? 'Early-closing this subscription will cancel upcoming billing cycles. Please specify a reason below.'
            : `Are you sure you want to transition ${actionTarget.sub?.subscription_number} to ${actionTarget.action}?`
        }
        confirmText={`Proceed (${actionTarget.action})`}
        isDestructive={actionTarget.action === 'CLOSE'}
      />
    </div>
  );
};
