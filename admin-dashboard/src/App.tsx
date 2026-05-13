import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Role } from './context/AuthContext';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import Dashboard from './components/Dashboard';
import MapVisualizer from './components/MapVisualizer';
import FleetManagement from './components/FleetManagement';
import ActiveAlerts from './components/ActiveAlerts';
import './index.css';

/** Redirect fleet_manager to /fleet, city_operator to /alerts, admin/other to / */
function RoleDefaultRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'fleet_manager') return <Navigate to="/fleet" replace />;
  if (user.role === 'city_operator') return <Navigate to="/alerts" replace />;
  return <Navigate to="/dashboard" replace />;
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: Role[] }) {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !hasRole(allowedRoles)) return <Navigate to="/" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Role-based smart redirect from root */}
      <Route path="/" element={<RoleDefaultRedirect />} />

      {/* Shared pages */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/map"       element={<ProtectedRoute><MapVisualizer /></ProtectedRoute>} />

      {/* Fleet manager only */}
      <Route path="/fleet"  element={<ProtectedRoute allowedRoles={['fleet_manager']}><FleetManagement /></ProtectedRoute>} />

      {/* City operator only */}
      <Route path="/alerts" element={<ProtectedRoute allowedRoles={['city_operator']}><ActiveAlerts /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
