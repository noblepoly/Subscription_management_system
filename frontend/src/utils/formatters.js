/**
 * Currency & Number Formatters
 */
export const formatCurrency = (amount, currency = 'USD') => {
  const num = Number(amount) || 0;
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(num);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

export const normalizeMRR = (amount, interval, intervalCount = 1) => {
  const amt = Number(amount) || 0;
  const count = Math.max(1, Number(intervalCount) || 1);
  const intv = (interval || 'MONTHLY').toUpperCase();

  switch (intv) {
    case 'MONTHLY':
      return amt / count;
    case 'YEARLY':
      return amt / (12 * count);
    case 'WEEKLY':
      return (amt / count) * (52 / 12);
    case 'DAILY':
      return (amt / count) * 30;
    default:
      return amt / count;
  }
};
