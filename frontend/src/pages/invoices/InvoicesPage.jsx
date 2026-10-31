import React, { useState, useEffect } from 'react';
import { invoicesApi } from '../../api/invoicesApi';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Receipt,
  Eye,
  CreditCard,
  Printer,
  Calendar,
  AlertTriangle,
  Play,
  CheckCircle,
} from 'lucide-react';

export const InvoicesPage = () => {
  const { user, isStaffOrAdmin } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Record Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const { addToast } = useToast();

  const loadInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = isStaffOrAdmin ? {} : { customerId: user?.id };
      const { data } = await invoicesApi.getInvoices(params);
      setInvoices(data);
    } catch (err) {
      setError(err.message || 'Failed to load invoices');
      addToast(err.message || 'Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [user?.role]);

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.balance_due.toString());
    setPaymentMethod('BANK_TRANSFER');
    setPaymentNotes('');
    setPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      addToast('Payment amount must be greater than zero', 'error');
      return;
    }
    if (amt > selectedInvoice.balance_due) {
      addToast(`Payment amount cannot exceed outstanding balance due (${formatCurrency(selectedInvoice.balance_due)})`, 'error');
      return;
    }

    setRecordingPayment(true);
    try {
      await paymentsApi.recordPayment({
        invoice_id: selectedInvoice.id,
        amount: amt,
        payment_method: paymentMethod,
        notes: paymentNotes,
        verified_by_staff: true,
      });
      addToast('Payment successfully recorded and balance updated', 'success');
      setPaymentModalOpen(false);
      loadInvoices();
    } catch (err) {
      addToast(err.message || 'Payment recording failed', 'error');
    } finally {
      setRecordingPayment(false);
    }
  };

  const filterOptions = [
    { label: 'Paid', value: 'PAID' },
    { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
    { label: 'Overdue', value: 'OVERDUE' },
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'Draft', value: 'DRAFT' },
  ];

  const columns = [
    {
      header: 'Invoice #',
      key: 'invoice_number',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.invoice_number}</p>
            {isStaffOrAdmin && <p className="text-xs text-slate-400">{row.customer_name || 'Customer'}</p>}
          </div>
        </div>
      ),
    },
    {
      header: 'Billing Cycle',
      key: 'billing_period_start',
      sortable: true,
      render: (row) => (
        <div className="text-xs">
          <p className="text-slate-700 font-medium">
            {formatDate(row.billing_period_start)} – {formatDate(row.billing_period_end)}
          </p>
          <span className="text-[10px] text-slate-400">Due: {formatDate(row.due_date)}</span>
        </div>
      ),
    },
    {
      header: 'Total Amount',
      key: 'total_amount',
      sortable: true,
      render: (row) => <span className="font-bold text-slate-900">{formatCurrency(row.total_amount)}</span>,
    },
    {
      header: 'Balance Due',
      key: 'balance_due',
      sortable: true,
      render: (row) => (
        <div>
          <span className={`font-bold ${row.balance_due > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
            {formatCurrency(row.balance_due)}
          </span>
          {row.amount_paid > 0 && (
            <p className="text-[10px] text-slate-400">Paid: {formatCurrency(row.amount_paid)}</p>
          )}
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
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => {
              setSelectedInvoice(row);
              setDetailModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="View Invoice Receipt"
          >
            <Eye className="w-4 h-4" />
          </button>

          {isStaffOrAdmin && row.balance_due > 0 && row.status !== 'CANCELLED' && (
            <button
              onClick={() => openPaymentModal(row)}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Record Payment for Invoice"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Pay</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <Loader message="Loading invoices & billing registers..." />;

  if (error && invoices.length === 0) {
    return <ErrorState message={error} onRetry={loadInvoices} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isStaffOrAdmin ? 'Invoices & Billing' : 'My Invoices'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated recurring invoice ledger with immutable pricing snapshots, taxes, and balance tracking
          </p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="No Invoices Found"
          description={
            isStaffOrAdmin
              ? 'No billing invoices generated yet. Run the recurring billing cycle from the dashboard or wait for subscription renewal.'
              : 'You have no invoices generated on your account.'
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          searchKey="invoice_number"
          searchPlaceholder="Search by invoice # or customer..."
          filterKey="status"
          filterOptions={filterOptions}
        />
      )}

      {/* Invoice Detail / Receipt Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Invoice ${selectedInvoice.invoice_number}`}
          maxWidth="max-w-2xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-5 print:p-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                <StatusBadge status={selectedInvoice.status} className="mt-1" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Invoice Date</span>
                <span className="text-xs font-semibold text-slate-800 block mt-1">
                  {formatDate(selectedInvoice.invoice_date)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Due Date</span>
                <span className="text-xs font-semibold text-slate-800 block mt-1">
                  {formatDate(selectedInvoice.due_date)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Balance Due</span>
                <span className="font-bold text-indigo-600 block mt-1">
                  {formatCurrency(selectedInvoice.balance_due)}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Billed To</span>
              <p className="font-bold text-slate-900">{selectedInvoice.customer_name}</p>
              <p className="text-slate-500">{selectedInvoice.customer_email}</p>
              <p className="text-slate-400">Subscription: {selectedInvoice.subscription_number}</p>
            </div>

            {/* Immutable Line Items Snapshot */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2">Immutable Historical Line Snapshots</h4>
              <table className="w-full text-xs text-left border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Product & Variant</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Unit Price</th>
                    <th className="p-2.5 text-right">Tax Rate</th>
                    <th className="p-2.5 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(selectedInvoice.items || []).map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td className="p-2.5">
                        <span className="font-medium text-slate-900 block">{it.product_name}</span>
                        {it.variant_name && <span className="text-[10px] text-slate-400">{it.variant_name}</span>}
                      </td>
                      <td className="p-2.5 text-center font-medium">{it.quantity}</td>
                      <td className="p-2.5 text-right">
                        {formatCurrency(it.applied_unit_price + (it.applied_additional_price || 0))}
                      </td>
                      <td className="p-2.5 text-right text-slate-500">{it.tax_rate}%</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{formatCurrency(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Ledger Calculation */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatCurrency(selectedInvoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount Snapshot:</span>
                <span className="text-rose-600">-{formatCurrency(selectedInvoice.discount_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax Snapshot:</span>
                <span>+{formatCurrency(selectedInvoice.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-sm pt-2 border-t border-slate-200">
                <span>Total Invoiced Amount:</span>
                <span>{formatCurrency(selectedInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Amount Paid:</span>
                <span>{formatCurrency(selectedInvoice.amount_paid)}</span>
              </div>
              <div className="flex justify-between text-indigo-700 font-bold text-base pt-1">
                <span>Outstanding Balance:</span>
                <span>{formatCurrency(selectedInvoice.balance_due)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          title={`Record Payment for ${selectedInvoice.invoice_number}`}
          maxWidth="max-w-md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={recordingPayment}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs flex items-center gap-2"
              >
                {recordingPayment && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>Confirm Payment Receipt</span>
              </button>
            </>
          }
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs space-y-1 text-indigo-900">
              <p>Invoice Total: <strong>{formatCurrency(selectedInvoice.total_amount)}</strong></p>
              <p>Current Balance Due: <strong>{formatCurrency(selectedInvoice.balance_due)}</strong></p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payment Amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedInvoice.balance_due}
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Supports partial payments up to outstanding balance
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="BANK_TRANSFER">Bank Wire / Wire Transfer</option>
                <option value="CASH">Cash Deposit</option>
                <option value="CHEQUE">Cheque</option>
                <option value="ONLINE_MOCK_SIMULATED">Online Mock Simulation (Credit/Debit Card)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes / Transaction Reference</label>
              <textarea
                rows="2"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Bank receipt #, check number, or clearing notes..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
