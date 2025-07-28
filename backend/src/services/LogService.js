import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LogService {
  constructor() {
    this.logsDir = path.join(__dirname, '../../storage/logs');
    this.logFiles = {
      error: path.join(this.logsDir, 'error.log'),
      warn: path.join(this.logsDir, 'warn.log'),
      info: path.join(this.logsDir, 'info.log'),
      debug: path.join(this.logsDir, 'debug.log'),
      access: path.join(this.logsDir, 'access.log'),
      system: path.join(this.logsDir, 'system.log')
    };
    this.initializeLogDirectory();
  }

  async initializeLogDirectory() {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      console.error('Erro ao criar diretório de logs:', error);
    }
  }

  async writeLog(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      service: 'backend',
      ...metadata
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      // Escreve no arquivo específico do nível
      if (this.logFiles[level]) {
        await fs.appendFile(this.logFiles[level], logLine);
      }
      
      // Escreve também no log geral do sistema
      await fs.appendFile(this.logFiles.system, logLine);
    } catch (error) {
      console.error('Erro ao escrever log:', error);
    }
  }

  async getLogs(filters = {}) {
    const {
      level,
      service,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50
    } = filters;

    try {
      let logFile = this.logFiles.system;
      
      // Se um nível específico foi solicitado, usa o arquivo correspondente
      if (level && this.logFiles[level]) {
        logFile = this.logFiles[level];
      }

      const fileContent = await fs.readFile(logFile, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.trim());
      
      let logs = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(log => log !== null);

      // Aplicar filtros
      if (service) {
        logs = logs.filter(log => log.service === service);
      }

      if (startDate) {
        const start = new Date(startDate);
        logs = logs.filter(log => new Date(log.timestamp) >= start);
      }

      if (endDate) {
        const end = new Date(endDate);
        logs = logs.filter(log => new Date(log.timestamp) <= end);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        logs = logs.filter(log => 
          log.message.toLowerCase().includes(searchLower) ||
          (log.userId && log.userId.toString().includes(searchLower)) ||
          (log.ip && log.ip.includes(searchLower))
        );
      }

      // Ordenar por timestamp (mais recente primeiro)
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Paginação
      const total = logs.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedLogs = logs.slice(offset, offset + limit);

      return {
        logs: paginatedLogs,
        total,
        page: parseInt(page),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      };
    } catch (error) {
      console.error('Erro ao ler logs:', error);
      return {
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      };
    }
  }

  async getLogServices() {
    try {
      const fileContent = await fs.readFile(this.logFiles.system, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.trim());
      
      const services = new Set();
      
      lines.forEach(line => {
        try {
          const log = JSON.parse(line);
          if (log.service) {
            services.add(log.service);
          }
        } catch {
          // Ignora linhas inválidas
        }
      });

      return Array.from(services).sort();
    } catch (error) {
      console.error('Erro ao obter serviços dos logs:', error);
      return [];
    }
  }

  async exportLogs(filters = {}, format = 'csv') {
    const logsData = await this.getLogs({ ...filters, page: 1, limit: 10000 });
    
    if (format === 'csv') {
      return this.exportToCSV(logsData.logs);
    } else if (format === 'json') {
      return JSON.stringify(logsData.logs, null, 2);
    }
    
    throw new Error('Formato de exportação não suportado');
  }

  exportToCSV(logs) {
    if (logs.length === 0) {
      return 'timestamp,level,message,service,userId,ip\n';
    }

    const headers = ['timestamp', 'level', 'message', 'service', 'userId', 'ip'];
    const csvHeader = headers.join(',') + '\n';
    
    const csvRows = logs.map(log => {
      return headers.map(header => {
        const value = log[header] || '';
        // Escape aspas duplas e envolve em aspas se contém vírgula
        const escapedValue = value.toString().replace(/"/g, '""');
        return escapedValue.includes(',') ? `"${escapedValue}"` : escapedValue;
      }).join(',');
    }).join('\n');

    return csvHeader + csvRows;
  }

  async clearOldLogs(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    for (const [level, logFile] of Object.entries(this.logFiles)) {
      try {
        const fileContent = await fs.readFile(logFile, 'utf-8');
        const lines = fileContent.trim().split('\n').filter(line => line.trim());
        
        const filteredLines = lines.filter(line => {
          try {
            const log = JSON.parse(line);
            return new Date(log.timestamp) >= cutoffDate;
          } catch {
            return false;
          }
        });

        await fs.writeFile(logFile, filteredLines.join('\n') + '\n');
        
        const removedCount = lines.length - filteredLines.length;
        if (removedCount > 0) {
          await this.writeLog('info', `Removidos ${removedCount} logs antigos do arquivo ${level}`, {
            operation: 'cleanup',
            daysToKeep,
            removedCount
          });
        }
      } catch (error) {
        console.error(`Erro ao limpar logs do arquivo ${level}:`, error);
      }
    }
  }

  // Método para integração com winston ou outros loggers
  createLogEntry(level, message, metadata = {}) {
    // Não escreve imediatamente, apenas retorna o objeto de log
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      service: 'backend',
      ...metadata
    };
  }
}

export default new LogService();