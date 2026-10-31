import React, { useState, useEffect } from 'react';
import { usersApi } from '../../api/usersApi';
import { useToast } from '../../context/ToastContext';
import { DataTable } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Loader } from '../../components/common/Loader';
import { validatePassword } from '../../utils/validation';
import { formatDate } from '../../utils/formatters';
import { Plus, ShieldCheck, UserCheck, Power, Lock, Mail, User, Phone, CheckCircle2, XCircle } from 'lucide-react';

export const StaffManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
  });

  const { addToast } = useToast();

  const loadUsers = async () => {
    try {
      const { data } = await usersApi.getUsers();
      setUsers(data);
    } catch (err) {
      addToast(err.message || 'Failed to load system users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const pwd = formData.password;
  const pwdChecks = {
    length: pwd.length > 8,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    special: /[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/`~]/.test(pwd),
  };
  const isPasswordValid = pwdChecks.length && pwdChecks.upper && pwdChecks.lower && pwdChecks.special;

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!isPasswordValid) {
      addToast('Password must satisfy all security rules (> 8 characters, upper, lower, special).', 'error');
      return;
    }

    try {
      await usersApi.createStaff(formData);
      addToast(`Staff account for ${formData.full_name} created successfully!`, 'success');
      setModalOpen(false);
      setFormData({ full_name: '', email: '', password: '', phone: '' });
      loadUsers();
    } catch (err) {
      addToast(err.message || 'Failed to create staff account', 'error');
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await usersApi.toggleUserStatus(id);
      addToast('User access status updated', 'info');
      loadUsers();
    } catch (err) {
      addToast(err.message || 'Failed to toggle status', 'error');
    }
  };

  const filterOptions = [
    { label: 'Admin', value: 'ADMIN' },
    { label: 'Staff', value: 'STAFF' },
    { label: 'Customer', value: 'CUSTOMER' },
  ];

  const columns = [
    {
      header: 'Staff Member / User',
      key: 'full_name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs border ${
              row.role === 'ADMIN'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : row.role === 'STAFF'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {row.full_name ? row.full_name[0] : 'U'}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{row.full_name}</p>
            <p className="text-xs text-slate-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Access Role',
      key: 'role',
      sortable: true,
      render: (row) => <StatusBadge status={row.role} />,
    },
    {
      header: 'Company / Org',
      key: 'company_name',
      render: (row) => <span className="text-xs text-slate-600">{row.company_name || 'Internal Operations'}</span>,
    },
    {
      header: 'Phone',
      key: 'phone',
      render: (row) => <span className="text-xs text-slate-500">{row.phone || '—'}</span>,
    },
    {
      header: 'Account Status',
      key: 'is_active',
      render: (row) => (
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {row.is_active ? 'Active' : 'Suspended'}
        </span>
      ),
    },
    {
      header: 'Created On',
      key: 'created_at',
      sortable: true,
      render: (row) => <span className="text-xs text-slate-500">{formatDate(row.created_at)}</span>,
    },
    {
      header: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row) => {
        if (row.role === 'ADMIN') return null; // Protect master admin
        return (
          <button
            onClick={() => handleToggleStatus(row.id)}
            className={`p-1.5 rounded-lg transition-colors ml-auto ${
              row.is_active
                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
            }`}
            title={row.is_active ? 'Suspend Account' : 'Reactivate Account'}
          >
            <Power className="w-4 h-4" />
          </button>
        );
      },
    },
  ];

  if (loading) return <Loader message="Loading team directory..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff & Identity Governance</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md border border-purple-200">
              Admin Exclusive
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create verified internal staff accounts and manage role-based permission profiles
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/30 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff Account</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        searchKey="full_name"
        searchPlaceholder="Search users by name or email..."
        filterKey="role"
        filterOptions={filterOptions}
      />

      {/* Create Staff Account Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Staff Member"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateStaff}
              disabled={!isPasswordValid}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs disabled:opacity-50"
            >
              Provision Staff Account
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateStaff} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Staff Full Name *</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Samantha Ray"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Company Email *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="samantha@brightloop.io"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 014-9921"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Temporary Password *</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Min 9 chars (upper, lower, special)"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Password Validation Checklist */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1 text-slate-600">
            <span className="font-semibold text-slate-500 block text-[10px] uppercase">
              Strict Password Complexity Requirements:
            </span>
            <div className="grid grid-cols-2 gap-1">
              <span className={`flex items-center gap-1 ${pwdChecks.length ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                {pwdChecks.length ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                &gt; 8 characters (9+)
              </span>
              <span className={`flex items-center gap-1 ${pwdChecks.upper ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                {pwdChecks.upper ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Uppercase letter (A-Z)
              </span>
              <span className={`flex items-center gap-1 ${pwdChecks.lower ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                {pwdChecks.lower ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Lowercase letter (a-z)
              </span>
              <span className={`flex items-center gap-1 ${pwdChecks.special ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                {pwdChecks.special ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Special char (@, #, !)
              </span>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
