import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../../api/analyticsApi';
import { invoicesApi } from '../../api/invoicesApi';
import { useToast } from '../../context/ToastContext';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Users,
  TrendingUp,
  CreditCard,
  AlertOctagon,
  RefreshCw,
  Play,
  ArrowRight,
  Receipt,
  CheckCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export const DashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingRunning, setBillingRunning] = useState(false);
  const [billingConfirmOpen, setBillingConfirmOpen] = useState(false);
  const { addToast } = useToast();
  const navigate = useNavigate();

  const fetchDashboard = async () => {
    try {
      const { data: res } = await analyticsApi.getDashboardSummary();
      setData(res);
    } catch (err) {
      addToast(err.message || 'Failed to load dashboard metrics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleRunBillingCycle = async () => {
    setBillingRunning(true);
    try {
      const { data: res } = await invoicesApi.runRecurringBillingCycle();
      addToast(res.message || 'Recurring billing cycle completed!', 'success');
      setBillingConfirmOpen(false);
      // Refresh dashboard
      await fetchDashboard();
    } catch (err) {
      addToast(err.message || 'Error running billing cycle', 'error');
    } finally {
      setBillingRunning(false);
    }
  };

  if (loading) {
    return <Loader message="Aggregating subscription & financial analytics..." />;
  }

  const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Executive Revenue Overview</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time telemetry, normalized MRR, recurring billing, and cash collection
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setLoading(true);
              fetchDashboard();
            }}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-xs"
            title="Refresh Metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setBillingConfirmOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Recurring Billing</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(data?.mrr)}
          subtitle={`Annualized ARR: ${formatCurrency(data?.arr)}`}
          trend={14.8}
          trendLabel="vs last month"
          icon={TrendingUp}
          color="indigo"
        />

        <StatCard
          title="Active Subscriptions"
          value={data?.activeSubscriptionsCount || 0}
          subtitle={`${data?.totalSubscriptionsCount || 0} total enrolled accounts`}
          trend={8.2}
          trendLabel="growth"
          icon={Users}
          color="emerald"
        />

        <StatCard
          title="Revenue Collected"
          value={formatCurrency(data?.totalRevenue)}
          subtitle="Processed & verified payments"
          trend={19.4}
          trendLabel="collection"
          icon={CreditCard}
          color="purple"
        />

        <StatCard
          title="Overdue Receivables"
          value={formatCurrency(data?.overdueAmount)}
          subtitle={`${data?.overdueCount || 0} unpaid overdue invoice(s)`}
          trend={data?.overdueCount > 0 ? -5.1 : 0}
          trendLabel={data?.overdueCount > 0 ? 'requires action' : 'healthy'}
          icon={AlertOctagon}
          color={data?.overdueCount > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Charts Section: Revenue / MRR Trend & Plan Popularity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trend Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Revenue & MRR Growth</h3>
              <p className="text-xs text-slate-500">6-month recurring cash flow vs normalized MRR</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              USD ($)
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.revenueTrend || []}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), '']}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
                <Area type="monotone" dataKey="revenue" name="Total Revenue" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="mrr" name="Normalized MRR" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMrr)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Breakdown Pie Chart */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col">
          <div className="mb-2">
            <h3 className="text-base font-bold text-slate-900">Plan Distribution</h3>
            <p className="text-xs text-slate-500">Subscriptions by plan tier</p>
          </div>

          <div className="h-64 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.planDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(data?.planDistribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Invoices & Recent Verified Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Invoices</h3>
              <p className="text-xs text-slate-500">Latest recurring billing transactions</p>
            </div>
            <button
              onClick={() => navigate('/invoices')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            {(data?.recentInvoices || []).map((inv) => (
              <div key={inv.id} className="p-4 hover:bg-slate-50/60 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-xs">{inv.invoice_number}</p>
                    <p className="text-[11px] text-slate-500">{inv.customer_name} • Due {formatDate(inv.due_date)}</p>
                  </div>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-bold text-slate-900 text-xs">{formatCurrency(inv.total_amount)}</p>
                    <p className="text-[10px] text-slate-400">Bal: {formatCurrency(inv.balance_due)}</p>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Payments</h3>
              <p className="text-xs text-slate-500">Inbound receipts and offline settlements</p>
            </div>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            {(data?.recentPayments || []).map((pay) => (
              <div key={pay.id} className="p-4 hover:bg-slate-50/60 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-xs">{pay.payment_number}</p>
                    <p className="text-[11px] text-slate-500">{pay.customer_name} • {pay.payment_method.replace('_', ' ')}</p>
                  </div>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-bold text-emerald-600 text-xs">{formatCurrency(pay.amount)}</p>
                    <p className="text-[10px] text-slate-400">{formatDate(pay.payment_date)}</p>
                  </div>
                  <StatusBadge status={pay.payment_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recurring Billing Confirmation Dialog */}
      <ConfirmDialog
        isOpen={billingConfirmOpen}
        onClose={() => setBillingConfirmOpen(false)}
        onConfirm={handleRunBillingCycle}
        loading={billingRunning}
        title="Execute Recurring Billing Cycle"
        message="This will scan all ACTIVE subscriptions due for renewal, calculate periods, snapshot line items with tax/discount preservation, and generate recurring invoices without duplication."
        confirmText="Execute Billing Run"
      />
    </div>
  );
};
