import React from 'react';

const STATUS_CONFIGS = {
  // Subscription / Plan / Quotation
  ACTIVE: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20', dot: 'bg-emerald-500', label: 'Active' },
  CONFIRMED: { bg: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-600/20', dot: 'bg-blue-500', label: 'Confirmed' },
  DRAFT: { bg: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-600/20', dot: 'bg-slate-400', label: 'Draft' },
  QUOTATION: { bg: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-600/20', dot: 'bg-purple-500', label: 'Quotation' },
  PAUSED: { bg: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20', dot: 'bg-amber-500', label: 'Paused' },
  CLOSED: { bg: 'bg-slate-200 text-slate-800 border-slate-300 ring-slate-600/20', dot: 'bg-slate-500', label: 'Closed' },
  CANCELLED: { bg: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-600/20', dot: 'bg-rose-500', label: 'Cancelled' },

  // Invoice / Payment
  PAID: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20', dot: 'bg-emerald-500', label: 'Paid' },
  PARTIALLY_PAID: { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-600/20', dot: 'bg-indigo-500', label: 'Partially Paid' },
  OVERDUE: { bg: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-600/20 animate-pulse', dot: 'bg-rose-500', label: 'Overdue' },
  PENDING_VERIFICATION: { bg: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20', dot: 'bg-amber-500', label: 'Verification Pending' },

  // User Roles
  ADMIN: { bg: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-600/20', dot: 'bg-purple-500', label: 'Admin' },
  STAFF: { bg: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-600/20', dot: 'bg-blue-500', label: 'Staff' },
  CUSTOMER: { bg: 'bg-teal-50 text-teal-700 border-teal-200 ring-teal-600/20', dot: 'bg-teal-500', label: 'Customer' },
};

export const StatusBadge = ({ status, className = '' }) => {
  const norm = (status || '').toUpperCase();
  const config = STATUS_CONFIGS[norm] || {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    label: status || 'Unknown',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-xs ${config.bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};
