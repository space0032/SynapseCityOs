import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Map as MapIcon, Truck, LogOut, ShieldAlert } from 'lucide-react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      
      {/* Sidebar */}
      <aside className="glass" style={{ width: 'var(--sidebar-width)', margin: '16px', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--panel-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--accent-cyan)', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#0f172a' }}>SC</div>
            <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 700 }}>Synapse<span style={{ color: 'var(--accent-cyan)' }}>City</span> OS</h1>
          </div>
        </div>

        <div style={{ padding: '24px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{user?.username}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{user?.role.replace('_', ' ')}</div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <NavLink to="/" end style={({isActive}) => ({
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', textDecoration: 'none',
            color: isActive ? 'white' : 'var(--text-secondary)', background: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent'
          })}>
            <LayoutDashboard size={20} color="var(--accent-cyan)" /> Dashboard
          </NavLink>

          <NavLink to="/map" style={({isActive}) => ({
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', textDecoration: 'none',
            color: isActive ? 'white' : 'var(--text-secondary)', background: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent'
          })}>
            <MapIcon size={20} color="var(--accent-green)" /> Geospatial Map
          </NavLink>

          {hasRole(['fleet_manager']) && (
            <NavLink to="/fleet" style={({isActive}) => ({
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', textDecoration: 'none',
              color: isActive ? 'white' : 'var(--text-secondary)', background: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent'
            })}>
              <Truck size={20} color="var(--accent-orange)" /> Fleet Management
            </NavLink>
          )}

          {hasRole(['city_operator']) && (
            <NavLink to="/alerts" style={({isActive}) => ({
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', textDecoration: 'none',
              color: isActive ? 'white' : 'var(--text-secondary)', background: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent'
            })}>
              <ShieldAlert size={20} color="var(--accent-red)" /> Active Alerts
            </NavLink>
          )}
        </nav>

        <div style={{ padding: '24px' }}>
          <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'transparent', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '16px 32px 32px 16px', overflowY: 'auto', zIndex: 10 }} className="animate-fade-in">
        {children}
      </main>
    </div>
  );
}
