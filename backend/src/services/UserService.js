/**
 * Serviço de Usuários - NewCAM
 * Responsável pela gestão avançada de usuários, permissões e auditoria
 */

import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../config/database.js';
import { fileService } from './FileService.js';
import { reportService } from './ReportService.js';

export class UserService {
  constructor() {
    this.passwordMinLength = 8;
    this.failedLoginAttempts = new Map();
    this.accountLockDuration = 30 * 60 * 1000; // 30 minutos
  }

  /**
   * Cria um novo usuário com validações avançadas
   */
  async createUser(userData, createdBy) {
    try {
      // Validar dados
      this.validateUserData(userData);

      // Verificar se email já existe
      const existingUser = await this.findByEmail(userData.email);
      if (existingUser) {
        throw new Error('Email já cadastrado');
      }

      // Criptografar senha
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Criar usuário
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          name: userData.name,
          role: userData.role || 'user',
          department: userData.department || null,
          phone: userData.phone || null,
          created_by: createdBy
        }
      });

      if (error) throw error;

      // Salvar dados adicionais no banco
      const { error: profileError } = await supabaseAdmin
        .from('users')
        .insert({
          id: data.user.id,
          email: userData.email,
          name: userData.name,
          role: userData.role || 'user',
          department: userData.department || null,
          phone: userData.phone || null,
          status: 'active',
          created_by: createdBy,
          permissions: userData.permissions || this.getDefaultPermissions(userData.role || 'user')
        });

      if (profileError) throw profileError;

      // Registrar log
      await this.auditLog('USER_CREATED', {
        userId: data.user.id,
        createdBy,
        details: { name: userData.name, email: userData.email, role: userData.role }
      });

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: userData.name,
          role: userData.role,
          created_at: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      throw error;
    }
  }

  /**
   * Atualiza informações do usuário
   */
  async updateUser(userId, updateData, updatedBy) {
    try {
      // Validar dados
      if (updateData.email) {
        this.validateEmail(updateData.email);
        const existing = await this.findByEmail(updateData.email);
        if (existing && existing.id !== userId) {
          throw new Error('Email já cadastrado');
        }
      }

      // Atualizar usuário
      const updates = {};
      if (updateData.name) updates.name = updateData.name;
      if (updateData.email) updates.email = updateData.email;
      if (updateData.role) updates.role = updateData.role;
      if (updateData.department) updates.department = updateData.department;
      if (updateData.phone) updates.phone = updateData.phone;
      if (updateData.permissions) updates.permissions = updateData.permissions;

      const { error } = await supabaseAdmin
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy
        })
        .eq('id', userId);

      if (error) throw error;

      // Atualizar metadata no auth se necessário
      if (updateData.email || updateData.name) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: updateData.email,
          user_metadata: {
            name: updateData.name || undefined,
            role: updateData.role || undefined
          }
        });
      }

      // Registrar log
      await this.auditLog('USER_UPDATED', {
        userId,
        updatedBy,
        details: updates
      });

      return { success: true, message: 'Usuário atualizado com sucesso' };

    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      throw error;
    }
  }

  /**
   * Atualiza senha do usuário
   */
  async updatePassword(userId, newPassword, updatedBy) {
    try {
      this.validatePassword(newPassword);

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      });

      // Registrar log
      await this.auditLog('PASSWORD_CHANGED', {
        userId,
        updatedBy,
        details: { changedBy: updatedBy }
      });

      return { success: true, message: 'Senha atualizada com sucesso' };

    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      throw error;
    }
  }

  /**
   * Deleta usuário (soft delete)
   */
  async deleteUser(userId, deletedBy) {
    try {
      // Verificar se usuário tem registros importantes
      const hasRecordings = await this.checkUserRecordings(userId);
      if (hasRecordings) {
        throw new Error('Usuário possui gravações e não pode ser deletado');
      }

      // Soft delete
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy
        })
        .eq('id', userId);

      if (error) throw error;

      // Desativar no auth
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { status: 'deleted' }
      });

      // Registrar log
      await this.auditLog('USER_DELETED', {
        userId,
        deletedBy
      });

      return { success: true, message: 'Usuário deletado com sucesso' };

    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      throw error;
    }
  }

  /**
   * Lista usuários com filtros
   */
  async listUsers(filters = {}) {
    let query = supabaseAdmin.from('users').select('*');

    // Aplicar filtros
    if (filters.role) {
      query = query.eq('role', filters.role);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.department) {
      query = query.eq('department', filters.department);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Paginação
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const { data, error, count } = await query
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      users: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit)
    };
  }

  /**
   * Obtém usuário por ID
   */
  async getUserById(userId) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca usuário por email
   */
  async findByEmail(email) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  }

  /**
   * Verifica permissões do usuário
   */
  async checkPermission(userId, permission) {
    const user = await this.getUserById(userId);
    if (!user) return false;

    const permissions = user.permissions || {};
    return permissions[permission] === true;
  }

  /**
   * Atribui permissões ao usuário
   */
  async assignPermissions(userId, permissions, assignedBy) {
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        permissions,
        updated_at: new Date().toISOString(),
        updated_by: assignedBy
      })
      .eq('id', userId);

    if (error) throw error;

    // Registrar log
    await this.auditLog('PERMISSIONS_UPDATED', {
      userId,
      assignedBy,
      details: { permissions }
    });

    return { success: true, message: 'Permissões atualizadas com sucesso' };
  }

  /**
   * Obtém estatísticas de usuários
   */
  async getUserStats() {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('role, status, created_at, department');

    if (error) throw error;

    const stats = {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      byRole: {},
      byDepartment: {},
      recent: {
        last24h: 0,
        last7d: 0,
        last30d: 0
      }
    };

    const now = new Date();
    
    users.forEach(user => {
      // Por role
      stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
      
      // Por departamento
      if (user.department) {
        stats.byDepartment[user.department] = (stats.byDepartment[user.department] || 0) + 1;
      }
      
      // Recentes
      const createdAt = new Date(user.created_at);
      const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24);
      
      if (daysDiff <= 1) stats.recent.last24h++;
      if (daysDiff <= 7) stats.recent.last7d++;
      if (daysDiff <= 30) stats.recent.last30d++;
    });

    return stats;
  }

  /**
   * Registra log de auditoria
   */
  async auditLog(action, details) {
    try {
      await supabaseAdmin.from('system_logs').insert({
        level: 'info',
        source: 'user_service',
        action,
        details,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Erro ao registrar log de auditoria:', error);
    }
  }

  /**
   * Valida dados do usuário
   */
  validateUserData(userData) {
    if (!userData.email || !this.validateEmail(userData.email)) {
      throw new Error('Email inválido');
    }
    if (!userData.name || userData.name.length < 2) {
      throw new Error('Nome deve ter pelo menos 2 caracteres');
    }
    if (!userData.password || !this.validatePassword(userData.password)) {
      throw new Error('Senha deve ter pelo menos 8 caracteres');
    }
  }

  /**
   * Valida email
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida senha
   */
  validatePassword(password) {
    return password && password.length >= this.passwordMinLength;
  }

  /**
   * Obtém permissões padrão por role
   */
  getDefaultPermissions(role) {
    const permissions = {
      admin: {
        users: { read: true, write: true, delete: true },
        cameras: { read: true, write: true, delete: true },
        recordings: { read: true, write: true, delete: true },
        reports: { read: true, write: true, generate: true },
        system: { read: true, write: true, configure: true }
      },
      manager: {
        users: { read: true, write: true },
        cameras: { read: true, write: true },
        recordings: { read: true, write: true },
        reports: { read: true, write: true, generate: true },
        system: { read: true }
      },
      operator: {
        users: { read: true },
        cameras: { read: true, write: true },
        recordings: { read: true, write: true },
        reports: { read: true, generate: true }
      },
      viewer: {
        users: { read: true },
        cameras: { read: true },
        recordings: { read: true },
        reports: { read: true }
      }
    };

    return permissions[role] || permissions.viewer;
  }

  /**
   * Verifica se usuário tem gravações
   */
  async checkUserRecordings(userId) {
    const { data, error } = await supabaseAdmin
      .from('recordings')
      .select('id')
      .eq('created_by', userId)
      .limit(1);

    if (error) throw error;
    return (data || []).length > 0;
  }

  /**
   * Limpa tentativas de login falhadas
   */
  cleanupFailedAttempts() {
    const now = Date.now();
    for (const [key, timestamp] of this.failedLoginAttempts.entries()) {
      if (now - timestamp > this.accountLockDuration) {
        this.failedLoginAttempts.delete(key);
      }
    }
  }

  /**
   * Registra tentativa de login falhada
   */
  recordFailedLogin(identifier) {
    this.cleanupFailedAttempts();
    this.failedLoginAttempts.set(identifier, Date.now());
  }

  /**
   * Verifica se conta está bloqueada
   */
  isAccountLocked(identifier) {
    this.cleanupFailedAttempts();
    const attempts = this.failedLoginAttempts.get(identifier) || 0;
    return attempts >= 5; // Bloqueia após 5 tentativas
  }
}

// Exportar instância singleton
export const userService = new UserService();

export default UserService;