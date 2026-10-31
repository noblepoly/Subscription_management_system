import React, { useState, useEffect } from 'react';
import { paymentsApi } from '../../api/paymentsApi';
import { invoicesApi } from '../../api/invoicesApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Plus, CreditCard, CheckCircle2, ShieldCheck, AlertCircle, FileText } from 'lucide-react';

export const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Payment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    invoice_id: '',
    amount: '',
    payment_method: 'BANK_TRANSFER',
    transaction_reference: '',
    notes: '',
  });

  // Verify Dialog State
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [paymentToVerify, setPaymentToVerify] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const { user, isStaffOrAdmin } = useAuth();
  const { addToast } = useToast();

  const loadData = async () => {
    try {
      const [pRes, iRes] = await Promise.all([
        paymentsApi.getPayments(),
        invoicesApi.getInvoices(),
      ]);
      setPayments(pRes.data);
      // Filter invoices that have an outstanding balance due
      setInvoices(iRes.data.filter((inv) => inv.balance_due > 0));
    } catch (err) {
      addToast(err.message || 'Failed to load payments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    if (invoices.length === 0) {
      addToast('No invoices currently have an outstanding balance due', 'info');
      return;
    }
    const inv = invoices[0];
    setFormData({
      invoice_id: inv.id,
      amount: inv.balance_due.toString(),
      payment_method: 'BANK_TRANSFER',
      transaction_reference: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const inv = invoices.find((i) => i.id === formData.invoice_id);
    if (!inv) {
      addToast('Please select a valid invoice', 'error');
      return;
    }

    const amt = Number(formData.amount);
    if (!amt || amt <= 0) {
      addToast('Amount must be positive', 'error');
      return;
    }
    if (amt > inv.balance_due) {
      addToast(`Amount cannot exceed invoice balance due (${formatCurrency(inv.balance_due)})`, 'error');
      return;
    }

    try {
      await paymentsApi.recordPayment({
        ...formData,
        amount: amt,
        recorded_by: user?.id,
        recorder_name: user?.full_name,
        verified_by_staff: isStaffOrAdmin && formData.payment_method !== 'ONLINE_MOCK_SIMULATED',
      });
      addToast('Payment recorded successfully', 'success');
      setModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Payment recording failed', 'error');
    }
  };

  const handleVerifyPayment = async () => {
    if (!paymentToVerify) return;
    setVerifying(true);
    try {
      await paymentsApi.verifyPayment(paymentToVerify.id, user?.id);
      addToast(`Payment ${paymentToVerify.payment_number} verified and confirmed!`, 'success');
      setVerifyDialogOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message || 'Verification failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const filterOptions = [
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'Pending Verification', value: 'PENDING_VERIFICATION' },
  ];

  const columns = [
    {
      header: 'Payment #',
      key: 'payment_number',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.payment_number}</p>
            <p className="text-xs text-slate-400">Invoice: {row.invoice_number}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Customer',
      key: 'customer_name',
      sortable: true,
      render: (row) => <span className="font-medium text-slate-800 text-xs">{row.customer_name}</span>,
    },
    {
      header: 'Method',
      key: 'payment_method',
      render: (row) => {
        const isOnline = row.payment_method === 'ONLINE_MOCK_SIMULATED';
        return (
          <div>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                isOnline
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {isOnline ? 'Online Mock Simulated' : row.payment_method.replace('_', ' ')}
            </span>
            {row.transaction_reference && (
              <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                Ref: {row.transaction_reference}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'Amount',
      key: 'amount',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-emerald-600 text-sm">{formatCurrency(row.amount)}</span>
      ),
    },
    {
      header: 'Date & Recorder',
      key: 'payment_date',
      render: (row) => (
        <div className="text-xs">
          <p className="text-slate-700 font-medium">{formatDateTime(row.payment_date)}</p>
          <p className="text-[10px] text-slate-400">By: {row.recorder_name || 'System'}</p>
        </div>
      ),
    },
    {
      header: 'Verification Status',
      key: 'payment_status',
      sortable: true,
      render: (row) => <StatusBadge status={row.payment_status} />,
    },
    {
      header: 'Staff Action',
      key: 'actions',
      className: 'text-right',
      render: (row) => {
        if (row.payment_status === 'PENDING_VERIFICATION') {
          return (
            <button
              onClick={() => {
                setPaymentToVerify(row);
                setVerifyDialogOpen(true);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 ml-auto"
              title="Verify and confirm offline payment receipt"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verify & Approve</span>
            </button>
          );
        }
        return (
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
          </span>
        );
      },
    },
  ];

  if (loading) return <Loader message="Loading payment transactions..." />;

  const selectedInvoiceObj = invoices.find((i) => i.id === formData.invoice_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payment Processing & Verification</h1>
          <p className="text-xs text-slate-500 mt-1">
            Reconcile payments, track partial installments, and verify offline wire / cheque deposits
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record New Payment</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        searchKey="payment_number"
        searchPlaceholder="Search payments by number..."
        filterKey="payment_status"
        filterOptions={filterOptions}
      />

      {/* Record Payment Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record New Inbound Payment"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRecordPayment}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
            >
              Record Payment
            </button>
          </>
        }
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Select Invoice *</label>
            <select
              value={formData.invoice_id}
              onChange={(e) => {
                const inv = invoices.find((i) => i.id === e.target.value);
                setFormData({
                  ...formData,
                  invoice_id: e.target.value,
                  amount: inv ? inv.balance_due.toString() : '',
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.customer_name} (Balance: {formatCurrency(inv.balance_due)})
                </option>
              ))}
            </select>
          </div>

          {selectedInvoiceObj && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <p className="text-slate-500">Invoice Total: <strong className="text-slate-800">{formatCurrency(selectedInvoiceObj.total_amount)}</strong></p>
              <p className="text-slate-500">Already Paid: <strong className="text-emerald-600">{formatCurrency(selectedInvoiceObj.amount_paid)}</strong></p>
              <p className="text-slate-500">Outstanding Balance: <strong className="text-indigo-600">{formatCurrency(selectedInvoiceObj.balance_due)}</strong></p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Payment Amount ($) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={selectedInvoiceObj ? selectedInvoiceObj.balance_due : undefined}
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="BANK_TRANSFER">Bank Wire / Wire Transfer</option>
              <option value="CASH">Cash Deposit</option>
              <option value="CHEQUE">Cheque</option>
              <option value="ONLINE_MOCK_SIMULATED">Online Mock Simulated (Direct Card Simulation)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Transaction Reference</label>
            <input
              type="text"
              value={formData.transaction_reference}
              onChange={(e) => setFormData({ ...formData, transaction_reference: e.target.value })}
              placeholder="e.g. WIRE-884920 or CHQ-4819"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Internal Notes</label>
            <textarea
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes on receipt confirmation..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </form>
      </Modal>

      {/* Verification Confirmation Dialog */}
      <ConfirmDialog
        isOpen={verifyDialogOpen}
        onClose={() => setVerifyDialogOpen(false)}
        onConfirm={handleVerifyPayment}
        loading={verifying}
        title="Verify Offline Payment Deposit"
        message={`Confirm that the funds for ${paymentToVerify?.payment_number} (${formatCurrency(paymentToVerify?.amount)}) have cleared into the company account. This will deduct from the invoice balance due.`}
        confirmText="Confirm & Verify Payment"
      />
    </div>
  );
};
