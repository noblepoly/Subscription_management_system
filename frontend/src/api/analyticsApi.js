import { apiRequest, mockStore } from './client';
import { normalizeMRR } from '../utils/formatters';

export const analyticsApi = {
  async getDashboardSummary() {
    return apiRequest(
      '/analytics/dashboard',
      { method: 'GET' },
      async () => {
        const subs = mockStore.subscriptions;
        const invoices = mockStore.invoices;
        const payments = mockStore.payments;

        const activeSubs = subs.filter((s) => s.status === 'ACTIVE');

        // Calculate normalized MRR across all active subscriptions
        const mrr = activeSubs.reduce((sum, s) => {
          return sum + normalizeMRR(s.recurring_total, s.billing_interval, s.interval_count);
        }, 0);

        const arr = mrr * 12;

        // Total revenue collected from confirmed payments
        const confirmedPayments = payments.filter((p) => p.payment_status === 'CONFIRMED');
        const totalRevenue = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);

        // Outstanding & Overdue invoices
        const now = new Date();
        let totalOutstanding = 0;
        let overdueCount = 0;
        let overdueAmount = 0;

        invoices.forEach((inv) => {
          if (inv.status !== 'PAID' && inv.status !== 'CANCELLED') {
            totalOutstanding += inv.balance_due;
            if (new Date(inv.due_date) < now && inv.balance_due > 0) {
              overdueCount++;
              overdueAmount += inv.balance_due;
            }
          }
        });

        // Revenue trend data for charts (Last 6 months)
        const revenueTrend = [
          { month: 'Sep', revenue: 14200, mrr: 11200, newSubs: 8 },
          { month: 'Oct', revenue: 16800, mrr: 12500, newSubs: 12 },
          { month: 'Nov', revenue: 19500, mrr: 14100, newSubs: 15 },
          { month: 'Dec', revenue: 22400, mrr: 15800, newSubs: 18 },
          { month: 'Jan', revenue: 25900, mrr: 17200, newSubs: 22 },
          { month: 'Feb', revenue: totalRevenue > 0 ? totalRevenue : 28400, mrr: Math.round(mrr) || 18900, newSubs: activeSubs.length || 25 },
        ];

        // Subscription status distribution
        const statusCounts = subs.reduce((acc, s) => {
          acc[s.status] = (acc[s.status] || 0) + 1;
          return acc;
        }, {});

        const statusDistribution = Object.keys(statusCounts).map((status) => ({
          name: status,
          value: statusCounts[status],
        }));

        // Plan distribution
        const planCounts = subs.reduce((acc, s) => {
          acc[s.plan_name] = (acc[s.plan_name] || 0) + 1;
          return acc;
        }, {});

        const planDistribution = Object.keys(planCounts).map((plan) => ({
          name: plan,
          value: planCounts[plan],
        }));

        return {
          activeSubscriptionsCount: activeSubs.length,
          totalSubscriptionsCount: subs.length,
          mrr: Number(mrr.toFixed(2)),
          arr: Number(arr.toFixed(2)),
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalOutstanding: Number(totalOutstanding.toFixed(2)),
          overdueCount,
          overdueAmount: Number(overdueAmount.toFixed(2)),
          revenueTrend,
          statusDistribution,
          planDistribution,
          recentInvoices: invoices.slice(0, 5),
          recentPayments: payments.slice(0, 5),
        };
      }
    );
  },
};
