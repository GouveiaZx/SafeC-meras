/**
 * Configuração do Sistema de Relatórios e Arquivos
 * Define templates, formatos e regras para geração de relatórios
 */

export const REPORT_CONFIG = {
  // Tipos de relatórios disponíveis
  reportTypes: {
    SYSTEM: {
      id: 'system',
      name: 'Relatório do Sistema',
      description: 'Visão geral do sistema e métricas de desempenho',
      formats: ['pdf', 'csv', 'json'],
      defaultFormat: 'pdf',
      retentionDays: 90
    },
    CAMERAS: {
      id: 'cameras',
      name: 'Relatório de Câmeras',
      description: 'Análise de uso e desempenho das câmeras',
      formats: ['pdf', 'csv', 'xlsx'],
      defaultFormat: 'pdf',
      retentionDays: 180
    },
    RECORDINGS: {
      id: 'recordings',
      name: 'Relatório de Gravações',
      description: 'Estatísticas de gravações e armazenamento',
      formats: ['pdf', 'csv', 'xlsx'],
      defaultFormat: 'pdf',
      retentionDays: 365
    },
    USERS: {
      id: 'users',
      name: 'Relatório de Usuários',
      description: 'Atividades e acessos dos usuários',
      formats: ['pdf', 'csv'],
      defaultFormat: 'pdf',
      retentionDays: 730
    },
    SECURITY: {
      id: 'security',
      name: 'Relatório de Segurança',
      description: 'Eventos de segurança e alertas',
      formats: ['pdf', 'csv'],
      defaultFormat: 'pdf',
      retentionDays: 1095
    }
  },

  // Templates de relatórios
  templates: {
    dashboard: {
      sections: [
        'executive_summary',
        'system_overview',
        'camera_status',
        'recording_stats',
        'user_activity',
        'storage_usage',
        'performance_metrics',
        'alerts_summary'
      ]
    },
    detailed: {
      sections: [
        'full_system_metrics',
        'camera_usage_details',
        'recording_analytics',
        'user_access_logs',
        'security_events',
        'performance_trends',
        'capacity_planning',
        'recommendations'
      ]
    }
  },

  // Configurações de geração
  generation: {
    maxConcurrentReports: 3,
    timeoutMinutes: 30,
    retryAttempts: 3,
    batchSize: 1000,
    cacheDuration: 3600 // 1 hora
  },

  // Configurações de armazenamento
  storage: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedExtensions: ['.pdf', '.csv', '.xlsx', '.json'],
    compressionEnabled: true,
    encryptionEnabled: true
  },

  // Configurações de email
  email: {
    enabled: true,
    templates: {
      reportReady: {
        subject: 'Relatório NewCAM - Pronto para Download',
        template: 'report-ready'
      },
      reportFailed: {
        subject: 'Relatório NewCAM - Erro na Geração',
        template: 'report-failed'
      }
    }
  }
};

export const FILE_CONFIG = {
  // Configurações de upload
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10,
    allowedTypes: [
      'video/mp4',
      'video/avi',
      'video/mkv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'text/csv'
    ],
    tempDir: './uploads/temp',
    storageDir: './storage/files',
    virusScan: true
  },

  // Configurações de organização
  organization: {
    autoCategorize: true,
    folderStructure: {
      recordings: './storage/recordings/{year}/{month}/{day}',
      exports: './storage/exports/{year}/{month}/{day}',
      reports: './storage/reports/{year}/{month}/{day}',
      uploads: './storage/uploads/{year}/{month}/{day}'
    }
  },

  // Configurações de segurança
  security: {
    scanOnUpload: true,
    quarantineSuspicious: true,
    maxScanTime: 30000, // 30 segundos
    allowedFileNames: /^[a-zA-Z0-9._-]+$/,
    blockedExtensions: ['.exe', '.bat', '.cmd', '.com', '.scr', '.vbs']
  },

  // Configurações de backup
  backup: {
    enabled: true,
    retentionDays: 365,
    compression: true,
    encryption: true,
    schedule: '0 2 * * *' // 2 AM diariamente
  },

  // Configurações de limpeza
  cleanup: {
    enabled: true,
    maxAgeDays: 90,
    cleanupSchedule: '0 3 * * 0', // 3 AM aos domingos
    dryRun: false
  }
};

export const CHART_CONFIG = {
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4'
  },

  chartTypes: {
    line: { smooth: true, strokeWidth: 2 },
    bar: { borderRadius: 4, barWidth: '60%' },
    pie: { innerRadius: 0, outerRadius: '80%' },
    area: { smooth: true, fillOpacity: 0.3 }
  },

  responsive: {
    breakpoints: {
      mobile: 480,
      tablet: 768,
      desktop: 1024
    }
  }
};

export default {
  REPORT_CONFIG,
  FILE_CONFIG,
  CHART_CONFIG
};