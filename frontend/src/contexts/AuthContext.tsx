import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, endpoints } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  userType: 'ADMIN' | 'INTEGRATOR' | 'CLIENT';
  isActive: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  userType: 'ADMIN' | 'INTEGRATOR' | 'CLIENT';
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        
        // Limpar tokens inválidos do localStorage
        const cleanToken = storedToken === 'undefined' || storedToken === 'null' || !storedToken ? null : storedToken;
        const cleanUser = storedUser === 'undefined' || storedUser === 'null' || !storedUser ? null : storedUser;
        
        console.log('AuthContext - Token do localStorage:', { storedToken, cleanToken });

        if (cleanToken && cleanUser) {
          setToken(cleanToken);
          setUser(JSON.parse(cleanUser));
          
          // Verify token is still valid
          try {
            const response = await api.get<{ user: any }>(endpoints.auth.me());
            setUser(response.user);
          } catch (error) {
            // Token is invalid, clear auth state
            logout();
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await api.post<{ tokens: { accessToken: string }, user: any }>(endpoints.auth.login(), { email, password });
      
      const { tokens, user: userData } = response;
      const newToken = tokens.accessToken;
      
      // Map backend user data to frontend format
      const mappedUser = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        userType: userData.role?.toUpperCase() || 'CLIENT',
        isActive: userData.active,
        createdAt: userData.created_at
      };
      
      // Store in state
      setToken(newToken);
      setUser(mappedUser);
      
      // Store in localStorage
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(mappedUser));
      
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erro ao fazer login';
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: RegisterData): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Map frontend data to backend format
      const backendData = {
        name: userData.name,
        email: userData.email,
        password: userData.password,
        userType: userData.userType
      };
      
      // Try public registration first
      await api.post(endpoints.auth.register(), backendData);
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erro ao criar conta';
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    // Clear state
    setUser(null);
    setToken(null);
    
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const updateUser = (userData: Partial<User>): void => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    register,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;