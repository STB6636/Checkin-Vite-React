import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';

export function ProtectedRoute({ allowedRoles = ['SuperAdmin', 'Admin', 'User'], requireUsersMenu = false, children }) {
  const location = useLocation();
  const { user, canViewUsersMenu } = useAuth();

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    const fallback = user.role === 'User' ? '/checkin' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  if (requireUsersMenu && !canViewUsersMenu) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
