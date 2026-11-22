import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';
import { UIProvider } from './contexts/UIContext.jsx';
import { ProtectedRoute } from './components/layout/ProtectedRoute.jsx';

// Route-based Code Splitting (React.lazy) — keeps Login/Loading initial load ultra-fast
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const LoadingPage = lazy(() => import('./pages/LoadingPage.jsx'));
const CheckinPage = lazy(() => import('./pages/checkin/CheckinPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage.jsx'));
const TimeCorrectionsPage = lazy(() => import('./pages/TimeCorrectionsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const PersonnelPage = lazy(() => import('./pages/PersonnelPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

function RouteFallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#E7ECE9] dark:bg-[#0B132B]">
      <div className="flex flex-col items-center gap-3 text-emerald-700 dark:text-emerald-400">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        <span className="text-xs font-bold tracking-wide">กำลังโหลดหน้าจอ...</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <UIProvider>
            <HashRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<LoginPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/loading" element={<LoadingPage />} />

                  <Route
                    path="/checkin"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin', 'User']}>
                        <CheckinPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/approvals"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                        <ApprovalsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/time-corrections"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                        <TimeCorrectionsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                        <ReportsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/personnel"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']}>
                        <PersonnelPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin', 'Admin']} requireUsersMenu>
                        <UsersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute allowedRoles={['SuperAdmin']}>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </HashRouter>
          </UIProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
