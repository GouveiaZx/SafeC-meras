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
    return passwordRegex.test(value);
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
  
  // Validar IP
  ip: (value) => {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(value);
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
    const validRoles = ['admin', 'operator', 'viewer'];
    return validRoles.includes(value);
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
  
  // Validar número inteiro
  integer: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && Number.isInteger(num);
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
    const errors = [];
    const sanitizedData = {};
    
    // Validar cada campo do esquema
    for (const [field, rules] of Object.entries(schema)) {
      const value = getNestedValue(req.body, field);
      
      // Verificar se o campo é obrigatório
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field,
          message: `Campo '${field}' é obrigatório`
        });
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
        const customValidation = rules.custom(sanitizedValue);
        if (customValidation !== true) {
          errors.push({
            field,
            message: customValidation || `Campo '${field}' é inválido`
          });
          continue;
        }
      }
      
      // Validar comprimento mínimo
      if (rules.minLength && sanitizedValue.length < rules.minLength) {
        errors.push({
          field,
          message: `Campo '${field}' deve ter pelo menos ${rules.minLength} caracteres`
        });
        continue;
      }
      
      // Validar comprimento máximo
      if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
        errors.push({
          field,
          message: `Campo '${field}' deve ter no máximo ${rules.maxLength} caracteres`
        });
        continue;
      }
      
      // Validar valor mínimo
      if (rules.min !== undefined && parseFloat(sanitizedValue) < rules.min) {
        errors.push({
          field,
          message: `Campo '${field}' deve ser maior ou igual a ${rules.min}`
        });
        continue;
      }
      
      // Validar valor máximo
      if (rules.max !== undefined && parseFloat(sanitizedValue) > rules.max) {
        errors.push({
          field,
          message: `Campo '${field}' deve ser menor ou igual a ${rules.max}`
        });
        continue;
      }
      
      // Validar valores permitidos
      if (rules.enum && !rules.enum.includes(sanitizedValue)) {
        errors.push({
          field,
          message: `Campo '${field}' deve ser um dos valores: ${rules.enum.join(', ')}`
        });
        continue;
      }
      
      // Adicionar valor sanitizado
      setNestedValue(sanitizedData, field, sanitizedValue);
    }
    
    // Se há erros, retornar erro de validação
    if (errors.length > 0) {
      logger.warn('Erro de validação:', { errors, body: req.body });
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'Os dados fornecidos não passaram na validação',
        details: errors
      });
    }
    
    // Adicionar dados sanitizados à requisição
    req.validatedData = sanitizedData;
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
      required: true,
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
      required: true,
      type: 'cameraType',
      message: 'Tipo deve ser ip, analog, usb ou virtual'
    },
    stream_type: {
      required: false,
      enum: ['rtsp', 'rtmp'],
      message: 'Tipo de stream deve ser rtsp ou rtmp'
    },
    rtsp_url: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 500
    },
    rtmp_url: {
      required: false,
      type: 'nonEmptyString',
      maxLength: 500
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
    active: {
      required: false,
      type: 'boolean'
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
    page: {
      required: false,
      type: 'positiveInteger',
      message: 'Página deve ser um número positivo'
    },
    limit: {
      required: false,
      type: 'positiveInteger',
      message: 'Limite deve ser um número positivo'
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