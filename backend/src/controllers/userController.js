/**
 * UserController - Gerenciamento de usuários do sistema
 */
import { supabase, supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const logger = createModuleLogger('UserController');

/**
 * Controller para gerenciamento de usuários
 */
export class UserController {
  /**
   * Listar todos os usuários
   */
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      
      let query = supabaseAdmin
        .from('users')
        .select('id, email, name, role, is_active, last_login, created_at, updated_at', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data: users, error, count } = await query;

      if (error) {
        logger.error('Erro ao buscar usuários:', error);
        return res.status(500).json({ error: 'Erro ao buscar usuários' });
      }

      res.json({
        users: users || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      });
    } catch (error) {
      logger.error('Erro no getAllUsers:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Buscar usuário por ID
   */
  async getUserById(req, res) {
    try {
      const { id } = req.params;

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, email, name, role, is_active, last_login, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('Erro ao buscar usuário:', error);
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json({ user });
    } catch (error) {
      logger.error('Erro no getUserById:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Criar novo usuário
   */
  async createUser(req, res) {
    try {
      const { email, name, password, role = 'user' } = req.body;

      if (!email || !name || !password) {
        return res.status(400).json({ error: 'Email, nome e senha são obrigatórios' });
      }

      // Verificar se email já existe
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .insert([{
          email,
          name,
          password: hashedPassword,
          role,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('id, email, name, role, is_active, created_at')
        .single();

      if (error) {
        logger.error('Erro ao criar usuário:', error);
        return res.status(500).json({ error: 'Erro ao criar usuário' });
      }

      logger.info(`Novo usuário criado: ${email}`);
      res.status(201).json({ user });
    } catch (error) {
      logger.error('Erro no createUser:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Atualizar usuário
   */
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { name, role, is_active } = req.body;

      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (name !== undefined) updateData.name = name;
      if (role !== undefined) updateData.role = role;
      if (is_active !== undefined) updateData.is_active = is_active;

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select('id, email, name, role, is_active, updated_at')
        .single();

      if (error) {
        logger.error('Erro ao atualizar usuário:', error);
        return res.status(500).json({ error: 'Erro ao atualizar usuário' });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      logger.info(`Usuário atualizado: ${id}`);
      res.json({ user });
    } catch (error) {
      logger.error('Erro no updateUser:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Deletar usuário
   */
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Erro ao deletar usuário:', error);
        return res.status(500).json({ error: 'Erro ao deletar usuário' });
      }

      logger.info(`Usuário deletado: ${id}`);
      res.json({ message: 'Usuário deletado com sucesso' });
    } catch (error) {
      logger.error('Erro no deleteUser:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Atualizar senha do usuário
   */
  async updatePassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Senha é obrigatória' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const { error } = await supabaseAdmin
        .from('users')
        .update({
          password: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        logger.error('Erro ao atualizar senha:', error);
        return res.status(500).json({ error: 'Erro ao atualizar senha' });
      }

      logger.info(`Senha atualizada para usuário: ${id}`);
      res.json({ message: 'Senha atualizada com sucesso' });
    } catch (error) {
      logger.error('Erro no updatePassword:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  /**
   * Buscar estatísticas de usuários
   */
  async getUserStats(req, res) {
    try {
      const { data: stats, error } = await supabaseAdmin
        .from('users')
        .select('role, is_active, count()')
        .group('role, is_active');

      if (error) {
        logger.error('Erro ao buscar estatísticas:', error);
        return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
      }

      const total = stats.reduce((sum, stat) => sum + (stat.count || 0), 0);
      const active = stats.filter(s => s.is_active).reduce((sum, stat) => sum + (stat.count || 0), 0);

      res.json({
        total,
        active,
        inactive: total - active,
        byRole: stats.reduce((acc, stat) => {
          acc[stat.role] = (acc[stat.role] || 0) + (stat.count || 0);
          return acc;
        }, {})
      });
    } catch (error) {
      logger.error('Erro no getUserStats:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new UserController();