import { apiRequest, mockStore } from './client';

export const invoicesApi = {
  async getInvoices(params = {}) {
    return apiRequest(
      '/invoices',
      { method: 'GET' },
      async () => {
        let list = mockStore.invoices.map((inv) => {
          // Check dynamic overdue status
          const isOverdue =
            inv.balance_due > 0 &&
            inv.status !== 'PAID' &&
            inv.status !== 'CANCELLED' &&
            inv.status !== 'DRAFT' &&
            new Date(inv.due_date) < new Date();

          const effectiveStatus = isOverdue ? 'OVERDUE' : inv.status;
          return {
            ...inv,
            status: effectiveStatus,
            is_overdue: isOverdue,
          };
        });

        if (params.customerId) {
          list = list.filter((i) => i.customer_id === params.customerId);
        }
        if (params.status && params.status !== 'ALL') {
          list = list.filter((i) => i.status === params.status);
        }
        return list;
      }
    );
  },

  async getInvoiceById(id) {
    return apiRequest(
      `/invoices/${id}`,
      { method: 'GET' },
      async () => {
        const inv = mockStore.invoices.find((i) => i.id === id);
        if (!inv) throw new Error('Invoice not found');
        const payments = mockStore.payments.filter((p) => p.invoice_id === id);
        return { ...inv, payments };
      }
    );
  },

  async runRecurringBillingCycle() {
    return apiRequest(
      '/billing/run-cycle',
      { method: 'POST' },
      async () => {
        const activeSubs = mockStore.subscriptions.filter(
          (s) => s.status === 'ACTIVE'
        );

        let generatedCount = 0;
        const newInvoiceNumbers = [];

        for (const sub of activeSubs) {
          const invCount = mockStore.invoices.length + 1;
          const invNumber = `INV-2026-${String(invCount).padStart(5, '0')}`;
          const startDate = new Date().toISOString().split('T')[0];
          const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          // Check if invoice already exists for this exact period (Duplicate prevention)
          const duplicate = mockStore.invoices.some(
            (i) =>
              i.subscription_id === sub.id &&
              i.billing_period_start === startDate &&
              i.billing_period_end === endDate
          );

          if (!duplicate) {
            const invoice = {
              id: `inv-${Date.now()}-${generatedCount}`,
              invoice_number: invNumber,
              subscription_id: sub.id,
              subscription_number: sub.subscription_number,
              customer_id: sub.customer_id,
              customer_name: sub.customer_name,
              customer_email: sub.customer_email,
              status: 'CONFIRMED',
              billing_period_start: startDate,
              billing_period_end: endDate,
              invoice_date: startDate,
              due_date: dueDate,
              subtotal: sub.subtotal,
              discount_amount: sub.discount_amount,
              tax_amount: sub.tax_amount,
              total_amount: sub.recurring_total,
              amount_paid: 0.0,
              balance_due: sub.recurring_total,
              notes: `Automated recurring cycle run for ${sub.subscription_number}`,
              created_at: new Date().toISOString(),
              items: sub.items.map((it, idx) => ({
                id: `ii-gen-${Date.now()}-${idx}`,
                product_name: it.product_name,
                variant_name: it.variant_name,
                quantity: it.quantity,
                applied_unit_price: it.unit_price,
                applied_additional_price: it.additional_price || 0,
                discount_allocation: 0,
                tax_rate: 18.0,
                tax_amount: Number(((it.line_total * 0.18)).toFixed(2)),
                line_total: it.line_total,
              })),
            };

            mockStore.invoices.unshift(invoice);
            newInvoiceNumbers.push(invNumber);
            generatedCount++;
          }
        }

        mockStore.persist('invoices');
        return {
          processed_subscriptions: activeSubs.length,
          invoices_generated: generatedCount,
          invoice_numbers: newInvoiceNumbers,
          message: `Billing cycle executed. ${generatedCount} new invoice(s) generated.`,
        };
      }
    );
  },
};
