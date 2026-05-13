import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../context/AuthContext';
import { Key, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function Login() {
  const { login, user } = useAuth();
  const [username, setUsername] = useState('admin');
  const [role, setRole] = useState<Role>('admin');
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(username, role);
    navigate('/', { replace: true });
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100%', position: 'relative', zIndex: 10 }}>
      <div className="glass" style={{ padding: '40px', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <img src={logo} alt="SynapseCity OS Logo" style={{ margin: '0 auto 24px', height: '64px', width: 'auto', objectFit: 'contain', display: 'block' }} />
        <h2 style={{ margin: '0 0 8px', fontSize: '24px' }}>SynapseCity Access</h2>
        <p style={{ margin: '0 0 32px', color: 'var(--text-secondary)', fontSize: '14px' }}>Sign in to continue to the Admin Dashboard.</p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '0 12px' }}>
              <User size={18} color="var(--text-secondary)" />
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                style={{ width: '100%', padding: '14px 12px', background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '15px' }} 
                placeholder="Username"
                required
              />
            </div>
          </div>
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '0 12px' }}>
              <Key size={18} color="var(--text-secondary)" />
              <select 
                value={role} 
                onChange={e => setRole(e.target.value as Role)}
                style={{ width: '100%', padding: '14px 12px', background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '15px', appearance: 'none' }}
              >
                <option value="admin" style={{ color: 'black' }}>System Administrator</option>
                <option value="city_operator" style={{ color: 'black' }}>City Operator</option>
                <option value="fleet_manager" style={{ color: 'black' }}>Fleet Manager</option>
              </select>
            </div>
          </div>
          
          <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--accent-cyan)', color: '#0f172a', fontWeight: 700, fontSize: '15px', cursor: 'pointer', marginTop: '12px' }}>
            Authenticate
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          * Mock authentication for testing phase.
        </div>
      </div>
    </div>
  );
}
