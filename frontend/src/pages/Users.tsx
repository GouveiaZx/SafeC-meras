import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, Shield, Eye, EyeOff, UserCheck, UserX, Settings, Filter, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api, endpoints } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'integrator' | 'operator' | 'client' | 'viewer';
  status: 'pending' | 'active' | 'inactive' | 'suspended';
  last_login?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  approved_by?: string;
  suspended_at?: string;
  suspended_by?: string;
  permissions: string[];
  camera_access: string[];
  login_attempts?: number;
  last_ip?: string;
  two_factor_enabled: boolean;
}

interface UsersResponse {
  data: User[];
  pagination: {
    total: number;
    pages: number;
    page: number;
    limit: number;
  };
}

interface CamerasResponse {
  cameras: Camera[];
}

interface UserFormData {
  username: string;
  email: string;
  full_name: string;
  password?: string;
  role: 'admin' | 'integrator' | 'operator' | 'client' | 'viewer';
  status: 'pending' | 'active' | 'inactive' | 'suspended';
  permissions: string[];
  camera_access: string[];
  two_factor_enabled: boolean;
}

interface Camera {
  id: string;
  name: string;
  location: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'view_cameras', name: 'Visualizar Câmeras', description: 'Pode visualizar streams de câmeras' },
  { id: 'manage_cameras', name: 'Gerenciar Câmeras', description: 'Pode adicionar, editar e remover câmeras' },
  { id: 'view_recordings', name: 'Visualizar Gravações', description: 'Pode acessar arquivo de gravações' },
  { id: 'manage_recordings', name: 'Gerenciar Gravações', description: 'Pode deletar e exportar gravações' },
  { id: 'view_users', name: 'Visualizar Usuários', description: 'Pode ver lista de usuários' },
  { id: 'manage_users', name: 'Gerenciar Usuários', description: 'Pode criar, editar e deletar usuários' },
  { id: 'view_logs', name: 'Visualizar Logs', description: 'Pode acessar logs do sistema' },
  { id: 'manage_settings', name: 'Gerenciar Configurações', description: 'Pode alterar configurações do sistema' },
  { id: 'view_analytics', name: 'Visualizar Analytics', description: 'Pode acessar relatórios e estatísticas' },
  { id: 'manage_security', name: 'Gerenciar Segurança', description: 'Pode configurar políticas de segurança' }
];

const ROLE_PERMISSIONS = {
  admin: AVAILABLE_PERMISSIONS.map(p => p.id),
  integrator: ['view_cameras', 'manage_cameras', 'view_recordings', 'manage_recordings', 'view_analytics', 'view_logs'],
  operator: ['view_cameras', 'manage_cameras', 'view_recordings', 'manage_recordings', 'view_analytics'],
  client: ['view_cameras', 'view_recordings', 'view_analytics'],
  viewer: ['view_cameras', 'view_recordings']
};

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  
  const limit = 20;
  
  // Form state
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'viewer',
    status: 'pending',
    permissions: [],
    camera_access: [],
    two_factor_enabled: false
  });
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  
  // Carregar usuários
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = {
        page: currentPage.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter })
      };
      
      const data = await api.get<UsersResponse>(endpoints.users.getAll(), params);
      setUsers(data.data || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotalUsers(data.pagination?.total || 0);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, roleFilter, statusFilter]);
  
  // Resetar formulário
  const resetForm = useCallback(() => {
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      role: 'viewer',
      status: 'pending',
      permissions: [],
      camera_access: [],
      two_factor_enabled: false
    });
    setFormErrors({});
    setEditingUser(null);
  }, []);

  // Carregar câmeras
  const loadCameras = useCallback(async () => {
    try {
      const data = await api.get<CamerasResponse>(endpoints.cameras.getAll());
      setCameras(data.cameras || []);
    } catch (error) {
      console.error('Erro ao carregar câmeras:', error);
    }
  }, []);
  


  // Criar/editar usuário
  const handleSubmitUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação
    const errors: Record<string, string> = {};
    
    if (!formData.username.trim()) {
      errors.username = 'Nome de usuário é obrigatório';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Email inválido';
    }
    
    if (!formData.full_name.trim()) {
      errors.full_name = 'Nome completo é obrigatório';
    }
    
    if (!editingUser && !formData.password) {
      errors.password = 'Senha é obrigatória para novos usuários';
    }
    
    if (formData.password && formData.password.length < 6) {
      errors.password = 'Senha deve ter pelo menos 6 caracteres';
    }
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    try {
      const payload = { ...formData };
      
      // Remover senha vazia para edição
      if (editingUser && !payload.password) {
        delete payload.password;
      }
      
      // Para novos usuários, garantir que status seja 'pending' por padrão
      if (!editingUser && !payload.status) {
        payload.status = 'pending';
      }
      
      if (editingUser) {
        await api.put(endpoints.users.update(editingUser.id), payload);
        toast.success('Usuário atualizado com sucesso');
      } else {
        await api.post(endpoints.users.create(), payload);
        toast.success('Usuário criado com sucesso');
      }
      
      setShowUserModal(false);
      resetForm();
      loadUsers();
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      
      // Melhor tratamento de erro
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      if (errorMessage.includes('já está em uso')) {
        toast.error('Email ou nome de usuário já está em uso');
      } else if (errorMessage.includes('validação')) {
        toast.error('Dados inválidos. Verifique os campos preenchidos.');
      } else {
        toast.error('Erro ao salvar usuário: ' + errorMessage);
      }
    }
  }, [formData, editingUser, loadUsers, resetForm]);
  
  // Deletar usuário
  const handleDeleteUser = useCallback(async (userId: string) => {
    if (!confirm('Tem certeza que deseja deletar este usuário?')) {
      return;
    }
    
    try {
      await api.delete(endpoints.users.delete(userId));
      toast.success('Usuário deletado');
      loadUsers();
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      toast.error('Erro ao deletar usuário');
    }
  }, [loadUsers]);
  
  // Alterar status do usuário
  const handleToggleUserStatus = useCallback(async (userId: string, newStatus: 'active' | 'inactive' | 'suspended') => {
    try {
      await api.put(endpoints.users.updateStatus(userId), { status: newStatus });
      toast.success('Status atualizado');
      loadUsers();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    }
  }, [loadUsers]);
  
  // Resetar senha
  const handleResetPassword = useCallback(async (userId: string, newPassword: string) => {
    try {
      await api.post(endpoints.users.resetPassword(userId), { new_password: newPassword });
      toast.success('Senha resetada');
      setShowPasswordModal(false);
    } catch (error) {
      console.error('Erro ao resetar senha:', error);
      toast.error('Erro ao resetar senha');
    }
  }, []);
  
  // Abrir modal de edição
  const handleEditUser = useCallback((user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status, // Manter status original
      permissions: user.permissions,
      camera_access: user.camera_access,
      two_factor_enabled: user.two_factor_enabled
    });
    setShowUserModal(true);
  }, []);
  
  // Atualizar permissões baseado no role
  const handleRoleChange = useCallback((role: 'admin' | 'integrator' | 'operator' | 'client' | 'viewer') => {
    setFormData(prev => ({
      ...prev,
      role,
      permissions: ROLE_PERMISSIONS[role]
    }));
  }, []);

  // Aprovar usuário
  const handleApproveUser = useCallback(async (userId: string) => {
    if (!confirm('Tem certeza que deseja aprovar este usuário?')) {
      return;
    }
    
    try {
      await api.post(endpoints.users.approve(userId));
      toast.success('Usuário aprovado');
      loadUsers();
    } catch (error) {
      console.error('Erro ao aprovar usuário:', error);
      toast.error('Erro ao aprovar usuário');
    }
  }, [loadUsers]);

  // Suspender usuário
  const handleSuspendUser = useCallback(async (userId: string) => {
    if (!confirm('Tem certeza que deseja suspender este usuário?')) {
      return;
    }
    
    try {
      await api.post(endpoints.users.suspend(userId));
      toast.success('Usuário suspenso');
      loadUsers();
    } catch (error) {
      console.error('Erro ao suspender usuário:', error);
      toast.error('Erro ao suspender usuário');
    }
  }, [loadUsers]);

  // Reativar usuário
  const handleActivateUser = useCallback(async (userId: string) => {
    if (!confirm('Tem certeza que deseja reativar este usuário?')) {
      return;
    }
    
    try {
      await api.post(endpoints.users.activate(userId));
      toast.success('Usuário reativado');
      loadUsers();
    } catch (error) {
      console.error('Erro ao reativar usuário:', error);
      toast.error('Erro ao reativar usuário');
    }
  }, [loadUsers]);
  
  // Exportar usuários
  const handleExportUsers = useCallback(async () => {
    try {
      const response = await api.download(endpoints.users.export());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usuarios_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Exportação concluída');
    } catch (error) {
      console.error('Erro na exportação:', error);
      toast.error('Erro ao exportar usuários');
    }
  }, []);
  
  // Effects
  useEffect(() => {
    loadUsers();
    loadCameras();
  }, [loadUsers, loadCameras]);
  
  // Filtrar usuários
  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchTerm || 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter || user.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Gerenciamento de Usuários</h1>
        <p className="text-gray-600">Gerencie usuários, permissões e controle de acesso</p>
      </div>
      
      {/* Controles */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Busca */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Ações */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
            </button>
            
            <button
              onClick={handleExportUsers}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar</span>
            </button>
            
            <button
              onClick={() => {
                resetForm();
                setShowUserModal(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </button>
          </div>
        </div>
        
        {/* Filtros expandidos */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todas as funções</option>
                  <option value="admin">Administrador</option>
                  <option value="integrator">Integrador</option>
                  <option value="operator">Operador</option>
                  <option value="client">Cliente</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Todos os status</option>
                  <option value="pending">Pendente</option>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="suspended">Suspenso</option>
                </select>
              </div>
              
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setRoleFilter('');
                    setStatusFilter('');
                    setSearchTerm('');
                  }}
                  className="px-4 py-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Lista de usuários */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum usuário encontrado</h3>
          <p className="text-gray-600">Tente ajustar os filtros ou criar um novo usuário.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuário
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Função
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Último Login
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      2FA
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                          <div className="text-xs text-gray-400">@{user.username}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'integrator' ? 'bg-blue-100 text-blue-800' :
                          user.role === 'operator' ? 'bg-primary-100 text-primary-800' :
                          user.role === 'client' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role === 'admin' ? 'Administrador' :
                           user.role === 'integrator' ? 'Integrador' :
                           user.role === 'operator' ? 'Operador' :
                           user.role === 'client' ? 'Cliente' :
                           'Visualizador'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.status === 'active' ? 'bg-green-100 text-green-800' :
                          user.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                          user.status === 'suspended' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.status === 'active' ? 'Ativo' :
                           user.status === 'pending' ? 'Pendente' :
                           user.status === 'suspended' ? 'Suspenso' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_login ? new Date(user.last_login).toLocaleString() : 'Nunca'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.two_factor_enabled ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-gray-400">✗</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          {user.status === 'pending' && (
                            <button
                              onClick={() => handleApproveUser(user.id)}
                              className="text-green-600 hover:text-green-700 transition-colors"
                              title="Aprovar usuário"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          
                          {(user.status === 'suspended' || user.status === 'inactive') && (
                            <button
                              onClick={() => handleActivateUser(user.id)}
                              className="text-green-600 hover:text-green-700 transition-colors"
                              title="Reativar usuário"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          
                          {user.status === 'active' && (
                            <button
                              onClick={() => handleSuspendUser(user.id)}
                              className="text-red-600 hover:text-red-700 transition-colors"
                              title="Suspender usuário"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleEditUser(user)}
                            className="text-primary-600 hover:text-primary-700 transition-colors"
                            title="Editar usuário"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          
                          {user.status !== 'pending' && (
                            <button
                              onClick={() => {
                                setSelectedUserId(user.id);
                                setShowPasswordModal(true);
                              }}
                              className="text-yellow-600 hover:text-yellow-700 transition-colors"
                              title="Resetar senha"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-600 hover:text-red-700 transition-colors"
                            title="Excluir usuário"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-600">
                Mostrando {((currentPage - 1) * limit) + 1} a {Math.min(currentPage * limit, totalUsers)} de {totalUsers} usuários
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Anterior
                </button>
                
                <span className="px-4 py-2 text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Modal de usuário */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                </h2>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleSubmitUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome de usuário *
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                        formErrors.username ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.username && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.username}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                        formErrors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.email && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome completo *
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      formErrors.full_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.full_name && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.full_name}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha {!editingUser && '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={editingUser ? 'Deixe em branco para manter a senha atual' : ''}
                      className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                        formErrors.password ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {formErrors.password && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Função
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => handleRoleChange(e.target.value as 'admin' | 'integrator' | 'operator' | 'client' | 'viewer')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="viewer">Visualizador</option>
                      <option value="client">Cliente</option>
                      <option value="operator">Operador</option>
                      <option value="integrator">Integrador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'pending' | 'active' | 'inactive' | 'suspended' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="pending">Pendente</option>
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="suspended">Suspenso</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Acesso às Câmeras
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2">
                    {cameras.map(camera => (
                      <label key={camera.id} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={formData.camera_access.includes(camera.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData(prev => ({
                                ...prev,
                                camera_access: [...prev.camera_access, camera.id]
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                camera_access: prev.camera_access.filter(id => id !== camera.id)
                              }));
                            }
                          }}
                          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm">{camera.name} - {camera.location}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.two_factor_enabled}
                      onChange={(e) => setFormData(prev => ({ ...prev, two_factor_enabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Habilitar autenticação de dois fatores</span>
                  </label>
                </div>
                
                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowUserModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    {editingUser ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de reset de senha */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Resetar Senha</h2>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newPassword = formData.get('newPassword') as string;
                if (newPassword && newPassword.length >= 6) {
                  handleResetPassword(selectedUserId, newPassword);
                } else {
                  toast.error('Senha deve ter pelo menos 6 caracteres');
                }
              }}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    required
                    minLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                
                <div className="flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Resetar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;