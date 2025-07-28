import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Database, Shield, Bell, Video, Network, HardDrive, Mail, Globe, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, endpoints } from '@/lib/api';

interface CleanupResponse {
  deleted_files?: number;
  deleted_count?: number;
  message: string;
}

interface SettingsResponse {
  settings: SystemSettings;
}

interface StorageResponse {
  storage: StorageInfo;
}

interface SystemSettings {
  // Configurações gerais
  system_name: string;
  timezone: string;
  language: string;
  date_format: string;
  time_format: string;
  
  // Configurações de segurança
  session_timeout: number;
  max_login_attempts: number;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_numbers: boolean;
  password_require_symbols: boolean;
  two_factor_required: boolean;
  
  // Configurações de gravação
  default_recording_quality: 'low' | 'medium' | 'high' | 'ultra';
  max_recording_duration: number;
  auto_delete_recordings: boolean;
  auto_delete_days: number;
  recording_path: string;
  
  // Configurações de streaming
  max_concurrent_streams: number;
  stream_timeout: number;
  enable_webrtc: boolean;
  enable_hls: boolean;
  hls_segment_duration: number;
  
  // Configurações de rede
  rtsp_port: number;
  http_port: number;
  https_enabled: boolean;
  https_port: number;
  
  // Configurações de notificação
  email_enabled: boolean;
  email_smtp_host: string;
  email_smtp_port: number;
  email_smtp_user: string;
  email_smtp_password: string;
  email_from: string;
  
  // Configurações de backup
  backup_enabled: boolean;
  backup_schedule: string;
  backup_retention_days: number;
  backup_path: string;
  
  // Configurações de logs
  log_level: 'debug' | 'info' | 'warn' | 'error';
  log_retention_days: number;
  log_max_size: number;
}

interface StorageInfo {
  total_space: number;
  used_space: number;
  free_space: number;
  recordings_size: number;
  logs_size: number;
  backups_size: number;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingBackup, setTestingBackup] = useState(false);
  
  const tabs = [
    { id: 'general', name: 'Geral', icon: Globe },
    { id: 'security', name: 'Segurança', icon: Shield },
    { id: 'recording', name: 'Gravação', icon: Video },
    { id: 'streaming', name: 'Streaming', icon: Network },
    { id: 'notifications', name: 'Notificações', icon: Bell },
    { id: 'backup', name: 'Backup', icon: Database },
    { id: 'storage', name: 'Armazenamento', icon: HardDrive },
    { id: 'logs', name: 'Logs', icon: AlertTriangle }
  ];
  
  // Carregar configurações
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      const data = await api.get<SettingsResponse>(endpoints.settings.get());
      setSettings(data.settings);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Carregar informações de armazenamento
  const loadStorageInfo = useCallback(async () => {
    try {
      const data = await api.get<StorageResponse>(endpoints.settings.getStorage());
      setStorageInfo(data.storage);
    } catch (error) {
      console.error('Erro ao carregar informações de armazenamento:', error);
    }
  }, []);
  
  // Salvar configurações
  const handleSaveSettings = useCallback(async () => {
    if (!settings) return;
    
    try {
      setSaving(true);
      
      await api.put(endpoints.settings.update(), settings);
      toast.success('Configurações salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  }, [settings]);
  
  // Testar email
  const handleTestEmail = useCallback(async () => {
    try {
      setTestingEmail(true);
      
      await api.post(endpoints.settings.testEmail());
      toast.success('Email de teste enviado com sucesso');
    } catch (error) {
      console.error('Erro ao testar email:', error);
      toast.error('Erro ao testar email');
    } finally {
      setTestingEmail(false);
    }
  }, []);
  
  // Testar backup
  const handleTestBackup = useCallback(async () => {
    try {
      setTestingBackup(true);
      
      await api.post(endpoints.settings.testBackup());
      toast.success('Backup de teste criado com sucesso');
    } catch (error) {
      console.error('Erro ao testar backup:', error);
      toast.error('Erro ao testar backup');
    } finally {
      setTestingBackup(false);
    }
  }, []);
  
  // Limpar logs antigos
  const handleCleanLogs = useCallback(async () => {
    if (!confirm('Tem certeza que deseja limpar logs antigos?')) {
      return;
    }
    
    try {
      const data = await api.post<CleanupResponse>(endpoints.settings.cleanupLogs());
      toast.success(`${data.deleted_files || 0} arquivos de log removidos`);
      loadStorageInfo();
    } catch (error) {
      console.error('Erro ao limpar logs:', error);
      toast.error('Erro ao limpar logs');
    }
  }, [loadStorageInfo]);
  
  // Limpar gravações antigas
  const handleCleanRecordings = useCallback(async () => {
    if (!confirm('Tem certeza que deseja limpar gravações antigas?')) {
      return;
    }
    
    try {
      const data = await api.post<CleanupResponse>(endpoints.settings.cleanupRecordings());
      toast.success(`${data.deleted_count || 0} gravações removidas`);
      loadStorageInfo();
    } catch (error) {
      console.error('Erro ao limpar gravações:', error);
      toast.error('Erro ao limpar gravações');
    }
  }, [loadStorageInfo]);
  
  // Atualizar configuração
  const updateSetting = useCallback((key: keyof SystemSettings, value: unknown) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
  }, []);
  
  // Formatar bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Effects
  useEffect(() => {
    loadSettings();
    loadStorageInfo();
  }, [loadSettings, loadStorageInfo]);
  
  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações do Sistema</h1>
        <p className="text-gray-600">Gerencie as configurações e preferências do sistema</p>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64">
          <div className="bg-white rounded-lg shadow-md p-4">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1">
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Configurações Gerais */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Configurações Gerais</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do Sistema
                    </label>
                    <input
                      type="text"
                      value={settings.system_name}
                      onChange={(e) => updateSetting('system_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fuso Horário
                    </label>
                    <select
                      value={settings.timezone}
                      onChange={(e) => updateSetting('timezone', e.target.value)}
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
                      Idioma
                    </label>
                    <select
                      value={settings.language}
                      onChange={(e) => updateSetting('language', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="pt-BR">Português (Brasil)</option>
                      <option value="en-US">English (US)</option>
                      <option value="es-ES">Español</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Formato de Data
                    </label>
                    <select
                      value={settings.date_format}
                      onChange={(e) => updateSetting('date_format', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            {/* Configurações de Segurança */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Configurações de Segurança</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timeout de Sessão (minutos)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      value={settings.session_timeout}
                      onChange={(e) => updateSetting('session_timeout', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Máximo de Tentativas de Login
                    </label>
                    <input
                      type="number"
                      min="3"
                      max="10"
                      value={settings.max_login_attempts}
                      onChange={(e) => updateSetting('max_login_attempts', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tamanho Mínimo da Senha
                    </label>
                    <input
                      type="number"
                      min="6"
                      max="32"
                      value={settings.password_min_length}
                      onChange={(e) => updateSetting('password_min_length', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-lg font-medium">Requisitos de Senha</h3>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.password_require_uppercase}
                      onChange={(e) => updateSetting('password_require_uppercase', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Exigir letras maiúsculas</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.password_require_lowercase}
                      onChange={(e) => updateSetting('password_require_lowercase', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Exigir letras minúsculas</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.password_require_numbers}
                      onChange={(e) => updateSetting('password_require_numbers', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Exigir números</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.password_require_symbols}
                      onChange={(e) => updateSetting('password_require_symbols', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Exigir símbolos</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.two_factor_required}
                      onChange={(e) => updateSetting('two_factor_required', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Exigir autenticação de dois fatores</span>
                  </label>
                </div>
              </div>
            )}
            
            {/* Configurações de Gravação */}
            {activeTab === 'recording' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Configurações de Gravação</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Qualidade Padrão
                    </label>
                    <select
                      value={settings.default_recording_quality}
                      onChange={(e) => updateSetting('default_recording_quality', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="low">Baixa (480p)</option>
                      <option value="medium">Média (720p)</option>
                      <option value="high">Alta (1080p)</option>
                      <option value="ultra">Ultra (4K)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duração Máxima (minutos)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={settings.max_recording_duration}
                      onChange={(e) => updateSetting('max_recording_duration', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Caminho de Gravação
                    </label>
                    <input
                      type="text"
                      value={settings.recording_path}
                      onChange={(e) => updateSetting('recording_path', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.auto_delete_recordings}
                      onChange={(e) => updateSetting('auto_delete_recordings', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Deletar gravações automaticamente</span>
                  </label>
                  
                  {settings.auto_delete_recordings && (
                    <div className="ml-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Deletar após (dias)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={settings.auto_delete_days}
                        onChange={(e) => updateSetting('auto_delete_days', parseInt(e.target.value))}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Configurações de Streaming */}
            {activeTab === 'streaming' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Configurações de Streaming</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Máximo de Streams Simultâneos
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={settings.max_concurrent_streams}
                      onChange={(e) => updateSetting('max_concurrent_streams', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timeout de Stream (segundos)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={settings.stream_timeout}
                      onChange={(e) => updateSetting('stream_timeout', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duração do Segmento HLS (segundos)
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="10"
                      value={settings.hls_segment_duration}
                      onChange={(e) => updateSetting('hls_segment_duration', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-lg font-medium">Protocolos de Streaming</h3>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.enable_webrtc}
                      onChange={(e) => updateSetting('enable_webrtc', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Habilitar WebRTC</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.enable_hls}
                      onChange={(e) => updateSetting('enable_hls', e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm">Habilitar HLS</span>
                  </label>
                </div>
              </div>
            )}
            
            {/* Configurações de Notificação */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Configurações de Email</h2>
                  <button
                    onClick={handleTestEmail}
                    disabled={testingEmail || !settings.email_enabled}
                    className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingEmail ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    <span>Testar Email</span>
                  </button>
                </div>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.email_enabled}
                    onChange={(e) => updateSetting('email_enabled', e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium">Habilitar notificações por email</span>
                </label>
                
                {settings.email_enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Servidor SMTP
                      </label>
                      <input
                        type="text"
                        value={settings.email_smtp_host}
                        onChange={(e) => updateSetting('email_smtp_host', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Porta SMTP
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={settings.email_smtp_port}
                        onChange={(e) => updateSetting('email_smtp_port', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Usuário SMTP
                      </label>
                      <input
                        type="text"
                        value={settings.email_smtp_user}
                        onChange={(e) => updateSetting('email_smtp_user', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Senha SMTP
                      </label>
                      <input
                        type="password"
                        value={settings.email_smtp_password}
                        onChange={(e) => updateSetting('email_smtp_password', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Remetente
                      </label>
                      <input
                        type="email"
                        value={settings.email_from}
                        onChange={(e) => updateSetting('email_from', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Configurações de Backup */}
            {activeTab === 'backup' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Configurações de Backup</h2>
                  <button
                    onClick={handleTestBackup}
                    disabled={testingBackup || !settings.backup_enabled}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingBackup ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4" />
                    )}
                    <span>Testar Backup</span>
                  </button>
                </div>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.backup_enabled}
                    onChange={(e) => updateSetting('backup_enabled', e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium">Habilitar backup automático</span>
                </label>
                
                {settings.backup_enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Agendamento (Cron)
                      </label>
                      <input
                        type="text"
                        value={settings.backup_schedule}
                        onChange={(e) => updateSetting('backup_schedule', e.target.value)}
                        placeholder="0 2 * * *"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">Exemplo: 0 2 * * * (todo dia às 2h)</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Retenção (dias)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={settings.backup_retention_days}
                        onChange={(e) => updateSetting('backup_retention_days', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Caminho de Backup
                      </label>
                      <input
                        type="text"
                        value={settings.backup_path}
                        onChange={(e) => updateSetting('backup_path', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Informações de Armazenamento */}
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Informações de Armazenamento</h2>
                
                {storageInfo && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-primary-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <HardDrive className="w-8 h-8 text-primary-500 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-600">Espaço Total</p>
                            <p className="text-xl font-bold text-gray-900">{formatBytes(storageInfo.total_space)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <HardDrive className="w-8 h-8 text-green-500 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-600">Espaço Livre</p>
                            <p className="text-xl font-bold text-gray-900">{formatBytes(storageInfo.free_space)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-yellow-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <Video className="w-8 h-8 text-yellow-500 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-600">Gravações</p>
                            <p className="text-xl font-bold text-gray-900">{formatBytes(storageInfo.recordings_size)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-red-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <AlertTriangle className="w-8 h-8 text-red-500 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-600">Logs</p>
                            <p className="text-xl font-bold text-gray-900">{formatBytes(storageInfo.logs_size)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Barra de progresso */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Uso do Disco</span>
                        <span className="text-sm text-gray-500">
                          {((storageInfo.used_space / storageInfo.total_space) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-primary-600 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${(storageInfo.used_space / storageInfo.total_space) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* Ações de limpeza */}
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={handleCleanRecordings}
                        className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Limpar Gravações Antigas</span>
                      </button>
                      
                      <button
                        onClick={handleCleanLogs}
                        className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Limpar Logs Antigos</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Configurações de Logs */}
            {activeTab === 'logs' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Configurações de Logs</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nível de Log
                    </label>
                    <select
                      value={settings.log_level}
                      onChange={(e) => updateSetting('log_level', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="debug">Debug</option>
                      <option value="info">Info</option>
                      <option value="warn">Warning</option>
                      <option value="error">Error</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Retenção (dias)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={settings.log_retention_days}
                      onChange={(e) => updateSetting('log_retention_days', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tamanho Máximo (MB)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={settings.log_max_size}
                      onChange={(e) => updateSetting('log_max_size', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Botão de salvar */}
            <div className="flex items-center justify-end pt-6 border-t border-gray-200">
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? 'Salvando...' : 'Salvar Configurações'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;