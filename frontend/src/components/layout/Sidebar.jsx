import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  FileText,
  Repeat,
  Receipt,
  CreditCard,
  Percent,
  Users,
  ShieldCheck,
  BarChart3,
  UserCheck,
  LogOut,
  Sparkles,
} from 'lucide-react';

export const Sidebar = ({ isOpen, onClose }) => {
  const { user, role, isAdmin, isCustomer, logout } = useAuth();
  const navigate = useNavigate();

  // Navigation schema with role gating
  const adminStaffNav = [
    {
      group: 'Overview',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Analytics & Reports', path: '/analytics', icon: BarChart3 },
      ],
    },
    {
      group: 'Operations',
      items: [
        { label: 'Subscriptions', path: '/subscriptions', icon: Repeat },
        { label: 'Quotations', path: '/quotations', icon: FileText },
        { label: 'Invoices', path: '/invoices', icon: Receipt },
        { label: 'Payments', path: '/payments', icon: CreditCard },
      ],
    },
    {
      group: 'Catalog & Rules',
      items: [
        { label: 'Products & Variants', path: '/products', icon: Package },
        { label: 'Subscription Plans', path: '/plans', icon: CalendarDays },
        { label: 'Discounts & Taxes', path: '/discounts-taxes', icon: Percent },
      ],
    },
    {
      group: 'People',
      items: [
        { label: 'Customers', path: '/customers', icon: Users },
        ...(isAdmin
          ? [{ label: 'Staff Management', path: '/staff', icon: ShieldCheck, adminOnly: true }]
          : []),
      ],
    },
  ];

  const customerNav = [
    {
      group: 'Customer Portal',
      items: [
        { label: 'Portal Overview', path: '/portal', icon: UserCheck },
        { label: 'My Subscriptions', path: '/portal/subscriptions', icon: Repeat },
        { label: 'My Invoices & Bills', path: '/portal/invoices', icon: Receipt },
        { label: 'Make Payment', path: '/portal/payments', icon: CreditCard },
      ],
    },
  ];

  const navSections = isCustomer ? customerNav : adminStaffNav;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Shell */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              Brightloop
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                SaaS
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Subscription Platform</p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {navSections.map((section) => (
            <div key={section.group}>
              <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {section.group}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => onClose && onClose()}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
              {user?.full_name ? user.full_name[0] : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.full_name || 'User'}</p>
              <span className="inline-block text-[10px] font-medium text-slate-400 truncate">
                {role}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
