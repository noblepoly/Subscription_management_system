import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/authApi';
import { mockStore } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('bl_user');
      if (savedUser) return JSON.parse(savedUser);
      // Default to Admin demo user on first load
      return mockStore.users[0];
    } catch {
      return mockStore.users[0];
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('bl_token') || 'demo-admin-token');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem('bl_user', JSON.stringify(user));
      localStorage.setItem('bl_user_id', user.id);
    } else {
      localStorage.removeItem('bl_user');
      localStorage.removeItem('bl_user_id');
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('bl_token', token);
    } else {
      localStorage.removeItem('bl_token');
    }
  }, [token]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      setUser(data.user);
      setToken(data.token);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    try {
      const { data } = await authApi.register(userData);
      setUser(data.user);
      setToken(data.token);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('bl_user');
    localStorage.removeItem('bl_token');
    localStorage.removeItem('bl_user_id');
  };

  /**
   * Hackathon helper: switch instantly between user roles (ADMIN, STAFF, CUSTOMER)
   * to test role-specific view guards and capabilities.
   */
  const switchDemoRole = (role) => {
    const targetUser = mockStore.users.find((u) => u.role === role) || mockStore.users[0];
    setUser({ ...targetUser });
    setToken(`demo-${role.toLowerCase()}-token`);
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
    switchDemoRole,
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
