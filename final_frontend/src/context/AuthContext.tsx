import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';

interface User {
  user_id: string;
  email?: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  login: (token: string) => void;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        // Check if token is expired
        if (decoded.exp * 1000 < Date.now()) {
          logout();
        } else {
          setUser({ user_id: decoded.sub, email: decoded.email });
        }
      } catch (e) {
        logout();
      }
    } else {
      setUser(null);
    }
    setIsLoaded(true);
  }, [token]);

  const login = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const getToken = async () => {
    return token;
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoaded, isSignedIn: !!token, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useUser = () => {
  const context = useAuth();
  return { user: context.user, isLoaded: context.isLoaded, isSignedIn: context.isSignedIn };
};
