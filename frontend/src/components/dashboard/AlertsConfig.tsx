import React, { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2, Mail, Bell, AlertTriangle, CheckCircle, XCircle, TestTube, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface AlertSettings {
  id: string;
  setting_key: string;
  setting_value: {
    threshold?: number;
    enabled?: boolean;
    interval?: number;
    cooldown?: number;
  };
  description: string;
}

interface AlertRecipient {
  id: string;
  email: string;
  name: string;
  alert_types: string[];
  levels: string[];
  active: boolean;
}

interface AlertLog {
  id: string;
  alert_type: string;
  level: string;
  message: string;
  details: any;
  camera_id?: string;
  resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

interface MonitoringStatus {
  running: boolean;
  last_check: string;
  checks_count: number;
  alerts_sent: number;
}

const AlertsConfig: React.FC = () => {
  const [settings, setSettings] = useState<AlertSettings[]>([]);
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('settings');
  const [newRecipient, setNewRecipient] = useState({ email: '', name: '' });
  const [showAddRecipient, setShowAddRecipient] = useState(false);

  const alertTypes = [
    { key: 'disk_space', name: 'Espaço em Disco', description: 'Alerta quando o espaço em disco estiver baixo' },
    { key: 'camera_offline', name: 'Câmera Offline', description: 'Alerta quando uma câmera ficar offline' },
    { key: 'recording_failure', name: 'Falha de Gravação', description: 'Alerta quando houver falha na gravação' },
    { key: 'stream_interrupted', name: 'Stream Interrompido', description: 'Alerta quando um stream for interrompido' },
    { key: 'system_error', name: 'Erro do Sistema', description: 'Alerta para erros gerais do sistema' }
  ];

  const alertLevels = [
    { key: 'info', name: 'Informação', color: 'text-blue-600' },
    { key: 'warning', name: 'Aviso', color: 'text-yellow-600' },
    { key: 'critical', name: 'Crítico', color: 'text-red-600' },
    { key: 'error', name: 'Erro', color: 'text-red-800' }
  ];

  // Carregar dados
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, recipientsRes, logsRes, statusRes] = await Promise.all([
        api.get('/api/alerts/settings'),
        api.get('/api/alerts/recipients'),
        api.get('/api/alerts/logs?limit=50'),
        api.get('/api/alerts/status')
      ]);
      
      setSettings((settingsRes as any).settings || []);
      setRecipients((recipientsRes as any).recipients || []);
      setLogs((logsRes as any).logs || []);
      setStatus((statusRes as any).status);
    } catch (error) {
      console.error('Erro ao carregar dados de alertas:', error);
      toast.error('Erro ao carregar configurações de alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Salvar configurações
  const handleSaveSettings = useCallback(async () => {
    try {
      setSaving(true);
      await api.put('/api/alerts/settings', { settings });
      toast.success('Configurações de alertas salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  // Adicionar destinatário
  const handleAddRecipient = useCallback(async () => {
    if (!newRecipient.email || !newRecipient.name) {
      toast.error('Email e nome são obrigatórios');
      return;
    }

    try {
      const response = await api.post('/api/alerts/recipients', {
        email: newRecipient.email,
        name: newRecipient.name,
        alert_types: ['all'],
        levels: ['warning', 'critical', 'error']
      });
      
      setRecipients(prev => [...prev, (response as any).recipient]);
      setNewRecipient({ email: '', name: '' });
      setShowAddRecipient(false);
      toast.success('Destinatário adicionado com sucesso');
    } catch (error) {
      console.error('Erro ao adicionar destinatário:', error);
      toast.error('Erro ao adicionar destinatário');
    }
  }, [newRecipient]);

  // Remover destinatário
  const handleRemoveRecipient = useCallback(async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este destinatário?')) return;

    try {
      await api.delete(`/api/alerts/recipients/${id}`);
      setRecipients(prev => prev.filter(r => r.id !== id));
      toast.success('Destinatário removido com sucesso');
    } catch (error) {
      console.error('Erro ao remover destinatário:', error);
      toast.error('Erro ao remover destinatário');
    }
  }, []);

  // Testar alerta
  const handleTestAlert = useCallback(async () => {
    try {
      await api.post('/api/alerts/test', {
        type: 'system_test',
        level: 'info',
        message: 'Este é um alerta de teste do sistema NewCAM'
      });
      toast.success('Alerta de teste enviado com sucesso');
    } catch (error) {
      console.error('Erro ao enviar alerta de teste:', error);
      toast.error('Erro ao enviar alerta de teste');
    }
  }, []);

  // Iniciar/parar monitoramento
  const handleToggleMonitoring = useCallback(async () => {
    try {
      const action = status?.running ? 'stop' : 'start';
      await api.post(`/api/alerts/${action}`);
      setStatus(prev => prev ? { ...prev, running: !prev.running } : null);
      toast.success(`Monitoramento ${action === 'start' ? 'iniciado' : 'parado'} com sucesso`);
    } catch (error) {
      console.error('Erro ao alterar status do monitoramento:', error);
      toast.error('Erro ao alterar status do monitoramento');
    }
  }, [status]);

  // Atualizar configuração
  const updateSetting = useCallback((key: string, field: string, value: any) => {
    setSettings(prev => prev.map(setting => 
      setting.setting_key === key 
        ? { ...setting, setting_value: { ...setting.setting_value, [field]: value } }
        : setting
    ));
  }, []);

  // Formatar data
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Status */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Sistema de Alertas</h2>
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
              status?.running ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {status?.running ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span>{status?.running ? 'Ativo' : 'Inativo'}</span>
            </div>
            <button
              onClick={handleToggleMonitoring}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                status?.running 
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {status?.running ? 'Parar' : 'Iniciar'} Monitoramento
            </button>
          </div>
        </div>
        
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Última verificação:</span>
              <p className="font-medium">{status.last_check ? formatDate(status.last_check) : 'Nunca'}</p>
            </div>
            <div>
              <span className="text-gray-600">Total de verificações:</span>
              <p className="font-medium">{status.checks_count}</p>
            </div>
            <div>
              <span className="text-gray-600">Alertas enviados:</span>
              <p className="font-medium">{status.alerts_sent}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navegação */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'settings', name: 'Configurações', icon: Bell },
              { id: 'recipients', name: 'Destinatários', icon: Mail },
              { id: 'logs', name: 'Histórico', icon: AlertTriangle }
            ].map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center space-x-2 py-4 border-b-2 font-medium text-sm ${
                    activeSection === section.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{section.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* Seção de Configurações */}
          {activeSection === 'settings' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Configurações de Alertas</h3>
                <div className="flex space-x-3">
                  <button
                    onClick={handleTestAlert}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <TestTube className="w-4 h-4" />
                    <span>Testar Alerta</span>
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-6">
                {alertTypes.map((type) => {
                  const setting = settings.find(s => s.setting_key === type.key);
                  if (!setting) return null;

                  return (
                    <div key={type.key} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium text-gray-900">{type.name}</h4>
                          <p className="text-sm text-gray-600">{type.description}</p>
                        </div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={setting.setting_value.enabled || false}
                            onChange={(e) => updateSetting(type.key, 'enabled', e.target.checked)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">Ativo</span>
                        </label>
                      </div>

                      {setting.setting_value.enabled && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {type.key === 'disk_space' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Threshold (%)
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="99"
                                value={setting.setting_value.threshold || 85}
                                onChange={(e) => updateSetting(type.key, 'threshold', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                              />
                            </div>
                          )}
                          
                          {type.key === 'camera_offline' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tempo offline (minutos)
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={setting.setting_value.threshold || 5}
                                onChange={(e) => updateSetting(type.key, 'threshold', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Intervalo de verificação (minutos)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={setting.setting_value.interval || 5}
                              onChange={(e) => updateSetting(type.key, 'interval', parseInt(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Cooldown (minutos)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={setting.setting_value.cooldown || 30}
                              onChange={(e) => updateSetting(type.key, 'cooldown', parseInt(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção de Destinatários */}
          {activeSection === 'recipients' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Destinatários de Alertas</h3>
                <button
                  onClick={() => setShowAddRecipient(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Destinatário</span>
                </button>
              </div>

              {showAddRecipient && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-medium text-gray-900 mb-3">Novo Destinatário</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                      <input
                        type="text"
                        value={newRecipient.name}
                        onChange={(e) => setNewRecipient(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Nome do destinatário"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={newRecipient.email}
                        onChange={(e) => setNewRecipient(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                        placeholder="email@exemplo.com"
                      />
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddRecipient}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => {
                        setShowAddRecipient(false);
                        setNewRecipient({ email: '', name: '' });
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {recipients.map((recipient) => (
                  <div key={recipient.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{recipient.name}</h4>
                        <p className="text-sm text-gray-600">{recipient.email}</p>
                        <div className="flex items-center space-x-4 mt-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            recipient.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {recipient.active ? 'Ativo' : 'Inativo'}
                          </span>
                          <span className="text-xs text-gray-500">
                            Tipos: {recipient.alert_types.join(', ')}
                          </span>
                          <span className="text-xs text-gray-500">
                            Níveis: {recipient.levels.join(', ')}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveRecipient(recipient.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção de Logs */}
          {activeSection === 'logs' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Histórico de Alertas</h3>
                <button
                  onClick={loadData}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Atualizar</span>
                </button>
              </div>

              <div className="space-y-4">
                {logs.map((log) => {
                  const level = alertLevels.find(l => l.key === log.level);
                  return (
                    <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              level?.color === 'text-blue-600' ? 'bg-blue-100 text-blue-800' :
                              level?.color === 'text-yellow-600' ? 'bg-yellow-100 text-yellow-800' :
                              level?.color === 'text-red-600' ? 'bg-red-100 text-red-800' :
                              'bg-red-200 text-red-900'
                            }`}>
                              {level?.name || log.level}
                            </span>
                            <span className="text-sm text-gray-600">{log.alert_type}</span>
                            <span className="text-xs text-gray-500">{formatDate(log.created_at)}</span>
                          </div>
                          <p className="text-gray-900 mb-2">{log.message}</p>
                          {log.details && (
                            <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                        <div className={`ml-4 px-2 py-1 rounded-full text-xs ${
                          log.resolved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {log.resolved ? 'Resolvido' : 'Pendente'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertsConfig;