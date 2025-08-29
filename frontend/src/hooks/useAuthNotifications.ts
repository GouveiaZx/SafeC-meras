import { toast } from 'sonner';

interface AuthNotificationOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

export const useAuthNotifications = () => {
  const showTokenRefreshSuccess = (options?: AuthNotificationOptions) => {
    toast.success('🔄 Token renovado automaticamente', {
      description: 'Sua sessão foi estendida com sucesso',
      duration: 3000,
      ...options
    });
  };

  const showTokenRefreshError = (error?: string, options?: AuthNotificationOptions) => {
    toast.error('❌ Erro na renovação do token', {
      description: error || 'Não foi possível renovar sua sessão. Faça login novamente.',
      duration: 5000,
      ...options
    });
  };

  const showTokenExpired = (options?: AuthNotificationOptions) => {
    toast.warning('⏰ Sessão expirada', {
      description: 'Sua sessão expirou. Redirecionando para login...',
      duration: 4000,
      ...options
    });
  };

  const showLoginSuccess = (userName?: string, options?: AuthNotificationOptions) => {
    toast.success('✅ Login realizado com sucesso', {
      description: userName ? `Bem-vindo(a), ${userName}!` : 'Bem-vindo(a) de volta!',
      duration: 3000,
      ...options
    });
  };

  const showLoginError = (error?: string, options?: AuthNotificationOptions) => {
    toast.error('❌ Erro no login', {
      description: error || 'Credenciais inválidas. Verifique seu email e senha.',
      duration: 5000,
      ...options
    });
  };

  const showLogoutSuccess = (options?: AuthNotificationOptions) => {
    toast.success('👋 Logout realizado', {
      description: 'Você foi desconectado com sucesso',
      duration: 2000,
      ...options
    });
  };

  const showRegistrationSuccess = (options?: AuthNotificationOptions) => {
    toast.success('🎉 Conta criada com sucesso', {
      description: 'Sua conta foi criada. Faça login para continuar.',
      duration: 4000,
      ...options
    });
  };

  const showRegistrationError = (error?: string, options?: AuthNotificationOptions) => {
    toast.error('❌ Erro no cadastro', {
      description: error || 'Não foi possível criar sua conta. Tente novamente.',
      duration: 5000,
      ...options
    });
  };

  const showUnauthorizedAccess = (options?: AuthNotificationOptions) => {
    toast.error('🚫 Acesso negado', {
      description: 'Você não tem permissão para acessar este recurso',
      duration: 4000,
      ...options
    });
  };

  const showNetworkError = (options?: AuthNotificationOptions) => {
    toast.error('🌐 Erro de conexão', {
      description: 'Verifique sua conexão com a internet e tente novamente',
      duration: 5000,
      ...options
    });
  };

  const showSessionWarning = (minutesLeft: number, options?: AuthNotificationOptions) => {
    toast.warning('⚠️ Sessão expirando', {
      description: `Sua sessão expirará em ${minutesLeft} minutos. Salve seu trabalho.`,
      duration: 8000,
      ...options
    });
  };

  const showMaintenanceMode = (options?: AuthNotificationOptions) => {
    toast.info('🔧 Modo de manutenção', {
      description: 'O sistema está em manutenção. Tente novamente em alguns minutos.',
      duration: 6000,
      ...options
    });
  };

  return {
    showTokenRefreshSuccess,
    showTokenRefreshError,
    showTokenExpired,
    showLoginSuccess,
    showLoginError,
    showLogoutSuccess,
    showRegistrationSuccess,
    showRegistrationError,
    showUnauthorizedAccess,
    showNetworkError,
    showSessionWarning,
    showMaintenanceMode
  };
};

export default useAuthNotifications;