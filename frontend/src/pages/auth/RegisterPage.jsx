import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { validatePassword } from '../../utils/validation';
import { Sparkles, Lock, Mail, User, Building, Phone, MapPin, CheckCircle2, XCircle } from 'lucide-react';

export const RegisterPage = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    company_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
    billing_address: '',
  });

  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Real-time password checklist
  const pwd = formData.password;
  const checks = {
    length: pwd.length > 8,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    special: /[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/`~]/.test(pwd),
    match: pwd.length > 0 && pwd === formData.confirm_password,
  };

  const isPasswordValid = checks.length && checks.upper && checks.lower && checks.special;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isPasswordValid) {
      addToast('Password must satisfy all security rules (> 8 chars, upper, lower, special).', 'error');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      addToast('Passwords do not match.', 'error');
      return;
    }

    setLoading(true);
    try {
      await register(formData);
      addToast('Account created successfully! Welcome to Brightloop.', 'success');
      navigate('/portal');
    } catch (err) {
      addToast(err.message || 'Registration failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 py-8">
      <div className="max-w-lg w-full">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 items-center justify-center text-white shadow-lg shadow-indigo-500/30 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Create Customer Account</h1>
          <p className="text-xs text-slate-400 mt-1">Start managing your software subscriptions today</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Sarah Connor"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Company Name</label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="Cyberdyne Systems"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="sarah@cyberdyne.io"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 019-2834"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Billing Address</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <textarea
                  rows="2"
                  value={formData.billing_address}
                  onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
                  placeholder="100 Tech Blvd, Silicon Valley, CA 94025"
                  className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min. 9 characters"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={formData.confirm_password}
                    onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Password Validation Checklist */}
            <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700/60 text-[11px] space-y-1.5 text-slate-300">
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                Backend Password Security Rules:
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <span className={`flex items-center gap-1.5 ${checks.length ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {checks.length ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  More than 8 chars (9+)
                </span>
                <span className={`flex items-center gap-1.5 ${checks.upper ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {checks.upper ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  Uppercase letter (A-Z)
                </span>
                <span className={`flex items-center gap-1.5 ${checks.lower ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {checks.lower ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  Lowercase letter (a-z)
                </span>
                <span className={`flex items-center gap-1.5 ${checks.special ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {checks.special ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  Special character (@, $, #, !)
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isPasswordValid}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
            Sign In here
          </Link>
        </p>
      </div>
    </div>
  );
};
