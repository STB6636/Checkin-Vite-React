import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AuthService } from '../core/AuthService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => AuthService.getCurrentUser(false));
  const [verifying, setVerifying] = useState(false);

  const refreshUser = useCallback(() => {
    setUser(AuthService.getCurrentUser(true));
  }, []);

  const login = useCallback(async (username, password, loginMode = 'checkin') => {
    const result = await AuthService.login(username, password, loginMode);
    if (result.success) {
      setUser(AuthService.getCurrentUser(false));
    }
    return result;
  }, []);

  const logout = useCallback(() => {
    AuthService.clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;
    const current = AuthService.getCurrentUser(false);
    if (!current) return undefined;

    setVerifying(true);
    AuthService.verifySessionWithDatabase()
      .then((valid) => {
        if (!active) return;
        if (valid) {
          setUser(AuthService.getCurrentUser(false));
        } else {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const permissions = useMemo(() => {
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin' || isSuperAdmin;
    const canViewUsersMenu = Boolean(
      isSuperAdmin || (user?.role === 'Admin' && (user.visibility_level === 'all' || user.visibility_level === 'bureau'))
    );
    const scopeLabel = isSuperAdmin
      ? 'ผู้ดูแลระบบสูงสุด (ทุกหน่วยงาน)'
      : user?.role === 'Admin'
        ? user.visibility_level === 'division'
          ? `ขอบเขต: ${user.scope_division || 'ส่วน/ฝ่าย'}`
          : user.visibility_level === 'bureau'
            ? `ขอบเขต: ${user.scope_bureau || 'สำนักงาน/กอง'}`
            : 'ขอบเขต: ทั้งหมด'
        : 'ผู้ใช้งานทั่วไป';

    return {
      isSuperAdmin,
      isAdmin,
      canViewUsersMenu,
      scopeLabel,
      canEditAttendance: (record = null) => AuthService.canEditAttendanceRecord(user, record),
      canDeleteAttendance: (record = null) => AuthService.canDeleteAttendanceRecord(user, record),
      canApproveCorrection: (req) => AuthService.canApproveTimeCorrection(user, req),
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, verifying, login, logout, refreshUser, ...permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
