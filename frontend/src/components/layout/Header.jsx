import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../common/StatusBadge';
import { Menu, LogOut } from 'lucide-react';

export const Header = ({ onMenuClick }) => {
  const { user, role, logout } = useAuth();

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

      {/* Right: Authenticated User Badge & Verified Role */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Real Backend Verified Role Badge */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 hidden md:inline">Authenticated as:</span>
          <StatusBadge status={role} />
        </div>

        {/* User Pill */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center text-xs shadow-xs">
            {user?.full_name ? user.full_name[0] : 'U'}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-800 leading-tight">{user?.full_name}</p>
            <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{user?.email}</p>
          </div>

          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
