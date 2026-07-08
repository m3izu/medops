import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const timeoutTimerRef = useRef(null);

  // Checks current session status on mount
  const checkSession = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
      setPermissions(response.data.permissions || {});
      setSessionTimeoutMinutes(response.data.sessionTimeoutMinutes || 30);
    } catch (err) {
      setUser(null);
      setPermissions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Inactivity timeout handling
  const resetInactivityTimer = useCallback(() => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }
    if (user) {
      timeoutTimerRef.current = setTimeout(() => {
        logout(true); // logout due to inactivity
      }, sessionTimeoutMinutes * 60 * 1000);
    }
  }, [user, sessionTimeoutMinutes]);

  useEffect(() => {
    if (!user) {
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      return;
    }

    // Set up listeners for activity
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    const handleActivity = () => resetInactivityTimer();

    events.forEach(event => window.addEventListener(event, handleActivity));
    resetInactivityTimer(); // Initial timer start

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, [user, resetInactivityTimer]);

  const login = async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    setUser(response.data.user);
    setPermissions(response.data.permissions || {});
    setSessionTimeoutMinutes(response.data.sessionTimeoutMinutes || 30);
    return response.data;
  };

  const logout = async (dueToInactivity = false) => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      setUser(null);
      setPermissions({});
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (dueToInactivity) {
        alert('You have been logged out due to inactivity.');
      }
      window.location.href = '/login';
    }
  };

  const hasPermission = (permissionKey) => {
    return !!permissions[permissionKey];
  };

  return (
    <AuthContext.Provider value={{ user, permissions, hasPermission, login, logout, loading, sessionTimeoutMinutes, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
