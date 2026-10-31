import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('bl_token') || null);
  const [loading, setLoading] = useState(true);

  // Restore authenticated session from backend on initial mount
  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem('bl_token');
      if (!storedToken) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const verifiedUser = await authApi.getCurrentUser();
        setUser(verifiedUser);
        localStorage.setItem('bl_user', JSON.stringify(verifiedUser));
      } catch (err) {
        console.warn('Session expired or invalid token:', err.message);
        localStorage.removeItem('bl_token');
        localStorage.removeItem('bl_user');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { user: loggedUser, token: receivedToken } = await authApi.login(email, password);
      setUser(loggedUser);
      setToken(receivedToken);
      localStorage.setItem('bl_token', receivedToken);
      localStorage.setItem('bl_user', JSON.stringify(loggedUser));
      return loggedUser;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    try {
      const { user: registeredUser, token: receivedToken, message } = await authApi.register(userData);
      setUser(registeredUser);
      setToken(receivedToken);
      localStorage.setItem('bl_token', receivedToken);
      localStorage.setItem('bl_user', JSON.stringify(registeredUser));
      return { user: registeredUser, token: receivedToken, message };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('bl_token');
    localStorage.removeItem('bl_user');
  };

  const value = {
    user,
    token,
    isAuthenticated: Boolean(user && token),
    role: user?.role || 'CUSTOMER',
    isAdmin: user?.role === 'ADMIN',
    isStaff: user?.role === 'STAFF',
    isCustomer: user?.role === 'CUSTOMER',
    isStaffOrAdmin: user?.role === 'ADMIN' || user?.role === 'STAFF',
    login,
    register,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
