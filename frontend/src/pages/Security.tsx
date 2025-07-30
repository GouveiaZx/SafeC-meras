import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, Eye, Lock, Users, Activity, Settings, Download, RefreshCw, Search, Filter, Clock, MapPin, Smartphone, Monitor, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { api, endpoints } from '@/lib/api';
import AuthHealthMonitor from '@/components/AuthHealthMonitor';

interface SecurityEventsResponse {
  events: SecurityEvent[];
  pagination?: {
    total: number;
    pages: number;
    page: number;
    limit: number;
  };
}

interface SecurityStatsResponse {
  stats: SecurityStats;
}

interface SecuritySettingsResponse {
  settings: SecuritySettings;
}

interface SecuritySessionsResponse {
  sessions: ActiveSession[];
}

interface SecurityEvent {
  id: string;
  type: 'login_success' | 'login_failed' | 'password_change' | 'permission_change' | 'camera_access' | 'system_config' | 'data_export' | 'suspicious_activity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_id?: string;
  username?: string;
  description: string;
  ip_address: string;
  user_agent: string;
  location?: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface SecurityStats {
  total_events: number;
  failed_logins_24h: number;
  suspicious_activities: number;
  active_sessions: number;
  blocked_ips: number;
  events_by_severity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  events_by_type: Record<string, number>;
}

interface SecuritySettings {
  max_login_attempts: number;
  lockout_duration: number;
  session_timeout: number;
  password_policy: {
    min_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_numbers: boolean;
    require_symbols: boolean;
    expiry_days: number;
  };
  two_factor_required: boolean;
  ip_whitelist_enabled: boolean;
  ip_whitelist: string[];
  audit_log_retention: number;
  email_notifications: boolean;
  webhook_url?: string;
}

interface ActiveSession {
  id: string;
  user_id: string;
  username: string;
  ip_address: string;
  user_agent: string;
  device_type: string;
  location?: string;
  created_at: string;
  last_activity: string;
  is_current: boolean;
}

const Security: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [currentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  const tabs = [
    { id: 'overview', name: 'Visão Geral', icon: Shield },
    { id: 'events', name: 'Eventos', icon: Activity },
    { id: 'health', name: 'Saúde Auth', icon: Shield },
    { id: 'sessions', name: 'Sessões', icon: Users },
    { id: 'settings', name: 'Configurações', icon: Settings }
  ];
  
  const severityColors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };
  
  const typeIcons = {
    login_success: Eye,
    login_failed: AlertTriangle,
    password_change: Lock,
    permission_change: Users,
    camera_access: Monitor,
    system_config: Settings,
    data_export: Download,
    suspicious_activity: Shield
  };
  
  // Carregar dados
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = {
        search: searchTerm,
        severity: selectedSeverity,
        type: selectedType,
        start_date: dateRange.start,
        end_date: dateRange.end,
        page: currentPage.toString(),
        limit: itemsPerPage.toString()
      };
      
      const [eventsData, statsData, settingsData, sessionsData] = await Promise.all([
        api.get<SecurityEventsResponse>(endpoints.security.getEvents(), params),
        api.get<SecurityStatsResponse>(endpoints.security.getStats()),
        api.get<SecuritySettingsResponse>(endpoints.security.getSettings()),
        api.get<SecuritySessionsResponse>(endpoints.security.getSessions())
      ]);
      
      setEvents(eventsData.events || []);
      setStats(statsData.stats);
      setSettings(settingsData.settings);
      setSessions(sessionsData.sessions || []);
    } catch (error) {
      console.error('Erro ao carregar dados de segurança:', error);
      toast.error('Erro ao carregar dados de segurança');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedSeverity, selectedType, dateRange, currentPage, itemsPerPage]);
  
  // Salvar configurações
  const handleSaveSettings = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!settings) return;
    
    try {
      setSaving(true);
      
      await api.put(endpoints.security.updateSettings(), settings);
      toast.success('Configurações salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  }, [settings]);
  
  // Encerrar sessão
  const handleTerminateSession = useCallback(async (sessionId: string) => {
    if (!confirm('Tem certeza que deseja encerrar esta sessão?')) {
      return;
    }
    
    try {
      await api.delete(endpoints.security.terminateSession(sessionId));
      toast.success('Sessão encerrada');
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);
      toast.error('Erro ao encerrar sessão');
    }
  }, []);
  
  // Exportar eventos
  const handleExportEvents = useCallback(async () => {
    try {
      const params = {
        search: searchTerm,
        severity: selectedSeverity,
        type: selectedType,
        start_date: dateRange.start,
        end_date: dateRange.end
      };
      
      const response = await api.download(endpoints.security.exportEvents());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `security-events-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Eventos exportados com sucesso');
    } catch (error) {
      console.error('Erro ao exportar eventos:', error);
      toast.error('Erro ao exportar eventos');
    }
  }, [searchTerm, selectedSeverity, selectedType, dateRange]);
  
  // Atualizar configuração
  const updateSetting = useCallback((path: string, value: unknown) => {
    setSettings(prev => {
      if (!prev) return null;
      
      const keys = path.split('.');
      const newSettings = { ...prev };
      let current: Record<string, unknown> = newSettings as Record<string, unknown>;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...(current[keys[i]] as Record<string, unknown>) };
        current = current[keys[i]] as Record<string, unknown>;
      }
      
      current[keys[keys.length - 1]] = value;
      return newSettings;
    });
  }, []);
  
  // Obter ícone do dispositivo
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile': return Smartphone;
      case 'tablet': return Smartphone;
      case 'desktop': return Monitor;
      default: return Globe;
    }
  };
  
  // Effects
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  if (loading && !stats) {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Segurança</h1>
        <p className="text-gray-600">Monitore eventos de segurança e configure políticas</p>
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
      {/* Visão Geral */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Cards de estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total de Eventos</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_events}</p>
                </div>
                <Activity className="w-8 h-8 text-primary-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Logins Falhados (24h)</p>
                  <p className="text-2xl font-bold text-red-600">{stats.failed_logins_24h}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Sessões Ativas</p>
                  <p className="text-2xl font-bold text-green-600">{stats.active_sessions}</p>
                </div>
                <Users className="w-8 h-8 text-green-600" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">IPs Bloqueados</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.blocked_ips}</p>
                </div>
                <Shield className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>
          
          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Eventos por severidade */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Eventos por Severidade</h3>
              <div className="space-y-3">
                {Object.entries(stats.events_by_severity).map(([severity, count]) => (
                  <div key={severity} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColors[severity as keyof typeof severityColors]}`}>
                        {severity === 'low' ? 'Baixa' :
                         severity === 'medium' ? 'Média' :
                         severity === 'high' ? 'Alta' : 'Crítica'}
                      </span>
                    </div>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Eventos por tipo */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Eventos por Tipo</h3>
              <div className="space-y-3">
                {Object.entries(stats.events_by_type).map(([type, count]) => {
                  const Icon = typeIcons[type as keyof typeof typeIcons] || Activity;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Icon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">
                          {type === 'login_success' ? 'Login Sucesso' :
                           type === 'login_failed' ? 'Login Falhou' :
                           type === 'password_change' ? 'Alteração de Senha' :
                           type === 'permission_change' ? 'Alteração de Permissão' :
                           type === 'camera_access' ? 'Acesso à Câmera' :
                           type === 'system_config' ? 'Configuração do Sistema' :
                           type === 'data_export' ? 'Exportação de Dados' :
                           'Atividade Suspeita'}
                        </span>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Eventos */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          {/* Filtros */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar eventos..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severidade
                </label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todas</option>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todos</option>
                  <option value="login_success">Login Sucesso</option>
                  <option value="login_failed">Login Falhou</option>
                  <option value="password_change">Alteração de Senha</option>
                  <option value="permission_change">Alteração de Permissão</option>
                  <option value="camera_access">Acesso à Câmera</option>
                  <option value="system_config">Configuração do Sistema</option>
                  <option value="data_export">Exportação de Dados</option>
                  <option value="suspicious_activity">Atividade Suspeita</option>
                </select>
              </div>
              
              <div className="flex items-end space-x-2">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedSeverity('');
                    setSelectedType('');
                    setDateRange({ start: '', end: '' });
                  }}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span>Limpar</span>
                </button>
                
                <button
                  onClick={handleExportEvents}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* Lista de eventos */}
          <div className="bg-white rounded-lg shadow-md">
            {events.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum evento encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Evento
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Usuário
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IP / Localização
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {events.map((event) => {
                      const Icon = typeIcons[event.type] || Activity;
                      const DeviceIcon = getDeviceIcon(event.device_type);
                      
                      return (
                        <tr key={event.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              <Icon className="w-5 h-5 text-gray-500" />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {event.type === 'login_success' ? 'Login Sucesso' :
                                     event.type === 'login_failed' ? 'Login Falhou' :
                                     event.type === 'password_change' ? 'Alteração de Senha' :
                                     event.type === 'permission_change' ? 'Alteração de Permissão' :
                                     event.type === 'camera_access' ? 'Acesso à Câmera' :
                                     event.type === 'system_config' ? 'Configuração do Sistema' :
                                     event.type === 'data_export' ? 'Exportação de Dados' :
                                     'Atividade Suspeita'}
                                  </span>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColors[event.severity]}`}>
                                    {event.severity === 'low' ? 'Baixa' :
                                     event.severity === 'medium' ? 'Média' :
                                     event.severity === 'high' ? 'Alta' : 'Crítica'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{event.description}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{event.username || 'Sistema'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <DeviceIcon className="w-4 h-4 text-gray-500" />
                              <div>
                                <div className="text-sm text-gray-900 font-mono">{event.ip_address}</div>
                                {event.location && (
                                  <div className="text-xs text-gray-500">{event.location}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {new Date(event.created_at).toLocaleString()}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Saúde Auth */}
      {activeTab === 'health' && (
        <AuthHealthMonitor />
      )}
      
      {/* Sessões */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Filtros */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar eventos..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severidade
                </label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todas</option>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todos</option>
                  <option value="login_success">Login Sucesso</option>
                  <option value="login_failed">Login Falhou</option>
                  <option value="password_change">Alteração de Senha</option>
                  <option value="permission_change">Alteração de Permissão</option>
                  <option value="camera_access">Acesso à Câmera</option>
                  <option value="system_config">Configuração do Sistema</option>
                  <option value="data_export">Exportação de Dados</option>
                  <option value="suspicious_activity">Atividade Suspeita</option>
                </select>
              </div>
              
              <div className="flex items-end space-x-2">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedSeverity('');
                    setSelectedType('');
                    setDateRange({ start: '', end: '' });
                  }}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span>Limpar</span>
                </button>
                
                <button
                  onClick={handleExportEvents}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* Lista de eventos */}
          <div className="bg-white rounded-lg shadow-md">
            {events.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum evento encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Evento
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Usuário
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IP / Localização
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {events.map((event) => {
                      const Icon = typeIcons[event.type] || Activity;
                      const DeviceIcon = getDeviceIcon(event.device_type);
                      
                      return (
                        <tr key={event.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              <Icon className="w-5 h-5 text-gray-500" />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {event.type === 'login_success' ? 'Login Sucesso' :
                                     event.type === 'login_failed' ? 'Login Falhou' :
                                     event.type === 'password_change' ? 'Alteração de Senha' :
                                     event.type === 'permission_change' ? 'Alteração de Permissão' :
                                     event.type === 'camera_access' ? 'Acesso à Câmera' :
                                     event.type === 'system_config' ? 'Configuração do Sistema' :
                                     event.type === 'data_export' ? 'Exportação de Dados' :
                                     'Atividade Suspeita'}
                                  </span>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColors[event.severity]}`}>
                                    {event.severity === 'low' ? 'Baixa' :
                                     event.severity === 'medium' ? 'Média' :
                                     event.severity === 'high' ? 'Alta' : 'Crítica'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{event.description}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{event.username || 'Sistema'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <DeviceIcon className="w-4 h-4 text-gray-500" />
                              <div>
                                <div className="text-sm text-gray-900 font-mono">{event.ip_address}</div>
                                {event.location && (
                                  <div className="text-xs text-gray-500">{event.location}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {new Date(event.created_at).toLocaleString()}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Sessões */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Sessões Ativas</h3>
            </div>
            
            {sessions.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhuma sessão ativa</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {sessions.map((session) => {
                  const DeviceIcon = getDeviceIcon(session.device_type);
                  
                  return (
                    <div key={session.id} className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <DeviceIcon className="w-8 h-8 text-gray-500" />
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="text-lg font-medium text-gray-900">{session.username}</h4>
                              {session.is_current && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                                  Atual
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                              <span className="flex items-center space-x-1">
                                <Globe className="w-4 h-4" />
                                <span>{session.ip_address}</span>
                              </span>
                              {session.location && (
                                <span className="flex items-center space-x-1">
                                  <MapPin className="w-4 h-4" />
                                  <span>{session.location}</span>
                                </span>
                              )}
                              <span className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>Última atividade: {new Date(session.last_activity).toLocaleString()}</span>
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {session.user_agent}
                            </div>
                          </div>
                        </div>
                        
                        {!session.is_current && (
                          <button
                            onClick={() => handleTerminateSession(session.id)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Encerrar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Configurações */}
      {activeTab === 'settings' && settings && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Configurações de Autenticação</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Máximo de tentativas de login
                </label>
                <input
                  type="number"
                  value={settings.max_login_attempts}
                  onChange={(e) => updateSetting('max_login_attempts', parseInt(e.target.value))}
                  min="1"
                  max="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duração do bloqueio (minutos)
                </label>
                <input
                  type="number"
                  value={settings.lockout_duration}
                  onChange={(e) => updateSetting('lockout_duration', parseInt(e.target.value))}
                  min="1"
                  max="1440"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timeout da sessão (minutos)
                </label>
                <input
                  type="number"
                  value={settings.session_timeout}
                  onChange={(e) => updateSetting('session_timeout', parseInt(e.target.value))}
                  min="5"
                  max="1440"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Retenção de logs (dias)
                </label>
                <input
                  type="number"
                  value={settings.audit_log_retention}
                  onChange={(e) => updateSetting('audit_log_retention', parseInt(e.target.value))}
                  min="1"
                  max="365"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.two_factor_required}
                  onChange={(e) => updateSetting('two_factor_required', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Exigir autenticação de dois fatores para todos os usuários</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.ip_whitelist_enabled}
                  onChange={(e) => updateSetting('ip_whitelist_enabled', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Habilitar lista branca de IPs</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.email_notifications}
                  onChange={(e) => updateSetting('email_notifications', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Enviar notificações por email para eventos críticos</span>
              </label>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Política de Senhas</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comprimento mínimo
                </label>
                <input
                  type="number"
                  value={settings.password_policy.min_length}
                  onChange={(e) => updateSetting('password_policy.min_length', parseInt(e.target.value))}
                  min="6"
                  max="32"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiração (dias)
                </label>
                <input
                  type="number"
                  value={settings.password_policy.expiry_days}
                  onChange={(e) => updateSetting('password_policy.expiry_days', parseInt(e.target.value))}
                  min="0"
                  max="365"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.password_policy.require_uppercase}
                  onChange={(e) => updateSetting('password_policy.require_uppercase', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Exigir letras maiúsculas</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.password_policy.require_lowercase}
                  onChange={(e) => updateSetting('password_policy.require_lowercase', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Exigir letras minúsculas</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.password_policy.require_numbers}
                  onChange={(e) => updateSetting('password_policy.require_numbers', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Exigir números</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.password_policy.require_symbols}
                  onChange={(e) => updateSetting('password_policy.require_symbols', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm">Exigir símbolos</span>
              </label>
            </div>
          </div>
          
          {settings.webhook_url !== undefined && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Webhook</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL do Webhook
                </label>
                <input
                  type="url"
                  value={settings.webhook_url || ''}
                  onChange={(e) => updateSetting('webhook_url', e.target.value)}
                  placeholder="https://exemplo.com/webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  URL para receber notificações de eventos de segurança
                </p>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Settings className="w-4 h-4" />
              )}
              <span>{saving ? 'Salvando...' : 'Salvar Configurações'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Security;