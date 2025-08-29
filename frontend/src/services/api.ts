import axios from 'axios';
import { toast } from 'sonner';

// Create axios instance with base configuration
const getBaseURL = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  // Se VITE_API_URL é um caminho relativo (produção), usar o domínio atual
  if (apiUrl && apiUrl.startsWith('/')) {
    return `${window.location.origin}${apiUrl}`;
  }
  
  // Se VITE_API_URL é uma URL completa ou não definida, usar como está
  return apiUrl || '/api';
};

export const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and token refresh
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Try to refresh token
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          console.log('🔄 API Interceptor: Tentando refresh do token...');
          toast.info('🔄 Renovando sessão...', {
            description: 'Aguarde enquanto renovamos sua sessão',
            duration: 2000
          });
          
          const refreshResponse = await fetch(`${api.defaults.baseURL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken })
          });
          
          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            const newToken = data.tokens.accessToken;
            
            // Update stored token
            localStorage.setItem('token', newToken);
            
            // Update original request with new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            
            console.log('✅ API Interceptor: Token renovado, repetindo requisição');
            toast.success('✅ Sessão renovada', {
              description: 'Sua sessão foi renovada automaticamente',
              duration: 3000
            });
            
            // Retry original request
            return api(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error('❌ API Interceptor: Erro no refresh:', refreshError);
        toast.error('❌ Erro na renovação', {
          description: 'Não foi possível renovar sua sessão',
          duration: 4000
        });
      }
      
      // If refresh failed, clear auth data and redirect
      console.log('🚪 API Interceptor: Redirecionando para login');
      toast.warning('⏰ Sessão expirada', {
        description: 'Redirecionando para login...',
        duration: 3000
      });
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/auth/login')) {
        window.location.href = 'https://nuvem.safecameras.com.br/auth/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;