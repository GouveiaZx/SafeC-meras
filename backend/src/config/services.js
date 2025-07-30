/**
 * Configuração de Serviços - NewCAM
 * Centraliza a configuração e inicialização dos serviços
 */

import { UserService } from '../services/UserService.js';
import { FileService } from '../services/FileService.js';
import { ReportService } from '../services/ReportService.js';

// Configuração dos serviços
export const servicesConfig = {
  // Configurações do UserService
  userService: {
    password: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    },
    session: {
      maxFailedAttempts: 5,
      lockDuration: 30 * 60 * 1000, // 30 minutos
      maxSessionDuration: 24 * 60 * 60 * 1000 // 24 horas
    },
    permissions: {
      roles: ['admin', 'manager', 'operator', 'viewer'],
      defaultRole: 'viewer'
    }
  },

  // Configurações do FileService
  fileService: {
    upload: {
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      allowedTypes: [
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/mkv',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'text/csv',
        'application/json'
      ],
      allowedExtensions: ['.mp4', '.avi', '.mov', '.mkv', '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.csv', '.json']
    },
    storage: {
      maxStorage: 100 * 1024 * 1024 * 1024, // 100GB
      retentionDays: 90,
      backupEnabled: true,
      compressionEnabled: true
    },
    processing: {
      generateThumbnails: true,
      thumbnailQuality: 80,
      thumbnailSize: { width: 320, height: 180 }
    }
  },

  // Configurações do ReportService
  reportService: {
    generation: {
      maxConcurrentReports: 3,
      timeout: 10 * 60 * 1000, // 10 minutos
      retryAttempts: 3,
      retryDelay: 5000
    },
    formats: {
      supported: ['pdf', 'csv', 'json', 'xlsx'],
      default: 'pdf',
      quality: 'high'
    },
    storage: {
      retentionDays: 365,
      maxReportsPerUser: 100,
      autoCleanup: true
    },
    scheduling: {
      enabled: true,
      defaultSchedule: '0 6 * * *', // 6 AM diariamente
      timezone: 'America/Sao_Paulo'
    }
  }
};

// Instâncias dos serviços
export const services = {
  userService: null,
  fileService: null,
  reportService: null
};

/**
 * Inicializa todos os serviços
 */
export async function initializeServices() {
  try {
    console.log('Inicializando serviços...');

    // Inicializar UserService
    services.userService = new UserService();
    console.log('✓ UserService inicializado');

    // Inicializar FileService
    services.fileService = new FileService();
    await services.fileService.initStorage();
    console.log('✓ FileService inicializado');

    // Inicializar ReportService
    services.reportService = new ReportService();
    console.log('✓ ReportService inicializado');

    // Agendar tarefas de manutenção
    scheduleMaintenanceTasks();

    console.log('Todos os serviços foram inicializados com sucesso');
    return services;

  } catch (error) {
    console.error('Erro ao inicializar serviços:', error);
    throw error;
  }
}

/**
 * Agenda tarefas de manutenção
 */
function scheduleMaintenanceTasks() {
  // Limpeza diária de arquivos antigos
  setInterval(() => {
    if (services.fileService) {
      services.fileService.cleanupOldFiles();
    }
  }, 24 * 60 * 60 * 1000);

  // Limpeza diária de relatórios antigos
  setInterval(() => {
    if (services.reportService) {
      services.reportService.cleanupOldReports();
    }
  }, 24 * 60 * 60 * 1000);

  // Limpeza de tentativas de login falhadas
  setInterval(() => {
    if (services.userService) {
      services.userService.cleanupFailedAttempts();
    }
  }, 60 * 60 * 1000); // A cada hora

  console.log('Tarefas de manutenção agendadas');
}

/**
 * Obtém instância de um serviço
 */
export function getService(serviceName) {
  if (!services[serviceName]) {
    throw new Error(`Serviço ${serviceName} não inicializado`);
  }
  return services[serviceName];
}

/**
 * Middleware para injetar serviços nas rotas
 */
export function injectServices(req, res, next) {
  req.services = services;
  next();
}

// Exportar configuração padrão
export default {
  servicesConfig,
  initializeServices,
  getService,
  injectServices
};