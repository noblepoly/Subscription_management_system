import React, { useState, useEffect } from 'react';
import { subscriptionsApi } from '../../api/subscriptionsApi';
import { invoicesApi } from '../../api/invoicesApi';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Repeat,
  Receipt,
  CreditCard,
  Building,
  Mail,
  Phone,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Eye,
} from 'lucide-react';

export const CustomerPortalPage = () => {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Simulated Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [simCardNumber, setSimCardNumber] = useState('4242 •••• •••• 4242');
  const [simCardExpiry, setSimCardExpiry] = useState('12/28');
  const [simCardCvc, setSimCardCvc] = useState('888');
  const [processing, setProcessing] = useState(false);

  // Detail Modal State
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState(null);

  const { addToast } = useToast();

  const loadCustomerData = async () => {
    if (!user) return;
    try {
      const [sRes, iRes] = await Promise.all([
        subscriptionsApi.getSubscriptions({ customerId: user.id }),
        invoicesApi.getInvoices({ customerId: user.id }),
      ]);
      setSubscriptions(sRes.data);
      setInvoices(iRes.data);
    } catch (err) {
      addToast(err.message || 'Failed to load your account records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
  }, [user]);

  const openSimulatedPayment = (inv) => {
    setSelectedInvoice(inv);
    setPaymentAmount(inv.balance_due.toString());
    setPaymentModalOpen(true);
  };

  const handleSimulatedPayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      addToast('Amount must be positive', 'error');
      return;
    }
    if (amt > selectedInvoice.balance_due) {
      addToast(`Amount cannot exceed outstanding balance due (${formatCurrency(selectedInvoice.balance_due)})`, 'error');
      return;
    }

    setProcessing(true);
    try {
      await paymentsApi.recordPayment({
        invoice_id: selectedInvoice.id,
        amount: amt,
        payment_method: 'ONLINE_MOCK_SIMULATED',
        transaction_reference: `CARD-SIM-${Date.now().toString().slice(-6)}`,
        notes: `Simulated online payment by customer (${user.full_name})`,
      });
      addToast('Simulated payment confirmed! Your invoice balance has been updated.', 'success');
      setPaymentModalOpen(false);
      loadCustomerData();
    } catch (err) {
      addToast(err.message || 'Payment simulation failed', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <Loader message="Accessing your secure self-service portal..." />;

  const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE');
  const totalBalanceDue = invoices.reduce((sum, i) => sum + i.balance_due, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.amount_paid, 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 bg-white/10 rounded-md border border-white/20 text-indigo-200">
            Customer Self-Service Portal
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3">
            Welcome, {user?.full_name || 'Customer'}
          </h1>
          <p className="text-xs sm:text-sm text-indigo-200/90 mt-2 leading-relaxed">
            Manage your active software licenses, review invoice periods, download receipts, and submit online simulated payments.
          </p>
        </div>
      </div>

      {/* Customer KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Subscriptions"
          value={activeSubs.length}
          subtitle={`${subscriptions.length} total subscriptions enrolled`}
          icon={Repeat}
          color="indigo"
        />

        <StatCard
          title="Outstanding Balance Due"
          value={formatCurrency(totalBalanceDue)}
          subtitle={totalBalanceDue > 0 ? 'Pending invoice payments' : 'All invoices settled'}
          icon={Receipt}
          color={totalBalanceDue > 0 ? 'rose' : 'emerald'}
        />

        <StatCard
          title="Total Lifetime Payments"
          value={formatCurrency(totalPaid)}
          subtitle="Confirmed settlements"
          icon={CreditCard}
          color="emerald"
        />
      </div>

      {/* Account Info Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs text-xs">
        <h3 className="font-bold text-slate-900 mb-3 text-sm flex items-center gap-2">
          <Building className="w-4 h-4 text-indigo-600" />
          Account & Billing Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-slate-600">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Organization</span>
            <span className="font-semibold text-slate-800 mt-0.5 block">{user?.company_name || 'Individual'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Billing Contact</span>
            <span className="font-semibold text-slate-800 mt-0.5 block">{user?.email}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Billing Address</span>
            <span className="font-semibold text-slate-800 mt-0.5 block">{user?.billing_address || 'Not specified'}</span>
          </div>
        </div>
      </div>

      {/* My Subscriptions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">My Subscriptions</h3>
            <p className="text-xs text-slate-500">Your current plans and renewal schedules</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
              <tr>
                <th className="px-5 py-3">Subscription #</th>
                <th className="px-5 py-3">Plan Tier</th>
                <th className="px-5 py-3">Cadence</th>
                <th className="px-5 py-3">Next Renewal</th>
                <th className="px-5 py-3">Recurring Total</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No subscriptions found for your account.
                  </td>
                </tr>
              ) : (
                subscriptions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-bold text-slate-900">{s.subscription_number}</td>
                    <td className="px-5 py-3.5 font-medium">{s.plan_name}</td>
                    <td className="px-5 py-3.5">{s.billing_interval}</td>
                    <td className="px-5 py-3.5">{formatDate(s.next_billing_date)}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{formatCurrency(s.recurring_total)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* My Invoices Table with Payment Simulation */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">My Invoices & Billing History</h3>
            <p className="text-xs text-slate-500">Pay outstanding balances or inspect historical line items</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
              <tr>
                <th className="px-5 py-3">Invoice #</th>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Due Date</th>
                <th className="px-5 py-3">Total Invoiced</th>
                <th className="px-5 py-3">Balance Due</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    No invoices generated yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-bold text-slate-900">{inv.invoice_number}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {formatDate(inv.billing_period_start)} - {formatDate(inv.billing_period_end)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={inv.is_overdue ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                        {formatDate(inv.due_date)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{formatCurrency(inv.total_amount)}</td>
                    <td className="px-5 py-3.5 font-bold text-indigo-600">{formatCurrency(inv.balance_due)}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setActiveInvoice(inv);
                            setInvoiceDetailOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-md"
                          title="View Receipt"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {inv.balance_due > 0 && (
                          <button
                            onClick={() => openSimulatedPayment(inv)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay Now</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Online Mock Simulated Payment Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          title="Simulated Online Payment Gateway"
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
                onClick={handleSimulatedPayment}
                disabled={processing}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs flex items-center gap-2"
              >
                {processing && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>Authorize Simulated Payment ({formatCurrency(paymentAmount)})</span>
              </button>
            </>
          }
        >
          <form onSubmit={handleSimulatedPayment} className="space-y-4">
            {/* Simulation Banner Notice */}
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Simulated Online Payment Sandbox</strong>
                <span>This simulation models a card payment without charging real funds.</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <p>Invoice: <strong>{selectedInvoice.invoice_number}</strong></p>
              <p>Total Balance Due: <strong className="text-indigo-600">{formatCurrency(selectedInvoice.balance_due)}</strong></p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount to Pay ($)
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
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Demo Card Number
              </label>
              <input
                type="text"
                disabled
                value={simCardNumber}
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-300 rounded-xl text-slate-600 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expires</label>
                <input
                  type="text"
                  disabled
                  value={simCardExpiry}
                  className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-300 rounded-xl text-slate-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">CVC</label>
                <input
                  type="text"
                  disabled
                  value={simCardCvc}
                  className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-300 rounded-xl text-slate-600 font-mono"
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Invoice Detail Modal */}
      {activeInvoice && (
        <Modal
          isOpen={invoiceDetailOpen}
          onClose={() => setInvoiceDetailOpen(false)}
          title={`Invoice ${activeInvoice.invoice_number}`}
          maxWidth="max-w-xl"
          footer={
            <button
              type="button"
              onClick={() => setInvoiceDetailOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Close
            </button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex justify-between">
                <span>Period:</span>
                <span className="font-semibold">{formatDate(activeInvoice.billing_period_start)} - {formatDate(activeInvoice.billing_period_end)}</span>
              </div>
              <div className="flex justify-between">
                <span>Due Date:</span>
                <span className="font-semibold">{formatDate(activeInvoice.due_date)}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <StatusBadge status={activeInvoice.status} />
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-800 mb-2">Itemized Breakdown</h4>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {(activeInvoice.items || []).map((it, idx) => (
                  <div key={idx} className="p-2.5 flex justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{it.product_name}</p>
                      {it.variant_name && <p className="text-[10px] text-slate-400">{it.variant_name}</p>}
                    </div>
                    <span className="font-bold text-slate-900">{formatCurrency(it.line_total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 font-medium">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(activeInvoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Discount:</span>
                <span>-{formatCurrency(activeInvoice.discount_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax:</span>
                <span>+{formatCurrency(activeInvoice.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>Total Amount:</span>
                <span>{formatCurrency(activeInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-indigo-700 font-bold">
                <span>Balance Due:</span>
                <span>{formatCurrency(activeInvoice.balance_due)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
