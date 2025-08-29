/**
 * API Client para NewCAM
 * Configuração centralizada para chamadas HTTP
 */

const getAPIBaseURL = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  // Se VITE_API_URL é um caminho relativo (produção), usar o domínio atual
  if (apiUrl && apiUrl.startsWith('/')) {
    return `${window.location.origin}${apiUrl}`;
  }
  
  // Se VITE_API_URL é uma URL completa, usar como está
  if (apiUrl && (apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
    return apiUrl;
  }
  
  // Fallback para desenvolvimento local
  return apiUrl || '/api';
};

// Exportar função para uso em outros componentes
export { getAPIBaseURL };

const API_BASE_URL = getAPIBaseURL();

class ApiClient {
  private baseURL: string;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  private async refreshToken(): Promise<string | null> {
    // Evitar múltiplas tentativas simultâneas de refresh
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async performTokenRefresh(): Promise<string | null> {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        console.warn('[ApiClient] Refresh token não encontrado');
        return null;
      }

      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        console.warn('[ApiClient] Falha no refresh do token');
        return null;
      }

      const data = await response.json();
      const newToken = data.tokens?.accessToken || data.accessToken;
      
      if (newToken) {
        localStorage.setItem('token', newToken);
        if (data.tokens?.refreshToken) {
          localStorage.setItem('refreshToken', data.tokens.refreshToken);
        }
        console.log('[ApiClient] Token renovado com sucesso');
        return newToken;
      }

      return null;
    } catch (error) {
      console.error('[ApiClient] Erro ao renovar token:', error);
      return null;
    }
  }

  private async handleResponse<T>(response: Response, originalRequest?: () => Promise<Response>): Promise<T> {
    // Se recebeu 401 e temos uma requisição original para retry
    if (response.status === 401 && originalRequest) {
      console.log('[ApiClient] Erro 401 detectado, tentando renovar token...');
      
      const newToken = await this.refreshToken();
      if (newToken) {
        console.log('[ApiClient] Token renovado, repetindo requisição...');
        // Repetir a requisição original com o novo token
        const retryResponse = await originalRequest();
        return this.handleResponse<T>(retryResponse);
      } else {
        console.warn('[ApiClient] Não foi possível renovar token, redirecionando para login');
        // Limpar tokens inválidos
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        // Disparar evento para o AuthContext saber que precisa fazer logout
        window.dispatchEvent(new CustomEvent('auth:token-expired'));
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseURL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
      });
    }

    const makeRequest = () => fetch(url.toString(), {
      method: 'GET',
      headers: this.getAuthHeaders()
    });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const makeRequest = () => fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const makeRequest = () => fetch(`${this.baseURL}${endpoint}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  async delete<T>(endpoint: string, data?: any): Promise<T> {
    const makeRequest = () => fetch(`${this.baseURL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined
    });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  // Método específico para upload de arquivos
  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: formData
    });

    return this.handleResponse<T>(response);
  }

  // Método específico para download de arquivos
  async download(endpoint: string): Promise<Response> {
    const makeRequest = () => fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: this.getAuthHeaders()
    });

    const response = await makeRequest();
    
    // Para downloads, se receber 401, tentar refresh e repetir
    if (response.status === 401) {
      console.log('[ApiClient] Erro 401 no download, tentando renovar token...');
      const newToken = await this.refreshToken();
      if (newToken) {
        console.log('[ApiClient] Token renovado, repetindo download...');
        const retryResponse = await makeRequest();
        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }
        return retryResponse;
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response;
  }
}

// Instância singleton do cliente API
export const api = new ApiClient(API_BASE_URL);

// Tipos de resposta padrão
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    pagination: {
      current_page: number;
      total_pages: number;
      total_count: number;
      per_page: number;
      has_prev: boolean;
      has_next: boolean;
    };
  };
  timestamp?: string;
}

// Funções auxiliares para endpoints específicos
export const endpoints = {
  // Métricas
  metrics: {
    getAll: () => '/metrics',
    getByCategory: (category: string) => `/metrics/${category}`,
    getHistory: (category: string) => `/metrics/${category}/history`,
    getAlerts: () => '/metrics/system/alerts',
    startCollection: () => '/metrics/collection/start',
    stopCollection: () => '/metrics/collection/stop',
    forceCollection: () => '/metrics/collection/force',
    getStatus: () => '/metrics/collection/status'
  },
  
  // Logs
  logs: {
    getAll: () => '/logs',
    export: (format: 'csv' | 'json') => `/logs/export?format=${format}`,
    getServices: () => '/logs/services',
    cleanup: () => '/logs/cleanup'
  },
  
  // Câmeras
  cameras: {
    getAll: () => '/cameras',
    getById: (id: string) => `/cameras/${id}`,
    create: () => '/cameras',
    update: (id: string) => `/cameras/${id}`,
    delete: (id: string) => `/cameras/${id}`,
    getStream: (id: string) => `/cameras/${id}/stream`,
    startRecording: (id: string) => `/cameras/${id}/recording/start`,
    stopRecording: (id: string) => `/cameras/${id}/recording/stop`,
    testConnection: (id: string) => `/cameras/${id}/test-connection`
  },
  
  // Streams
   streams: {
     getAll: () => '/streams',
     getById: (id: string) => `/streams/${id}`,
     start: (cameraId: string) => `/streams/${cameraId}/start`,
     stop: (streamId: string) => `/streams/${streamId}/stop`,
     join: (streamId: string) => `/streams/${streamId}/join`,
     leave: (streamId: string) => `/streams/${streamId}/leave`,
     getStats: () => '/streams/stats'
   },
   
   // Gravações
  recordings: {
    getAll: () => '/recordings',
    getById: (id: string) => `/recordings/${id}`,
    getActive: () => '/recordings/active',
    delete: (id: string) => `/recordings/${id}`,
    deleteMultiple: () => '/recordings',
    download: (id: string) => `/recordings/${id}/download`,
    getStats: () => '/recordings/stats',
    getTrends: () => '/recordings/trends',
    stop: (id: string) => `/recordings/${id}/stop`,
    cleanup: () => '/recordings/cleanup',
    export: () => '/recordings/export',
    exportStatus: (jobId: string) => `/recordings/export/${jobId}/status`,
    getSegments: (id: string) => `/recordings/${id}/segments`,
    // Gravação Contínua
    enableContinuous: () => '/recordings/continuous/enable',
    disableContinuous: () => '/recordings/continuous/disable',
    getContinuousStatus: (cameraId: string) => `/recordings/continuous/status/${cameraId}`,
    getContinuousOverview: () => '/recordings/continuous/overview'
  },

  // Relatórios
  reports: {
    dashboard: () => '/reports/dashboard',
    activity: () => '/reports/activity',
    cameraUsage: () => '/reports/camera-usage',
    export: () => '/reports/export',
    generate: () => '/reports/generate'
  },

  // Arquivos
  files: {
    list: () => '/files',
    search: () => '/files/search',
    stats: () => '/files/stats',
    info: (filename: string) => `/files/${filename}/info`,
    download: (filename: string) => `/files/${filename}/download`,
    upload: () => '/files/upload',
    delete: (filename: string) => `/files/${filename}`,
    move: (filename: string) => `/files/${filename}/move`
  },

  // Usuários
  users: {
    getAll: () => '/users',
    getById: (id: string) => `/users/${id}`,
    create: () => '/users',
    update: (id: string) => `/users/${id}`,
    delete: (id: string) => `/users/${id}`,
    updatePassword: (id: string) => `/users/${id}/password`,
    updateStatus: (id: string) => `/users/${id}/status`,
    resetPassword: (id: string) => `/users/${id}/reset-password`,
    approve: (id: string) => `/users/${id}/approve`,
    suspend: (id: string) => `/users/${id}/suspend`,
    activate: (id: string) => `/users/${id}/activate`,
    getStats: () => '/users/stats',
    export: () => '/users/export'
  },
  
  // Autenticação
  auth: {
    login: () => '/auth/login',
    register: () => '/auth/register',
    logout: () => '/auth/logout',
    refresh: () => '/auth/refresh',
    me: () => '/auth/me',
    profile: () => '/auth/profile'
  },

  // Perfil
  profile: {
    get: () => '/profile',
    update: () => '/profile',
    getActivity: () => '/profile/activity',
    changePassword: () => '/profile/change-password',
    setup2FA: () => '/profile/2fa/setup',
    confirm2FA: () => '/profile/2fa/confirm',
    disable2FA: () => '/profile/2fa/disable',
    uploadAvatar: () => '/profile/avatar'
  },

  // Configurações
  settings: {
    get: () => '/settings',
    update: () => '/settings',
    getStorage: () => '/settings/storage',
    testEmail: () => '/settings/test-email',
    testBackup: () => '/settings/test-backup',
    cleanupLogs: () => '/settings/cleanup-logs',
    cleanupRecordings: () => '/settings/cleanup-recordings'
  },

  // Segurança
  security: {
    getEvents: () => '/security/events',
    getStats: () => '/security/stats',
    getSettings: () => '/security/settings',
    updateSettings: () => '/security/settings',
    getSessions: () => '/security/sessions',
    terminateSession: (id: string) => `/security/sessions/${id}`,
    exportEvents: () => '/security/events/export'
  },



  // Arquivo
  archive: {
    getRecordings: () => '/archive/recordings',
    getStats: () => '/archive/stats',
    getCameras: () => '/archive/cameras'
  },

  // Saúde da Autenticação
  health: {
    auth: () => '/health/auth',
    alerts: () => '/health/auth/alerts',
    resolveAlert: (alertId: string) => `/health/auth/alerts/${alertId}/resolve`,
    system: () => '/health/system'
  },

  // Alertas
  alerts: {
    getStatus: () => '/alerts/status',
    start: () => '/alerts/start',
    stop: () => '/alerts/stop',
    getSettings: () => '/alerts/settings',
    updateSettings: () => '/alerts/settings',
    getLogs: () => '/alerts/logs',
    getRecipients: () => '/alerts/recipients',
    addRecipient: () => '/alerts/recipients',
    updateRecipient: (id: string) => `/alerts/recipients/${id}`,
    deleteRecipient: (id: string) => `/alerts/recipients/${id}`,
    test: () => '/alerts/test',
    getMetrics: () => '/alerts/metrics'
  }
};