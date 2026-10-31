import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';

// Operations & Core Pages
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { PlansPage } from './pages/plans/PlansPage';
import { QuotationsPage } from './pages/quotations/QuotationsPage';
import { SubscriptionsPage } from './pages/subscriptions/SubscriptionsPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { DiscountsTaxesPage } from './pages/discounts-taxes/DiscountsTaxesPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { StaffManagementPage } from './pages/staff/StaffManagementPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';

// Customer Self-Service Portal
import { CustomerPortalPage } from './pages/portal/CustomerPortalPage';

const RootRedirect = () => {
  const { isAuthenticated, isCustomer } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={isCustomer ? '/portal' : '/dashboard'} replace />;
};

export const App = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected Routes Inside App Shell */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                {/* Default Index Route */}
                <Route path="/" element={<RootRedirect />} />

                {/* Operations & Management: Admin and Staff */}
                <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'STAFF']} />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/subscriptions" element={<SubscriptionsPage />} />
                  <Route path="/quotations" element={<QuotationsPage />} />
                  <Route path="/invoices" element={<InvoicesPage />} />
                  <Route path="/payments" element={<PaymentsPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/plans" element={<PlansPage />} />
                  <Route path="/discounts-taxes" element={<DiscountsTaxesPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                </Route>

                {/* Administration Only: Admin Exclusive */}
                <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                  <Route path="/staff" element={<StaffManagementPage />} />
                </Route>

                {/* Customer Self-Service Portal: Accessible by Customers (and Admin/Staff for inspection) */}
                <Route element={<ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'STAFF']} />}>
                  <Route path="/portal" element={<CustomerPortalPage />} />
                  <Route path="/portal/subscriptions" element={<CustomerPortalPage />} />
                  <Route path="/portal/invoices" element={<CustomerPortalPage />} />
                  <Route path="/portal/payments" element={<CustomerPortalPage />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback Catch-All */}
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
