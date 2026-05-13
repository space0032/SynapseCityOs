import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type Role = 'admin' | 'city_operator' | 'fleet_manager';

interface User {
  username: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, role: Role) => void;
  logout: () => void;
  hasRole: (role: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('synapse_auth_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const login = (username: string, role: Role) => {
    const newUser = { username, role };
    setUser(newUser);
    localStorage.setItem('synapse_auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('synapse_auth_user');
  };

  const hasRole = (roles: Role[]) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin has all permissions
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
