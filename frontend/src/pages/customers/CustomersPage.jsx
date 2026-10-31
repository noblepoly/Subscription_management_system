import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/usersApi';
import { subscriptionsApi } from '../../api/subscriptionsApi';
import { invoicesApi } from '../../api/invoicesApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Users, Mail, Phone, MapPin, Building, Repeat, Receipt, Eye } from 'lucide-react';

export const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Detail Modal State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const { addToast } = useToast();

  const loadData = async () => {
    try {
      const [cRes, sRes, iRes] = await Promise.all([
        usersApi.getCustomers(),
        subscriptionsApi.getSubscriptions(),
        invoicesApi.getInvoices(),
      ]);
      setCustomers(cRes.data);
      setSubscriptions(sRes.data);
      setInvoices(iRes.data);
    } catch (err) {
      addToast(err.message || 'Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCustomerDetail = (cust) => {
    const custSubs = subscriptions.filter((s) => s.customer_id === cust.id);
    const custInvs = invoices.filter((i) => i.customer_id === cust.id);
    setSelectedCustomer({ ...cust, custSubs, custInvs });
    setDetailModalOpen(true);
  };

  const columns = [
    {
      header: 'Customer',
      key: 'full_name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center text-xs border border-teal-200">
            {row.full_name ? row.full_name[0] : 'C'}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.full_name}</p>
            <p className="text-xs text-slate-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Company & Phone',
      key: 'company_name',
      render: (row) => (
        <div className="text-xs text-slate-700">
          <p className="font-medium">{row.company_name || 'Individual'}</p>
          <p className="text-slate-400 text-[11px]">{row.phone || '—'}</p>
        </div>
      ),
    },
    {
      header: 'Active Subscriptions',
      key: 'subscriptions',
      render: (row) => {
        const count = subscriptions.filter(
          (s) => s.customer_id === row.id && s.status === 'ACTIVE'
        ).length;
        return (
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md">
            {count} Active Sub(s)
          </span>
        );
      },
    },
    {
      header: 'Total Invoiced',
      key: 'invoiced',
      render: (row) => {
        const total = invoices
          .filter((i) => i.customer_id === row.id)
          .reduce((sum, i) => sum + i.total_amount, 0);
        return <span className="font-bold text-slate-900 text-xs">{formatCurrency(total)}</span>;
      },
    },
    {
      header: 'Outstanding Balance',
      key: 'balance',
      render: (row) => {
        const balance = invoices
          .filter((i) => i.customer_id === row.id)
          .reduce((sum, i) => sum + i.balance_due, 0);
        return (
          <span
            className={`font-bold text-xs ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
          >
            {formatCurrency(balance)}
          </span>
        );
      },
    },
    {
      header: 'Enrolled On',
      key: 'created_at',
      sortable: true,
      render: (row) => <span className="text-xs text-slate-500">{formatDate(row.created_at)}</span>,
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => (
        <button
          onClick={() => openCustomerDetail(row)}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-auto"
          title="View Customer Profile"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  if (loading) return <Loader message="Loading customer directory..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customer Accounts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Directory of enrolled client organizations, contact records, and lifetime recurring balances
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={customers}
        searchKey="full_name"
        searchPlaceholder="Search customers by name or email..."
      />

      {/* Customer Detail Drawer Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Customer: ${selectedCustomer.full_name}`}
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
            {/* Contact Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Building className="w-4 h-4 text-slate-400" />
                <span>Company: <strong>{selectedCustomer.company_name || 'Individual'}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>Email: <strong>{selectedCustomer.email}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>Phone: <strong>{selectedCustomer.phone || 'Not provided'}</strong></span>
              </div>
              <div className="flex items-start gap-2 text-slate-700 sm:col-span-2">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>Address: <strong>{selectedCustomer.billing_address || 'No billing address'}</strong></span>
              </div>
            </div>

            {/* Subscriptions */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-indigo-600" />
                Associated Subscriptions ({(selectedCustomer.custSubs || []).length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                {(selectedCustomer.custSubs || []).length === 0 ? (
                  <p className="p-4 text-center text-slate-400">No active subscriptions yet.</p>
                ) : (
                  selectedCustomer.custSubs.map((s) => (
                    <div key={s.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{s.subscription_number}</p>
                        <p className="text-[11px] text-slate-400">{s.plan_name} • {s.billing_interval}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900">{formatCurrency(s.recurring_total)}</span>
                        <StatusBadge status={s.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Invoices */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-indigo-600" />
                Invoices Ledger ({(selectedCustomer.custInvs || []).length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                {(selectedCustomer.custInvs || []).length === 0 ? (
                  <p className="p-4 text-center text-slate-400">No invoices issued yet.</p>
                ) : (
                  selectedCustomer.custInvs.map((i) => (
                    <div key={i.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{i.invoice_number}</p>
                        <p className="text-[11px] text-slate-400">Due: {formatDate(i.due_date)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold text-slate-900">{formatCurrency(i.total_amount)}</p>
                          <p className="text-[10px] text-slate-400">Bal: {formatCurrency(i.balance_due)}</p>
                        </div>
                        <StatusBadge status={i.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
