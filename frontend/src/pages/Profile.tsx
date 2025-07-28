import React, { useState, useEffect, useCallback } from 'react';
import { User, Mail, Lock, Shield, Eye, EyeOff, Camera, Save, RefreshCw, Bell, Clock, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { api, endpoints } from '@/lib/api';

interface ProfileResponse {
  profile: UserProfile;
}

interface ActivityResponse {
  logs: ActivityLog[];
}

interface TwoFactorResponse {
  qr_code: string;
  backup_codes: string[];
}

interface AvatarResponse {
  avatar_url: string;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'operator' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  last_ip?: string;
  login_attempts: number;
  two_factor_enabled: boolean;
  preferences: {
    language: string;
    timezone: string;
    date_format: string;
    notifications_email: boolean;
    notifications_browser: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
  permissions: string[];
  camera_access: string[];
}

interface PasswordChangeData {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

interface ActivityLog {
  id: string;
  action: string;
  description: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [passwordData, setPasswordData] = useState<PasswordChangeData>({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [qrCode, setQrCode] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  
  const tabs = [
    { id: 'profile', name: 'Perfil', icon: User },
    { id: 'security', name: 'Segurança', icon: Shield },
    { id: 'preferences', name: 'Preferências', icon: Globe },
    { id: 'activity', name: 'Atividade', icon: Clock }
  ];
  
  // Carregar perfil do usuário
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      
      const data = await api.get<ProfileResponse>(endpoints.profile.get());
      setProfile(data.profile);
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
      toast.error('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Carregar logs de atividade
  const loadActivityLogs = useCallback(async () => {
    try {
      const data = await api.get<ActivityResponse>(endpoints.profile.getActivity());
      setActivityLogs(data.logs || []);
    } catch (error) {
      console.error('Erro ao carregar logs de atividade:', error);
    }
  }, []);
  
  // Atualizar perfil
  const handleUpdateProfile = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) return;
    
    try {
      setSaving(true);
      
      await api.put(endpoints.profile.update(), {
        full_name: profile.full_name,
        email: profile.email,
        preferences: profile.preferences
      });
      toast.success('Perfil atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      toast.error('Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  }, [profile]);
  
  // Alterar senha
  const handleChangePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('As senhas não coincidem');
      return;
    }
    
    if (passwordData.new_password.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    try {
      await api.post(endpoints.profile.changePassword(), passwordData);
      toast.success('Senha alterada com sucesso');
      setShowPasswordModal(false);
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: ''
      });
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      toast.error('Erro ao alterar senha');
    }
  }, [passwordData]);
  
  // Configurar 2FA
  const handleSetupTwoFactor = useCallback(async () => {
    try {
      const data = await api.post<TwoFactorResponse>(endpoints.profile.setup2FA());
      setQrCode(data.qr_code);
      setBackupCodes(data.backup_codes);
      setShowTwoFactorModal(true);
    } catch (error) {
      console.error('Erro ao configurar 2FA:', error);
      toast.error('Erro ao configurar 2FA');
    }
  }, []);
  
  // Confirmar 2FA
  const handleConfirmTwoFactor = useCallback(async () => {
    if (!twoFactorCode || twoFactorCode.length !== 6) {
      toast.error('Código deve ter 6 dígitos');
      return;
    }
    
    try {
      await api.post(endpoints.profile.confirm2FA(), { code: twoFactorCode });
      toast.success('2FA configurado com sucesso');
      setShowTwoFactorModal(false);
      setTwoFactorCode('');
      loadProfile();
    } catch (error) {
      console.error('Erro ao confirmar 2FA:', error);
      toast.error('Erro ao confirmar 2FA');
    }
  }, [twoFactorCode, loadProfile]);
  
  // Desabilitar 2FA
  const handleDisableTwoFactor = useCallback(async () => {
    if (!confirm('Tem certeza que deseja desabilitar a autenticação de dois fatores?')) {
      return;
    }
    
    try {
      await api.post(endpoints.profile.disable2FA());
      toast.success('2FA desabilitado');
      loadProfile();
    } catch (error) {
      console.error('Erro ao desabilitar 2FA:', error);
      toast.error('Erro ao desabilitar 2FA');
    }
  }, [loadProfile]);
  
  // Upload de avatar
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo deve ter no máximo 2MB');
      return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
      const data = await api.upload<AvatarResponse>(endpoints.profile.uploadAvatar(), formData);
      setProfile(prev => prev ? { ...prev, avatar_url: data.avatar_url } : null);
      toast.success('Avatar atualizado');
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error('Erro ao fazer upload do avatar');
    }
  }, []);
  
  // Atualizar preferência
  const updatePreference = useCallback((key: string, value: string | boolean | number) => {
    setProfile(prev => prev ? {
      ...prev,
      preferences: {
        ...prev.preferences,
        [key]: value
      }
    } : null);
  }, []);
  
  // Effects
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);
  
  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs();
    }
  }, [activeTab, loadActivityLogs]);
  
  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Meu Perfil</h1>
        <p className="text-gray-600">Gerencie suas informações pessoais e configurações</p>
      </div>
      
      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      
      {/* Content */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Perfil */}
        {activeTab === 'profile' && (
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Informações Pessoais</h2>
            
            {/* Avatar */}
            <div className="flex items-center space-x-6">
              <div className="relative">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <label className="absolute bottom-0 right-0 bg-primary-600 text-white p-1 rounded-full cursor-pointer hover:bg-primary-700 transition-colors">
                  <Camera className="w-3 h-3" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">{profile.full_name}</h3>
                <p className="text-gray-600">@{profile.username}</p>
                <p className="text-sm text-gray-500">
                  {profile.role === 'admin' ? 'Administrador' :
                   profile.role === 'operator' ? 'Operador' : 'Visualizador'}
                </p>
              </div>
            </div>
            
            {/* Campos do formulário */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome de usuário
                </label>
                <input
                  type="text"
                  value={profile.username}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Função
                </label>
                <input
                  type="text"
                  value={profile.role === 'admin' ? 'Administrador' :
                         profile.role === 'operator' ? 'Operador' : 'Visualizador'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
            </div>
            
            {/* Informações adicionais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Membro desde
                </label>
                <input
                  type="text"
                  value={new Date(profile.created_at).toLocaleDateString()}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Último login
                </label>
                <input
                  type="text"
                  value={profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Nunca'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </form>
        )}
        
        {/* Segurança */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Configurações de Segurança</h2>
            
            {/* Alterar senha */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Senha</h3>
                  <p className="text-sm text-gray-600">Altere sua senha regularmente para manter sua conta segura</p>
                </div>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  <span>Alterar Senha</span>
                </button>
              </div>
            </div>
            
            {/* Autenticação de dois fatores */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Autenticação de Dois Fatores</h3>
                  <p className="text-sm text-gray-600">
                    {profile.two_factor_enabled 
                      ? 'Sua conta está protegida com 2FA' 
                      : 'Adicione uma camada extra de segurança à sua conta'
                    }
                  </p>
                </div>
                
                {profile.two_factor_enabled ? (
                  <button
                    onClick={handleDisableTwoFactor}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Desabilitar 2FA</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSetupTwoFactor}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Habilitar 2FA</span>
                  </button>
                )}
              </div>
            </div>
            
            {/* Informações de segurança */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-2">Tentativas de Login</h4>
                <p className="text-2xl font-bold text-gray-900">{profile.login_attempts}</p>
                <p className="text-sm text-gray-600">Tentativas falhadas recentes</p>
              </div>
              
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium mb-2">Último IP</h4>
                <p className="text-lg font-mono text-gray-900">{profile.last_ip || 'N/A'}</p>
                <p className="text-sm text-gray-600">Endereço IP do último login</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Preferências */}
        {activeTab === 'preferences' && (
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Preferências</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Idioma
                </label>
                <select
                  value={profile.preferences.language}
                  onChange={(e) => updatePreference('language', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuso Horário
                </label>
                <select
                  value={profile.preferences.timezone}
                  onChange={(e) => updatePreference('timezone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="America/Sao_Paulo">São Paulo (UTC-3)</option>
                  <option value="America/New_York">Nova York (UTC-5)</option>
                  <option value="Europe/London">Londres (UTC+0)</option>
                  <option value="Asia/Tokyo">Tóquio (UTC+9)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Formato de Data
                </label>
                <select
                  value={profile.preferences.date_format}
                  onChange={(e) => updatePreference('date_format', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tema
                </label>
                <select
                  value={profile.preferences.theme}
                  onChange={(e) => updatePreference('theme', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                  <option value="auto">Automático</option>
                </select>
              </div>
            </div>
            
            {/* Notificações */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium">Notificações</h3>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={profile.preferences.notifications_email}
                  onChange={(e) => updatePreference('notifications_email', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="text-sm">Receber notificações por email</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={profile.preferences.notifications_browser}
                  onChange={(e) => updatePreference('notifications_browser', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <Bell className="w-4 h-4 text-gray-500" />
                <span className="text-sm">Receber notificações no navegador</span>
              </label>
            </div>
            
            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? 'Salvando...' : 'Salvar Preferências'}</span>
              </button>
            </div>
          </form>
        )}
        
        {/* Atividade */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Atividade Recente</h2>
            
            {activityLogs.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhuma atividade recente</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activityLogs.map((log) => (
                  <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{log.action}</h4>
                        <p className="text-sm text-gray-600 mt-1">{log.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>IP: {log.ip_address}</span>
                          <span>•</span>
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Modal de alteração de senha */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Alterar Senha</h2>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha atual
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordData.current_password}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, current_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordData.new_password}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, new_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordData.confirm_password}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirm_password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Alterar Senha
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de configuração 2FA */}
      {showTwoFactorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Configurar 2FA</h2>
                <button
                  onClick={() => setShowTwoFactorModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-4">
                    Escaneie o QR code com seu aplicativo autenticador
                  </p>
                  {qrCode && (
                    <img src={qrCode} alt="QR Code" className="mx-auto mb-4" />
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código de verificação
                  </label>
                  <input
                    type="text"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center font-mono text-lg"
                    maxLength={6}
                  />
                </div>
                
                {backupCodes.length > 0 && (
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-medium text-yellow-800 mb-2">Códigos de Backup</h4>
                    <p className="text-sm text-yellow-700 mb-2">
                      Guarde estes códigos em local seguro. Você pode usá-los se perder acesso ao seu dispositivo.
                    </p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                      {backupCodes.map((code, index) => (
                        <div key={index} className="bg-white p-2 rounded border">
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowTwoFactorModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmTwoFactor}
                    disabled={twoFactorCode.length !== 6}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;