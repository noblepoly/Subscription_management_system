import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, ShieldAlert, ChevronDown, Check } from 'lucide-react';

export const Header = ({ onMenuClick }) => {
  const { user, role, switchDemoRole } = useAuth();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const roles = [
    { id: 'ADMIN', label: 'Admin (Full Access)', desc: 'Alex Mercer (Admin)' },
    { id: 'STAFF', label: 'Staff (Operations)', desc: 'Samantha Ray (Staff)' },
    { id: 'CUSTOMER', label: 'Customer (Self-Service)', desc: 'Sarah Connor (Customer)' },
  ];

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Mobile Toggle & Context */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:block">
          <p className="text-xs font-medium text-slate-400">Workspace</p>
          <h2 className="text-sm font-semibold text-slate-800">Brightloop Subscription Platform</h2>
        </div>
      </div>

      {/* Right: Quick Role Switcher + User Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Interactive Role Switcher */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
            title="Switch demo role to preview permissions"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
            <span>Role: <strong className="text-indigo-600">{role}</strong></span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 text-xs">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Switch Role Context
              </p>
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    switchDemoRole(r.id);
                    setRoleMenuOpen(false);
                  }}
                  className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition-colors ${
                    role === r.id ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <p>{r.label}</p>
                    <p className="text-[10px] text-slate-400 font-normal">{r.desc}</p>
                  </div>
                  {role === r.id && <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shadow-xs">
            {user?.full_name ? user.full_name[0] : 'U'}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-800 leading-tight">{user?.full_name}</p>
            <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{user?.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
