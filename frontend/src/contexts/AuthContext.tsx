import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { api, endpoints } from '@/lib/api';
import { useAuthNotifications } from '@/hooks/useAuthNotifications';

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
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  refreshAuthToken: () => Promise<boolean>;
  isTokenExpired: () => boolean;
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
  const authNotifications = useAuthNotifications();
  
  // Initialize state with localStorage data immediately to prevent UI flicker
  const getInitialState = () => {
    try {
      const storedToken = localStorage.getItem('token');
      const storedRefreshToken = localStorage.getItem('refreshToken');
      const storedUser = localStorage.getItem('user');
      
      // Limpar tokens inválidos do localStorage
      const cleanToken = storedToken === 'undefined' || storedToken === 'null' || !storedToken ? null : storedToken;
      const cleanRefreshToken = storedRefreshToken === 'undefined' || storedRefreshToken === 'null' || !storedRefreshToken ? null : storedRefreshToken;
      const cleanUser = storedUser === 'undefined' || storedUser === 'null' || !storedUser ? null : storedUser;
      
      if (cleanToken && cleanUser) {
        return {
          token: cleanToken,
          refreshToken: cleanRefreshToken,
          user: JSON.parse(cleanUser)
        };
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error);
    }
    return { token: null, refreshToken: null, user: null };
  };

  const initialState = getInitialState();
  const [user, setUser] = useState<User | null>(initialState.user);
  const [token, setToken] = useState<string | null>(initialState.token);
  const [refreshToken, setRefreshToken] = useState<string | null>(initialState.refreshToken);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Função para verificar se o token está expirado
  const isTokenExpired = useCallback((): boolean => {
    if (!token) return true;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const bufferTime = 300; // 5 minutos de buffer
      
      return payload.exp <= (currentTime + bufferTime);
    } catch (error) {
      console.error('Erro ao verificar expiração do token:', error);
      return true;
    }
  }, [token]);

  // Função para refresh do token
  const refreshAuthToken = useCallback(async (): Promise<boolean> => {
    if (!refreshToken) {
      console.log('🔄 Sem refresh token disponível');
      return false;
    }

    try {
      console.log('🔄 Tentando refresh do token...');
      const response = await api.post<{ tokens: { accessToken: string } }>(endpoints.auth.refresh(), {
        refreshToken
      });

      const newToken = response.tokens.accessToken;
      setToken(newToken);
      localStorage.setItem('token', newToken);
      
      console.log('✅ Token refreshed com sucesso');
      authNotifications.showTokenRefreshSuccess();
      scheduleTokenRefresh(newToken);
      return true;
    } catch (error: any) {
      console.error('❌ Erro ao fazer refresh do token:', error);
      
      const errorMessage = error.response?.data?.message || error.message || 'Erro na renovação do token';
      authNotifications.showTokenRefreshError(errorMessage);
      
      logout();
      return false;
    }
  }, [refreshToken]);

  // Função para agendar o próximo refresh
  const scheduleTokenRefresh = useCallback((currentToken: string) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    try {
      const payload = JSON.parse(atob(currentToken.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const expirationTime = payload.exp;
      const refreshTime = expirationTime - 600; // 10 minutos antes da expiração
      const timeUntilRefresh = (refreshTime - currentTime) * 1000;

      if (timeUntilRefresh > 0) {
        console.log(`⏰ Próximo refresh agendado em ${Math.floor(timeUntilRefresh / 1000 / 60)} minutos`);
        refreshTimeoutRef.current = setTimeout(() => {
          refreshAuthToken();
        }, timeUntilRefresh);
      } else {
        // Token já está próximo da expiração, fazer refresh imediatamente
        console.log('⚡ Token próximo da expiração, fazendo refresh imediato');
        refreshAuthToken();
      }
    } catch (error) {
      console.error('Erro ao agendar refresh:', error);
    }
  }, [refreshAuthToken]);

  // Verify token validity after initial load
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        if (token && user) {
          // Verificar se o token está expirado
          if (isTokenExpired()) {
            console.log('🔄 Token expirado, tentando refresh...');
            const refreshSuccess = await refreshAuthToken();
            if (!refreshSuccess) {
              setIsLoading(false);
              return;
            }
          } else {
            // Token ainda válido, agendar próximo refresh
            scheduleTokenRefresh(token);
          }

          // Verify token is still valid with backend
          try {
            const response = await api.get<{ user: any }>(endpoints.auth.me());
            // Update user data if needed
            const mappedUser = {
              id: response.user.id,
              name: response.user.name,
              email: response.user.email,
              userType: response.user.userType || response.user.role?.toUpperCase() || 'CLIENT',
              isActive: response.user.active,
              createdAt: response.user.created_at
            };
            setUser(mappedUser);
            localStorage.setItem('user', JSON.stringify(mappedUser));
          } catch (error) {
            // Token is invalid, try refresh first
            console.log('❌ Token inválido no backend, tentando refresh...');
            const refreshSuccess = await refreshAuthToken();
            if (!refreshSuccess) {
              logout();
            }
          }
        }
      } catch (error) {
        console.error('Error verifying auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    verifyAuth();
  }, [isTokenExpired, refreshAuthToken, scheduleTokenRefresh]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);



  const login = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await api.post<{ tokens: { accessToken: string; refreshToken: string }, user: any }>(endpoints.auth.login(), { email, password });
      
      console.log('🔍 [AuthContext] Login response completa:', response);
      
      const { tokens, user: userData } = response;
      const newToken = tokens.accessToken;
      const newRefreshToken = tokens.refreshToken;
      
      console.log('🔍 [AuthContext] Tokens extraídos:', {
        newToken: typeof newToken === 'string' ? newToken.substring(0, 50) + '...' : newToken,
        newRefreshToken: typeof newRefreshToken === 'string' ? newRefreshToken.substring(0, 50) + '...' : newRefreshToken,
        tokenType: typeof newToken,
        refreshTokenType: typeof newRefreshToken
      });
      
      // Validar que o token é realmente uma string
      if (typeof newToken !== 'string' || !newToken) {
        throw new Error(`Token inválido recebido do servidor. Tipo: ${typeof newToken}, Valor: ${newToken}`);
      }
      
      if (typeof newRefreshToken !== 'string' || !newRefreshToken) {
        throw new Error(`Refresh token inválido recebido do servidor. Tipo: ${typeof newRefreshToken}, Valor: ${newRefreshToken}`);
      }
      
      // Map backend user data to frontend format
      const mappedUser = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        userType: userData.userType || userData.role?.toUpperCase() || 'CLIENT',
        isActive: userData.active,
        createdAt: userData.created_at
      };
      
      console.log('🔍 [AuthContext] Usuário mapeado:', mappedUser);
      
      // Store in state
      setToken(newToken);
      setRefreshToken(newRefreshToken);
      setUser(mappedUser);
      
      // Store in localStorage
      localStorage.setItem('token', newToken);
      localStorage.setItem('refreshToken', newRefreshToken);
      localStorage.setItem('user', JSON.stringify(mappedUser));
      
      console.log('🔍 [AuthContext] Dados salvos no localStorage:', {
        tokenSaved: localStorage.getItem('token')?.substring(0, 50) + '...',
        refreshTokenSaved: localStorage.getItem('refreshToken')?.substring(0, 50) + '...',
        userSaved: localStorage.getItem('user')
      });
      
      // Show success notification
      authNotifications.showLoginSuccess(mappedUser.name);
      
      // Agendar refresh automático
      scheduleTokenRefresh(newToken);
      
    } catch (error: any) {
      console.error('🔍 [AuthContext] Erro no login:', error);
      const message = error.response?.data?.message || 'Erro ao fazer login';
      authNotifications.showLoginError(message);
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
      
      // Show success notification
      authNotifications.showRegistrationSuccess();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erro ao criar conta';
      authNotifications.showRegistrationError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    // Clear timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    // Show logout notification
    authNotifications.showLogoutSuccess();
    
    // Clear state
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  };

  const updateUser = (userData: Partial<User>): void => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  // Escutar evento de token expirado do ApiClient
  useEffect(() => {
    const handleTokenExpired = () => {
      console.log('[AuthContext] Token expirado detectado pelo ApiClient, fazendo logout...');
      logout();
    };

    window.addEventListener('auth:token-expired', handleTokenExpired);
    
    return () => {
      window.removeEventListener('auth:token-expired', handleTokenExpired);
    };
  }, [logout]);

  const value: AuthContextType = {
    user,
    token,
    refreshToken,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    register,
    logout,
    updateUser,
    refreshAuthToken,
    isTokenExpired
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