import React, { useState, useEffect } from 'react';
import { analyticsApi } from '../../api/analyticsApi';
import { useToast } from '../../context/ToastContext';
import { StatCard } from '../../components/common/StatCard';
import { Loader } from '../../components/common/Loader';
import { formatCurrency } from '../../utils/formatters';
import {
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Repeat,
  DollarSign,
  Calendar,
  Layers,
  ArrowUpRight,
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

export const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('6M'); // '3M' | '6M' | '1Y'
  const { addToast } = useToast();

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const { data: res } = await analyticsApi.getDashboardSummary();
        setData(res);
      } catch (err) {
        addToast(err.message || 'Failed to load revenue analytics', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) return <Loader message="Generating business intelligence reports..." />;

  const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  const billingIntervalData = [
    { interval: 'Monthly (1 mo)', subs: 18, mrr: 1782 },
    { interval: 'Quarterly (3 mo)', subs: 5, mrr: 5000 },
    { interval: 'Yearly (12 mo)', subs: 2, mrr: 166.5 },
    { interval: 'Weekly', subs: 1, mrr: 429 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Revenue Analytics & BI</h1>
          <p className="text-xs text-slate-500 mt-1">
            Deep dive into normalized recurring revenue, customer retention, and cash aging
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-semibold self-start sm:self-auto">
          {['3M', '6M', '1Y'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Normalized MRR"
          value={formatCurrency(data?.mrr)}
          subtitle="Normalized monthly recurring"
          trend={12.4}
          trendLabel="vs last quarter"
          icon={TrendingUp}
          color="indigo"
        />

        <StatCard
          title="Annualized Run Rate (ARR)"
          value={formatCurrency(data?.arr)}
          subtitle="MRR x 12 projection"
          trend={12.4}
          trendLabel="annualized"
          icon={DollarSign}
          color="emerald"
        />

        <StatCard
          title="Total Cash Collected"
          value={formatCurrency(data?.totalRevenue)}
          subtitle="Settled transactions"
          trend={18.2}
          trendLabel="cash receipts"
          icon={CreditCard}
          color="purple"
        />

        <StatCard
          title="Unpaid & Overdue"
          value={formatCurrency(data?.totalOutstanding)}
          subtitle={`${data?.overdueCount || 0} overdue invoices`}
          trend={data?.overdueCount > 0 ? -4.1 : 0}
          trendLabel="receivable risk"
          icon={AlertTriangle}
          color={data?.overdueCount > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Main Revenue & MRR Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Recurring Revenue Trajectory</h3>
            <p className="text-xs text-slate-500">Historical performance with normalized MRR curve</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-indigo-600" /> Total Invoiced
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500" /> MRR Normalization
            </span>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.revenueTrend || []}>
              <defs>
                <linearGradient id="anRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="anMrr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                formatter={(val) => [formatCurrency(val), '']}
                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}
              />
              <Area type="monotone" dataKey="revenue" name="Total Revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#anRev)" />
              <Area type="monotone" dataKey="mrr" name="MRR" stroke="#10b981" strokeWidth={2.5} fill="url(#anMrr)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Visualizations: Cadence MRR & Health Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Billing Cadence Breakdown */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900">MRR Contribution by Billing Cadence</h3>
            <p className="text-xs text-slate-500">
              Normalized revenue generated per interval (Daily, Weekly, Monthly, Quarterly)
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={billingIntervalData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="interval" tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip formatter={(val) => [formatCurrency(val), 'Monthly Contribution']} />
                <Bar dataKey="mrr" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subscription Health Status */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900">Subscription Lifecycle Health</h3>
            <p className="text-xs text-slate-500">Breakdown of active, paused, confirmed, and draft states</p>
          </div>

          <div className="h-64 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.statusDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(data?.statusDistribution || []).map((entry, index) => (
                    <Cell key={`status-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
