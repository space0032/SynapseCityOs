import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import Dashboard from './components/Dashboard';
import MapVisualizer from './components/MapVisualizer';
import './index.css';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, hasRole } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !hasRole(allowedRoles as any)) {
    return <Navigate to="/" replace />;
  }
  
  return <DashboardLayout>{children}</DashboardLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/map" element={<ProtectedRoute><MapVisualizer /></ProtectedRoute>} />
      {/* Placeholders for fleet and alerts to be expanded */}
      <Route path="/fleet" element={<ProtectedRoute allowedRoles={['fleet_manager']}><div className="glass" style={{padding: 24}}><h2>Fleet Management</h2><p>Fleet tracking coming soon.</p></div></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute allowedRoles={['city_operator']}><div className="glass" style={{padding: 24}}><h2>Active Alerts Log</h2><p>Detailed alert logs coming soon.</p></div></ProtectedRoute>} />
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
