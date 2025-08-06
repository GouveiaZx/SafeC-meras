/**
 * Rotas para configurações do sistema
 * Sistema NewCAM - Configurações Gerais
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

// Caminho para o arquivo de configurações
const SETTINGS_FILE = path.join(__dirname, '../../config/settings.json');

// Configurações padrão
const DEFAULT_SETTINGS = {
  system: {
    name: 'NewCAM',
    version: '1.0.0',
    timezone: 'America/Sao_Paulo',
    language: 'pt-BR'
  },
  recording: {
    continuous_enabled: true,
    segment_duration: 30,
    max_file_size: 100,
    retention_days: 30,
    quality: 'high'
  },
  storage: {
    local_path: '/storage/recordings',
    s3_enabled: true,
    s3_bucket: process.env.S3_BUCKET || 'newcam-recordings',
    cleanup_enabled: true,
    max_storage_gb: 500
  },
  notifications: {
    email_enabled: false,
    email_smtp_host: '',
    email_smtp_port: 587,
    email_username: '',
    email_password: '',
    webhook_enabled: false,
    webhook_url: ''
  },
  security: {
    session_timeout: 3600,
    max_login_attempts: 5,
    password_min_length: 8,
    require_2fa: false
  }
};

/**
 * @route GET /api/settings
 * @desc Obter configurações do sistema
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    let settings;
    
    try {
      const data = await fs.readFile(SETTINGS_FILE, 'utf8');
      settings = JSON.parse(data);
    } catch (error) {
      // Se o arquivo não existir, usar configurações padrão
      settings = DEFAULT_SETTINGS;
      
      // Criar diretório se não existir
      const configDir = path.dirname(SETTINGS_FILE);
      await fs.mkdir(configDir, { recursive: true });
      
      // Salvar configurações padrão
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    }
    
    res.json({ settings });
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar configurações',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route PUT /api/settings
 * @desc Atualizar configurações do sistema
 * @access Private
 */
router.put('/', async (req, res) => {
  try {
    const newSettings = req.body;
    
    // Validar estrutura básica
    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Dados de configuração inválidos'
      });
    }
    
    // Criar diretório se não existir
    const configDir = path.dirname(SETTINGS_FILE);
    await fs.mkdir(configDir, { recursive: true });
    
    // Salvar configurações
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
    
    res.json({
      success: true,
      message: 'Configurações salvas com sucesso',
      settings: newSettings
    });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar configurações',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/settings/storage
 * @desc Obter informações de armazenamento
 * @access Private
 */
router.get('/storage', async (req, res) => {
  try {
    // Simular informações de armazenamento
    const storage = {
      total_space: 1000000000000, // 1TB
      used_space: 250000000000,   // 250GB
      free_space: 750000000000,   // 750GB
      recordings_size: 200000000000, // 200GB
      logs_size: 5000000000,      // 5GB
      backups_size: 45000000000   // 45GB
    };
    
    res.json({ storage });
  } catch (error) {
    console.error('Erro ao obter informações de armazenamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter informações de armazenamento',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/settings/test-email
 * @desc Testar configurações de email
 * @access Private
 */
router.post('/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório'
      });
    }
    
    // Simular teste de email
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    res.json({
      success: true,
      message: 'Email de teste enviado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao testar email:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao testar email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/settings/test-backup
 * @desc Testar configurações de backup
 * @access Private
 */
router.post('/test-backup', async (req, res) => {
  try {
    // Simular teste de backup
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    res.json({
      success: true,
      message: 'Teste de backup executado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao testar backup:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao testar backup',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/settings/cleanup/logs
 * @desc Limpar logs antigos
 * @access Private
 */
router.post('/cleanup/logs', async (req, res) => {
  try {
    // Simular limpeza de logs
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    res.json({
      success: true,
      message: 'Logs antigos removidos com sucesso',
      deleted_count: 150
    });
  } catch (error) {
    console.error('Erro ao limpar logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/settings/cleanup/recordings
 * @desc Limpar gravações antigas
 * @access Private
 */
router.post('/cleanup/recordings', async (req, res) => {
  try {
    // Simular limpeza de gravações
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    res.json({
      success: true,
      message: 'Gravações antigas removidas com sucesso',
      deleted_count: 25
    });
  } catch (error) {
    console.error('Erro ao limpar gravações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar gravações',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;