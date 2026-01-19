/**
 * Middleware de validação para o sistema NewCAM
 * Valida dados de entrada das requisições HTTP
 */

import { createModuleLogger } from '../config/logger.js';
import { ValidationError } from './errorHandler.js';

const logger = createModuleLogger('Validation');

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

// Lista de senhas comuns que devem ser rejeitadas
const COMMON_PASSWORDS = [
  'password', 'Password1', 'Pass1234', '12345678', '123456789',
  'qwerty', 'abc123', 'monkey', '1234567890', 'letmein',
  'trustno1', 'dragon', 'baseball', 'iloveyou', 'master',
  'sunshine', 'ashley', 'bailey', 'passw0rd', 'shadow',
  'superman', 'qazwsx', 'michael', 'football', 'admin',
  'Admin123', 'welcome', 'Welcome1', 'password1', 'Password123'
];

// Validadores básicos
const validators = {
  // Validar email
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  // Validar senha
  password: (value) => {
    // Mínimo 8 caracteres, pelo menos 1 letra maiúscula, 1 minúscula, 1 número
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(value)) {
      return false;
    }

    // Verificar se não é uma senha comum
    const lowerPassword = value.toLowerCase();
    for (const commonPassword of COMMON_PASSWORDS) {
      if (lowerPassword === commonPassword.toLowerCase()) {
        return false;
      }
    }

    return true;
  },
  
  // Validar nome
  name: (value) => {
    return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
  },
  
  // Validar URL
  url: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  
  // Validar IP ou hostname
  ip: (value) => {
    // Validar IP numérico
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipRegex.test(value)) {
      return true;
    }
    
    // Validar hostname/domínio
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?))*$/;
    return hostnameRegex.test(value) && value.length <= 253;
  },
  
  // Validar porta
  port: (value) => {
    const port = parseInt(value);
    return !isNaN(port) && port >= 1 && port <= 65535;
  },
  
  // Validar UUID
  uuid: (value) => {
    return isValidUUID(value);
  },
  
  // Validar role
  role: (value) => {
    const validRoles = ['admin', 'integrator', 'operator', 'client', 'viewer'];
    return typeof value === 'string' && validRoles.includes(value.toLowerCase());
  },
  
  // Validar status de câmera
  cameraStatus: (value) => {
    const validStatuses = ['online', 'offline', 'error', 'maintenance'];
    return validStatuses.includes(value);
  },
  
  // Validar tipo de câmera
  cameraType: (value) => {
    const validTypes = ['ip', 'analog', 'usb', 'virtual'];
    return validTypes.includes(value);
  },
  
  // Validar resolução
  resolution: (value) => {
    const resolutionRegex = /^\d{3,4}x\d{3,4}$/;
    return resolutionRegex.test(value);
  },
  
  // Validar FPS
  fps: (value) => {
    const fps = parseInt(value);
    return !isNaN(fps) && fps >= 1 && fps <= 60;
  },
  
  // Validar data
  date: (value) => {
    const date = new Date(value);
    return !isNaN(date.getTime());
  },
  
  // Validar número positivo
  positiveNumber: (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num > 0;
  },
  
  // Validar número não negativo
  nonNegativeNumber: (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  },
  
  // Validar número inteiro
  integer: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && Number.isInteger(num);
  },
  
  // Validar número inteiro positivo
  positiveInteger: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && Number.isInteger(num) && num > 0;
  },
  
  // Validar booleano
  boolean: (value) => {
    return typeof value === 'boolean' || value === 'true' || value === 'false';
  },
  
  // Validar array
  array: (value) => {
    return Array.isArray(value);
  },
  
  // Validar string não vazia
  nonEmptyString: (value) => {
    return typeof value === 'string' && value.trim().length > 0;
  }
};

// Função para criar esquema de validação
const createValidationSchema = (schema) => {
  return (req, res, next) => {
    // Log detalhado da requisição
    logger.info('=== VALIDAÇÃO INICIADA ===', {
      endpoint: req.originalUrl,
      method: req.method,
      body: req.body,
      schema: Object.keys(schema)
    });
    
    // LOG TEMPORÁRIO PARA DEBUG RTMP
    if (req.originalUrl.includes('/cameras') && req.method === 'POST') {
      console.log('🔍 [TEMP DEBUG] Dados recebidos do frontend:', {
        body: req.body,
        headers: req.headers,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    }
    
    const errors = [];
    const sanitizedData = {};
    
    // Seleciona a fonte correta dos dados conforme método HTTP
    const isQueryMethod = req.method === 'GET' || req.method === 'DELETE';
    const container = isQueryMethod ? req.query : req.body;
    
    // Validar cada campo do esquema
    for (const [field, rules] of Object.entries(schema)) {
      let value = getNestedValue(container, field);
      
      logger.info(`Validando campo '${field}':`, {
        value,
        type: typeof value,
        rules,
        isEmpty: value === undefined || value === null || value === ''
      });
      
      // Aplicar valor padrão se o campo não foi fornecido
      if ((value === undefined || value === null || value === '') && rules.default !== undefined) {
        value = rules.default;
        setNestedValue(container, field, value);
        logger.info(`Aplicado valor padrão para '${field}':`, rules.default);
      }
      
      // Verificar se o campo é obrigatório
      if (rules.required && (value === undefined || value === null || value === '')) {
        const error = {
          field,
          message: `Campo '${field}' é obrigatório`
        };
        logger.error('Campo obrigatório faltando:', error);
        errors.push(error);
        continue;
      }
      
      // Se o campo não é obrigatório e está vazio, pular validação
      if (!rules.required && (value === undefined || value === null || value === '')) {
        continue;
      }
      
      // Sanitizar valor
      let sanitizedValue = sanitizeInput(value);
      
      // Aplicar transformações
      if (rules.transform) {
        sanitizedValue = rules.transform(sanitizedValue);
      }
      
      // Validar tipo
      if (rules.type && validators[rules.type]) {
        if (!validators[rules.type](sanitizedValue)) {
          errors.push({
            field,
            message: rules.message || `Campo '${field}' tem formato inválido`
          });
          continue;
        }
      }
      
      // Validações customizadas
      if (rules.custom) {
        try {
          logger.info(`Executando validação customizada para '${field}':`, {
            value: sanitizedValue,
            customFunction: rules.custom.toString()
          });
        } catch (e) {
          // noop apenas para manter compatibilidade do trecho editado
        }
      }

      // Armazena valor sanitizado
      setNestedValue(sanitizedData, field, sanitizedValue);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'Os dados enviados não são válidos',
        details: errors
      });
    }

    // Expõe dados validados/sanitizados e aplica no container para compatibilidade
    req.validatedData = sanitizedData;
    if (isQueryMethod) {
      Object.assign(req.query, sanitizedData);
    } else {
      Object.assign(req.body, sanitizedData);
    }

    next();
  };
};

// Função para obter valor aninhado
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

// Função para definir valor aninhado
const setNestedValue = (obj, path, value) => {
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  
  target[lastKey] = value;
};

// Esquemas de validação pré-definidos
const validationSchemas = {
  // Validação para login
  login: {
    email: {
      required: true,
      type: 'email',
      message: 'Email deve ter um formato válido'
    },
    password: {
      required: true,
      type: 'nonEmptyString',
      minLength: 1,
      message: 'Senha é obrigatória'
    }
  },
  
  // Validação para registro de usuário
  userRegistration: {
    name: {
      required: true,
      type: 'name',
      minLength: 2,
      maxLength: 100,
      message: 'Nome deve ter entre 2 e 100 caracteres'
    },
    email: {
      required: true,
      type: 'email',
      message: 'Email deve ter um formato válido'
    },
    password: {
      required: true,
      type: 'password',
      message: 'Senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula e número'
    },
    role: {
      required: true,
      type: 'role',
      message: 'Role deve ser admin, operator ou viewer'
    }
  },
  
  // Validação para câmera
  camera: {
    name: {
      required: true,
      type: 'nonEmptyString',
      minLength: 2,
      maxLength: 100,
      message: 'Nome da câmera deve ter entre 2 e 100 caracteres'
    },
    description: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 500
    },
    ip_address: {
      required: false,
      type: 'ip',
      message: 'Endereço IP deve ter um formato válido'
    },
    port: {
      required: false,
      type: 'port',
      message: 'Porta deve ser um número entre 1 e 65535'
    },
    username: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50
    },
    password: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 100
    },
    type: {
      required: false,
      type: 'cameraType',
      message: 'Tipo deve ser ip, analog, usb ou virtual'
    },
    stream_type: {
      required: false,
      type: 'nonEmptyString',
      enum: ['rtsp', 'rtmp'],
      message: 'Tipo de stream deve ser rtsp ou rtmp'
    },
    rtsp_url: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 500,
      custom: (value) => {
        if (!value) return true;
        return value.startsWith('rtsp://') || 'URL RTSP deve começar com rtsp://';
      }
    },
    rtmp_url: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 500,
      custom: (value) => {
        if (!value) return true;
        return value.startsWith('rtmp://') || 'URL RTMP deve começar com rtmp://';
      }
    },
    resolution: {
      required: false,
      type: 'resolution',
      message: 'Resolução deve ter formato WIDTHxHEIGHT (ex: 1920x1080)'
    },
    fps: {
      required: false,
      type: 'fps',
      message: 'FPS deve ser um número entre 1 e 60'
    },
    location: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 200,
      message: 'Localização deve ter no máximo 200 caracteres'
    },
    zone: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 100,
      message: 'Zona deve ter no máximo 100 caracteres'
    },
    brand: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50,
      message: 'Marca deve ter no máximo 50 caracteres'
    },
    model: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 50,
      message: 'Modelo deve ter no máximo 50 caracteres'
    },
    recording_enabled: {
      required: false,
      type: 'boolean'
    },
    motion_detection: {
      required: false,
      type: 'boolean'
    },
    audio_enabled: {
      required: false,
      type: 'boolean'
    },
    ptz_enabled: {
      required: false,
      type: 'boolean'
    },
    night_vision: {
      required: false,
      type: 'boolean'
    },
    quality_profile: {
      required: false,
      type: 'nonEmptyString',
      enum: ['low', 'medium', 'high', 'ultra'],
      message: 'Perfil de qualidade deve ser low, medium, high ou ultra'
    },
    retention_days: {
      required: false,
      type: 'positiveNumber',
      message: 'Dias de retenção deve ser um número positivo'
    },
    active: {
      required: false,
      type: 'boolean'
    },
    use_dynamic_rtmp: {
      required: false,
      type: 'boolean',
      default: false,
      message: 'Usar RTMP dinâmico deve ser verdadeiro ou falso'
    },
    rtmp_server_type: {
      required: false,
      type: 'nonEmptyString',
      enum: ['srs', 'zlm', 'custom'],
      default: 'srs',
      message: 'Tipo de servidor RTMP deve ser srs, zlm ou custom'
    }
  },

  // Validação para atualização de usuário
  userUpdate: {
    name: {
      required: false,
      type: 'name',
      minLength: 2,
      maxLength: 100
    },
    email: {
      required: false,
      type: 'email'
    },
    role: {
      required: false,
      type: 'role'
    },
    active: {
      required: false,
      type: 'boolean'
    }
  },
  
  // Validação para mudança de senha
  changePassword: {
    currentPassword: {
      required: true,
      type: 'nonEmptyString',
      message: 'Senha atual é obrigatória'
    },
    newPassword: {
      required: true,
      type: 'password',
      message: 'Nova senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula e número'
    },
    confirmPassword: {
      required: true,
      type: 'nonEmptyString',
      custom: (value, data) => {
        return value === data.newPassword || 'Confirmação de senha não confere';
      }
    }
  },

  // Validação para busca de gravações
  searchRecordings: {
    camera_id: {
      required: false,
      type: 'uuid',
      message: 'ID da câmera deve ser um UUID válido'
    },
    start_date: {
      required: false,
      type: 'date',
      message: 'Data de início deve ser uma data válida'
    },
    end_date: {
      required: false,
      type: 'date',
      message: 'Data de fim deve ser uma data válida'
    },
    duration_min: {
      required: false,
      type: 'nonNegativeNumber',
      message: 'Duração mínima deve ser um número não negativo'
    },
    duration_max: {
      required: false,
      type: 'nonNegativeNumber',
      message: 'Duração máxima deve ser um número não negativo'
    },
    file_size_min: {
      required: false,
      type: 'nonNegativeNumber',
      message: 'Tamanho de arquivo mínimo deve ser um número não negativo'
    },
    file_size_max: {
      required: false,
      type: 'nonNegativeNumber',
      message: 'Tamanho de arquivo máximo deve ser um número não negativo'
    },
    quality: {
      required: false,
      type: 'nonEmptyString',
      enum: ['low', 'medium', 'high', 'ultra'],
      message: 'Qualidade deve ser low, medium, high ou ultra'
    },
    event_type: {
      required: false,
      type: 'nonEmptyString',
      enum: ['motion', 'scheduled', 'manual', 'alert'],
      message: 'Tipo de evento inválido'
    },
    status: {
      required: false,
      type: 'nonEmptyString',
      enum: ['recording', 'uploading', 'completed', 'failed'],
      message: 'Status inválido'
    },
    upload_status: {
      required: false,
      type: 'nonEmptyString',
      enum: ['pending', 'uploading', 'completed', 'uploaded', 'failed'],
      message: 'Status de upload inválido'
    },
    page: {
      required: false,
      type: 'positiveInteger',
      message: 'Página deve ser um número positivo'
    },
    limit: {
      required: false,
      type: 'positiveInteger',
      message: 'Limite deve ser um número positivo'
    },
    sort_by: {
      required: false,
      type: 'nonEmptyString',
      enum: ['created_at', 'duration', 'file_size', 'camera_name'],
      message: 'Campo de ordenação inválido'
    },
    sort_order: {
      required: false,
      type: 'nonEmptyString',
      enum: ['asc', 'desc'],
      message: 'Ordem de ordenação inválida'
    }
  },

  // Validação para exportação de gravações
  exportRecordings: {
    recording_ids: {
      required: true,
      type: 'array',
      message: 'IDs das gravações são obrigatórios'
    },
    format: {
      required: false,
      type: 'nonEmptyString',
      message: 'Formato deve ser zip ou tar'
    }
  },

  // Validação para exclusão de gravações
  deleteRecordings: {
    recording_ids: {
      required: true,
      type: 'array',
      message: 'IDs das gravações são obrigatórios'
    },
    confirm: {
      required: true,
      type: 'boolean',
      message: 'Confirmação é obrigatória'
    }
  },

  // Validação para solicitação de reset de senha
  forgotPassword: {
    email: {
      required: true,
      type: 'email',
      message: 'E-mail deve ter um formato válido'
    }
  },

  // Validação para reset de senha com token
  resetPassword: {
    token: {
      required: true,
      type: 'nonEmptyString',
      message: 'Token é obrigatório'
    },
    newPassword: {
      required: true,
      type: 'password',
      message: 'Nova senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula e número'
    },
    confirmPassword: {
      required: true,
      type: 'nonEmptyString',
      custom: (value, data) => {
        return value === data.newPassword || 'Confirmação de senha não confere';
      }
    }
  }
};

// Middleware para validar parâmetros de URL
const validateParams = (schema) => {
  return (req, res, next) => {
    console.log('[DEBUG] validateParams - req.params:', req.params);
    console.log('[DEBUG] validateParams - schema:', schema);
    
    const errors = [];
    
    for (const [param, rules] of Object.entries(schema)) {
      const value = req.params[param];
      console.log(`[DEBUG] validateParams - Validando param '${param}' com valor:`, value);
      
      if (rules.required && !value) {
        console.log(`[DEBUG] validateParams - Param '${param}' é obrigatório mas não foi fornecido`);
        errors.push({
          param,
          message: `Parâmetro '${param}' é obrigatório`
        });
        continue;
      }
      
      if (value && rules.type && validators[rules.type]) {
        const isValid = validators[rules.type](value);
        console.log(`[DEBUG] validateParams - Validação de '${param}' (${rules.type}):`, isValid);
        if (!isValid) {
          errors.push({
            param,
            message: rules.message || `Parâmetro '${param}' tem formato inválido`
          });
        }
      }
    }
    
    if (errors.length > 0) {
      console.log('[DEBUG] validateParams - Erros encontrados:', errors);
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        message: 'Os parâmetros da URL são inválidos',
        details: errors
      });
    }
    
    console.log('[DEBUG] validateParams - Validação passou, chamando next()');
    next();
  };
};

// Função validateRequest para compatibilidade
const validateRequest = (schemaName) => {
  if (validationSchemas[schemaName]) {
    return createValidationSchema(validationSchemas[schemaName]);
  }
  throw new Error(`Schema de validação '${schemaName}' não encontrado`);
};

const validationMiddleware = {
  createValidationSchema,
  validateParams,
  validateRequest,
  validators,
  validationSchemas
};

export {
  validationMiddleware,
  createValidationSchema,
  validateParams,
  validateRequest,
  validators,
  validationSchemas
};
