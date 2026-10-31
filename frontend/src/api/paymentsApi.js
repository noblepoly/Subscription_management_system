import { apiRequest, mockStore } from './client';

export const paymentsApi = {
  async getPayments(params = {}) {
    return apiRequest('/payments', { method: 'GET' }, async () => {
      let list = [...mockStore.payments];
      if (params.customerId) {
        list = list.filter((p) => p.customer_id === params.customerId);
      }
      if (params.status && params.status !== 'ALL') {
        list = list.filter((p) => p.payment_status === params.status);
      }
      return list;
    });
  },

  async recordPayment(paymentData) {
    return apiRequest(
      '/payments',
      {
        method: 'POST',
        body: JSON.stringify(paymentData),
      },
      async () => {
        const invoice = mockStore.invoices.find((i) => i.id === paymentData.invoice_id);
        if (!invoice) throw new Error('Invoice not found');

        const amount = Number(paymentData.amount) || 0;
        if (amount <= 0) throw new Error('Payment amount must be greater than zero');
        if (amount > invoice.balance_due) {
          throw new Error(`Payment cannot exceed outstanding balance due (${invoice.balance_due.toFixed(2)})`);
        }

        const isOnlineSim = paymentData.payment_method === 'ONLINE_MOCK_SIMULATED';
        // Offline payments created by staff or customers require verification unless verified by staff
        const initialStatus = isOnlineSim || paymentData.verified_by_staff ? 'CONFIRMED' : 'PENDING_VERIFICATION';

        const payCount = mockStore.payments.length + 1;
        const paymentNumber = `PAY-2026-${String(payCount).padStart(5, '0')}`;

        const newPayment = {
          id: `pay-${Date.now()}`,
          payment_number: paymentNumber,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          customer_name: invoice.customer_name,
          recorded_by: paymentData.recorded_by || null,
          recorder_name: paymentData.recorder_name || (isOnlineSim ? 'System / Online Simulation' : 'Staff Member'),
          amount,
          payment_method: paymentData.payment_method || 'BANK_TRANSFER',
          payment_status: initialStatus,
          transaction_reference: paymentData.transaction_reference || (isOnlineSim ? `SIM-TXN-${Date.now().toString().slice(-6)}` : `REF-${Date.now().toString().slice(-6)}`),
          payment_date: new Date().toISOString(),
          notes: isOnlineSim ? `[SIMULATION] ${paymentData.notes || 'Simulated card checkout'}` : paymentData.notes || '',
        };

        mockStore.payments.unshift(newPayment);

        // If payment is CONFIRMED, update the invoice balance and status immediately
        if (initialStatus === 'CONFIRMED') {
          invoice.amount_paid = Number((invoice.amount_paid + amount).toFixed(2));
          invoice.balance_due = Math.max(0, Number((invoice.balance_due - amount).toFixed(2)));
          if (invoice.balance_due === 0) {
            invoice.status = 'PAID';
          } else {
            invoice.status = 'PARTIALLY_PAID';
          }
          mockStore.persist('invoices');
        }

        mockStore.persist('payments');
        return newPayment;
      }
    );
  },

  async verifyPayment(paymentId, staffId) {
    return apiRequest(
      `/payments/${paymentId}/verify`,
      {
        method: 'POST',
        body: JSON.stringify({ staff_id: staffId }),
      },
      async () => {
        const payment = mockStore.payments.find((p) => p.id === paymentId);
        if (!payment) throw new Error('Payment not found');
        if (payment.payment_status === 'CONFIRMED') {
          throw new Error('Payment has already been verified.');
        }

        const invoice = mockStore.invoices.find((i) => i.id === payment.invoice_id);
        if (invoice) {
          invoice.amount_paid = Number((invoice.amount_paid + payment.amount).toFixed(2));
          invoice.balance_due = Math.max(0, Number((invoice.balance_due - payment.amount).toFixed(2)));
          if (invoice.balance_due === 0) {
            invoice.status = 'PAID';
          } else {
            invoice.status = 'PARTIALLY_PAID';
          }
          mockStore.persist('invoices');
        }

        payment.payment_status = 'CONFIRMED';
        payment.recorded_by = staffId;
        payment.recorder_name = 'Verified by Staff';
        mockStore.persist('payments');
        return payment;
      }
    );
  },
};
