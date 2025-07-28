/**
 * Modelo de dados para usuários do sistema NewCAM
 * Gerencia operações CRUD e validações de usuários
 */

import bcrypt from 'bcryptjs';
import { supabaseAdmin, dbUtils, TABLES } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import { AppError, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';

const logger = createModuleLogger('UserModel');

/**
 * Utilitários locais
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>"'&]/g, '');
}

function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

class User {
  constructor(data = {}) {
    this.id = data.id;
    this.email = data.email;
    this.name = data.name;
    this.password = data.password;
    this.role = data.role || 'viewer';
    this.permissions = data.permissions || [];
    this.camera_access = data.camera_access || [];
    this.active = data.active !== undefined ? data.active : true;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_login_at = data.last_login_at;
    this.blocked_at = data.blocked_at;
    this.profile_image = data.profile_image;
    this.preferences = data.preferences || {};
  }

  // Validar dados do usuário
  validate() {
    const errors = [];

    // Validar email
    if (!this.email) {
      errors.push('Email é obrigatório');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.email)) {
        errors.push('Email deve ter um formato válido');
      }
    }

    // Validar nome
    if (!this.name) {
      errors.push('Nome é obrigatório');
    } else if (this.name.length < 2 || this.name.length > 100) {
      errors.push('Nome deve ter entre 2 e 100 caracteres');
    }

    // Validar senha (apenas para novos usuários)
    if (this.password && !this.id) {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(this.password)) {
        errors.push('Senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula e número');
      }
    }

    // Validar role
    const validRoles = ['admin', 'operator', 'viewer'];
    if (!validRoles.includes(this.role)) {
      errors.push('Role deve ser admin, operator ou viewer');
    }

    // Validar permissions (deve ser array)
    if (this.permissions && !Array.isArray(this.permissions)) {
      errors.push('Permissions deve ser um array');
    }

    // Validar camera_access (deve ser array de UUIDs)
    if (this.camera_access && !Array.isArray(this.camera_access)) {
      errors.push('Camera access deve ser um array');
    } else if (this.camera_access) {
      for (const cameraId of this.camera_access) {
        if (!isValidUUID(cameraId)) {
          errors.push(`ID de câmera inválido: ${cameraId}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Dados de usuário inválidos', errors);
    }
  }

  // Sanitizar dados
  sanitize() {
    if (this.email) this.email = sanitizeInput(this.email.toLowerCase().trim());
    if (this.name) this.name = sanitizeInput(this.name.trim());
    if (this.role) this.role = sanitizeInput(this.role.toLowerCase());
  }

  // Hash da senha
  async hashPassword() {
    if (this.password) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
    }
  }

  // Verificar senha
  async verifyPassword(plainPassword) {
    if (!this.password) {
      return false;
    }
    return await bcrypt.compare(plainPassword, this.password);
  }

  // Converter para objeto JSON (sem senha)
  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }

  // Salvar usuário
  async save() {
    try {
      this.sanitize();
      this.validate();

      if (this.password) {
        await this.hashPassword();
      }

      const now = new Date().toISOString();

      if (this.id) {
        // Atualizar usuário existente
        this.updated_at = now;
        
        const { data, error } = await supabaseAdmin
          .from(TABLES.USERS)
          .update({
            email: this.email,
            name: this.name,
            role: this.role,
            permissions: this.permissions,
            camera_access: this.camera_access,
            active: this.active,
            updated_at: this.updated_at,
            profile_image: this.profile_image,
            preferences: this.preferences,
            ...(this.password && { password: this.password })
          })
          .eq('id', this.id)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new ConflictError('Email já está em uso');
          }
          throw new AppError(`Erro ao atualizar usuário: ${error.message}`);
        }

        Object.assign(this, data);
        logger.info(`Usuário atualizado: ${this.email}`);
      } else {
        // Criar novo usuário
        this.created_at = now;
        this.updated_at = now;

        const { data, error } = await supabaseAdmin
          .from(TABLES.USERS)
          .insert({
            email: this.email,
            name: this.name,
            password: this.password,
            role: this.role,
            permissions: this.permissions,
            camera_access: this.camera_access,
            active: this.active,
            created_at: this.created_at,
            updated_at: this.updated_at,
            profile_image: this.profile_image,
            preferences: this.preferences
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new ConflictError('Email já está em uso');
          }
          throw new AppError(`Erro ao criar usuário: ${error.message}`);
        }

        Object.assign(this, data);
        logger.info(`Usuário criado: ${this.email}`);
      }

      return this;
    } catch (error) {
      logger.error('Erro ao salvar usuário:', error);
      throw error;
    }
  }

  // Deletar usuário
  async delete() {
    try {
      if (!this.id) {
        throw new ValidationError('ID do usuário é obrigatório para deletar');
      }

      const { error } = await supabaseAdmin
        .from(TABLES.USERS)
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new AppError(`Erro ao deletar usuário: ${error.message}`);
      }

      logger.info(`Usuário deletado: ${this.email}`);
      return true;
    } catch (error) {
      logger.error('Erro ao deletar usuário:', error);
      throw error;
    }
  }

  // Bloquear usuário
  async block() {
    try {
      this.blocked_at = new Date().toISOString();
      this.active = false;
      
      const { error } = await supabaseAdmin
        .from(TABLES.USERS)
        .update({
          blocked_at: this.blocked_at,
          active: this.active,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);

      if (error) {
        throw new AppError(`Erro ao bloquear usuário: ${error.message}`);
      }

      logger.info(`Usuário bloqueado: ${this.email}`);
      return this;
    } catch (error) {
      logger.error('Erro ao bloquear usuário:', error);
      throw error;
    }
  }

  // Desbloquear usuário
  async unblock() {
    try {
      this.blocked_at = null;
      this.active = true;
      
      const { error } = await supabaseAdmin
        .from(TABLES.USERS)
        .update({
          blocked_at: null,
          active: this.active,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id);

      if (error) {
        throw new AppError(`Erro ao desbloquear usuário: ${error.message}`);
      }

      logger.info(`Usuário desbloqueado: ${this.email}`);
      return this;
    } catch (error) {
      logger.error('Erro ao desbloquear usuário:', error);
      throw error;
    }
  }

  // Atualizar último login
  async updateLastLogin() {
    try {
      this.last_login_at = new Date().toISOString();
      
      const { error } = await supabaseAdmin
        .from(TABLES.USERS)
        .update({ last_login_at: this.last_login_at })
        .eq('id', this.id);

      if (error) {
        logger.warn(`Erro ao atualizar último login: ${error.message}`);
      }

      return this;
    } catch (error) {
      logger.error('Erro ao atualizar último login:', error);
      // Não propagar erro pois não é crítico
      return this;
    }
  }

  // Métodos estáticos

  // Buscar usuário por ID
  static async findById(id) {
    try {
      if (!isValidUUID(id)) {
        throw new ValidationError('ID de usuário inválido');
      }

      const { data, error } = await supabaseAdmin
        .from(TABLES.USERS)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new AppError(`Erro ao buscar usuário: ${error.message}`);
      }

      return new User(data);
    } catch (error) {
      logger.error('Erro ao buscar usuário por ID:', error);
      throw error;
    }
  }

  // Buscar usuário por email
  static async findByEmail(email) {
    try {
      const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());

      const { data, error } = await supabaseAdmin
        .from(TABLES.USERS)
        .select('*')
        .eq('email', sanitizedEmail)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new AppError(`Erro ao buscar usuário: ${error.message}`);
      }

      return new User(data);
    } catch (error) {
      logger.error('Erro ao buscar usuário por email:', error);
      throw error;
    }
  }

  // Listar usuários com paginação
  static async findAll(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        role = null,
        active = null,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = options;

      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from(TABLES.USERS)
        .select('*', { count: 'exact' });

      // Filtros
      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      if (role) {
        query = query.eq('role', role);
      }

      if (active !== null) {
        query = query.eq('active', active);
      }

      // Ordenação
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Paginação
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new AppError(`Erro ao listar usuários: ${error.message}`);
      }

      const users = data.map(userData => new User(userData));

      return {
        users,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Erro ao listar usuários:', error);
      throw error;
    }
  }

  // Contar usuários
  static async count(filters = {}) {
    try {
      let query = supabaseAdmin
        .from(TABLES.USERS)
        .select('*', { count: 'exact', head: true });

      if (filters.role) {
        query = query.eq('role', filters.role);
      }

      if (filters.active !== undefined) {
        query = query.eq('active', filters.active);
      }

      const { count, error } = await query;

      if (error) {
        throw new AppError(`Erro ao contar usuários: ${error.message}`);
      }

      return count;
    } catch (error) {
      logger.error('Erro ao contar usuários:', error);
      throw error;
    }
  }

  // Verificar se email já existe
  static async emailExists(email, excludeId = null) {
    try {
      const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());

      let query = supabaseAdmin
        .from(TABLES.USERS)
        .select('id')
        .eq('email', sanitizedEmail);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        throw new AppError(`Erro ao verificar email: ${error.message}`);
      }

      return !!data;
    } catch (error) {
      logger.error('Erro ao verificar se email existe:', error);
      throw error;
    }
  }
}

export { User };