import React, { createContext, useContext, useState, useEffect } from 'react';

interface AdminContextType {
  isAuthenticated: boolean;
  adminName: string;
  login: (token: string, username: string) => void;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  isAuthenticated: false,
  adminName: '',
  login: () => {},
  logout: () => {},
});

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const name = localStorage.getItem('admin_name');
    if (token && name) {
      setIsAuthenticated(true);
      setAdminName(name);
    }
  }, []);

  const login = (token: string, username: string) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_name', username);
    setIsAuthenticated(true);
    setAdminName(username);
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    setIsAuthenticated(false);
    setAdminName('');
  };

  return (
    <AdminContext.Provider value={{ isAuthenticated, adminName, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => useContext(AdminContext);

interface CandidateContextType {
  candidate: { id: string; name: string; email: string } | null;
  setCandidate: (c: { id: string; name: string; email: string } | null) => void;
}

const CandidateContext = createContext<CandidateContextType>({
  candidate: null,
  setCandidate: () => {},
});

export const CandidateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [candidate, setCandidateState] = useState<{ id: string; name: string; email: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('candidate');
    if (stored) {
      setCandidateState(JSON.parse(stored));
    }
  }, []);

  const setCandidate = (c: { id: string; name: string; email: string } | null) => {
    if (c) {
      localStorage.setItem('candidate', JSON.stringify(c));
    } else {
      localStorage.removeItem('candidate');
    }
    setCandidateState(c);
  };

  return (
    <CandidateContext.Provider value={{ candidate, setCandidate }}>
      {children}
    </CandidateContext.Provider>
  );
};

export const useCandidate = () => useContext(CandidateContext);
