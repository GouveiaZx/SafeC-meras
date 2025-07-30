/**
 * Serviço de Relatórios - NewCAM
 * Responsável pela geração, processamento e gerenciamento de relatórios
 */

import { REPORT_CONFIG, FILE_CONFIG } from '../config/reports.config.js';
import { supabaseAdmin } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ReportService {
  constructor() {
    this.activeReports = new Map();
    this.reportQueue = [];
    this.isProcessing = false;
  }

  /**
   * Gera um relatório baseado no tipo e parâmetros
   */
  async generateReport(reportType, parameters, userId) {
    try {
      // Validar tipo de relatório
      const config = REPORT_CONFIG.reportTypes[reportType.toUpperCase()];
      if (!config) {
        throw new Error(`Tipo de relatório inválido: ${reportType}`);
      }

      // Criar registro do relatório
      const reportId = this.generateReportId();
      const report = {
        id: reportId,
        type: reportType,
        parameters,
        userId,
        status: 'pending',
        createdAt: new Date(),
        progress: 0
      };

      this.activeReports.set(reportId, report);
      this.reportQueue.push(report);

      // Processar em background
      this.processReportQueue();

      return {
        success: true,
        reportId,
        message: 'Relatório adicionado à fila de processamento'
      };

    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      throw error;
    }
  }

  /**
   * Processa a fila de relatórios
   */
  async processReportQueue() {
    if (this.isProcessing || this.reportQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.reportQueue.length > 0) {
      const report = this.reportQueue.shift();
      await this.processReport(report);
    }

    this.isProcessing = false;
  }

  /**
   * Processa um relatório individual
   */
  async processReport(report) {
    try {
      report.status = 'processing';
      report.progress = 10;

      // Coletar dados baseados no tipo
      const data = await this.collectReportData(report.type, report.parameters);
      
      report.progress = 50;

      // Gerar arquivo do relatório
      const filePath = await this.generateReportFile(report, data);
      
      report.progress = 90;

      // Salvar no banco
      await this.saveReportRecord(report, filePath);

      report.status = 'completed';
      report.progress = 100;
      report.filePath = filePath;

    } catch (error) {
      report.status = 'failed';
      report.error = error.message;
      console.error(`Erro ao processar relatório ${report.id}:`, error);
    }
  }

  /**
   * Coleta dados para o relatório
   */
  async collectReportData(reportType, parameters) {
    const { startDate, endDate, cameraId } = parameters;

    switch (reportType) {
      case 'system':
        return await this.collectSystemData(startDate, endDate);
      case 'cameras':
        return await this.collectCameraData(startDate, endDate, cameraId);
      case 'recordings':
        return await this.collectRecordingData(startDate, endDate, cameraId);
      case 'users':
        return await this.collectUserData(startDate, endDate);
      case 'security':
        return await this.collectSecurityData(startDate, endDate);
      default:
        throw new Error(`Tipo de relatório não suportado: ${reportType}`);
    }
  }

  /**
   * Coleta dados do sistema
   */
  async collectSystemData(startDate, endDate) {
    const [cameras, recordings, users, logs] = await Promise.all([
      supabaseAdmin.from('cameras').select('*'),
      supabaseAdmin.from('recordings').select('*').gte('created_at', startDate).lte('created_at', endDate),
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('system_logs').select('*').gte('created_at', startDate).lte('created_at', endDate)
    ]);

    return {
      cameras: cameras.data || [],
      recordings: recordings.data || [],
      users: users.data || [],
      logs: logs.data || [],
      period: { startDate, endDate }
    };
  }

  /**
   * Coleta dados das câmeras
   */
  async collectCameraData(startDate, endDate, cameraId) {
    let cameraQuery = supabaseAdmin.from('cameras').select('*');
    if (cameraId) {
      cameraQuery = cameraQuery.eq('id', cameraId);
    }

    const [cameras, recordings, accessLogs] = await Promise.all([
      cameraQuery,
      supabaseAdmin.from('recordings').select('*').gte('created_at', startDate).lte('created_at', endDate),
      supabaseAdmin.from('camera_access_logs').select('*').gte('created_at', startDate).lte('created_at', endDate)
    ]);

    return {
      cameras: cameras.data || [],
      recordings: recordings.data || [],
      accessLogs: accessLogs.data || [],
      period: { startDate, endDate }
    };
  }

  /**
   * Coleta dados de gravações
   */
  async collectRecordingData(startDate, endDate, cameraId) {
    let recordingQuery = supabaseAdmin.from('recordings').select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (cameraId) {
      recordingQuery = recordingQuery.eq('camera_id', cameraId);
    }

    const recordings = await recordingQuery;
    const cameras = await supabaseAdmin.from('cameras').select('id, name');

    return {
      recordings: recordings.data || [],
      cameras: cameras.data || [],
      period: { startDate, endDate }
    };
  }

  /**
   * Coleta dados de usuários
   */
  async collectUserData(startDate, endDate) {
    const [users, sessions, accessLogs] = await Promise.all([
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('user_sessions').select('*').gte('created_at', startDate).lte('created_at', endDate),
      supabaseAdmin.from('camera_access_logs').select('*').gte('created_at', startDate).lte('created_at', endDate)
    ]);

    return {
      users: users.data || [],
      sessions: sessions.data || [],
      accessLogs: accessLogs.data || [],
      period: { startDate, endDate }
    };
  }

  /**
   * Coleta dados de segurança
   */
  async collectSecurityData(startDate, endDate) {
    const [alerts, logs, failedLogins] = await Promise.all([
      supabaseAdmin.from('alerts').select('*').gte('created_at', startDate).lte('created_at', endDate),
      supabaseAdmin.from('system_logs').select('*').gte('created_at', startDate).lte('created_at', endDate),
      supabaseAdmin.from('system_logs').select('*').eq('level', 'error').gte('created_at', startDate).lte('created_at', endDate)
    ]);

    return {
      alerts: alerts.data || [],
      logs: logs.data || [],
      failedLogins: failedLogins.data || [],
      period: { startDate, endDate }
    };
  }

  /**
   * Gera o arquivo do relatório
   */
  async generateReportFile(report, data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${report.type}_report_${timestamp}.json`;
    const filePath = path.join(FILE_CONFIG.upload.storageDir, 'reports', filename);

    // Garantir que o diretório existe
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Salvar dados como JSON
    const reportData = {
      metadata: {
        reportId: report.id,
        type: report.type,
        generatedAt: new Date().toISOString(),
        parameters: report.parameters,
        generatedBy: report.userId
      },
      data
    };

    await fs.writeFile(filePath, JSON.stringify(reportData, null, 2));

    return filePath;
  }

  /**
   * Salva registro do relatório no banco
   */
  async saveReportRecord(report, filePath) {
    const stats = await fs.stat(filePath);

    await supabaseAdmin.from('report_metadata').insert({
      report_type: report.type,
      title: `Relatório ${report.type} - ${new Date().toLocaleDateString('pt-BR')}`,
      description: `Relatório gerado automaticamente para o período de ${report.parameters.startDate} a ${report.parameters.endDate}`,
      parameters: report.parameters,
      generated_by: report.userId,
      file_path: filePath,
      file_size: stats.size,
      format: 'json',
      status: 'completed'
    });
  }

  /**
   * Lista relatórios do usuário
   */
  async listReports(userId, limit = 50, offset = 0) {
    const { data, error } = await supabaseAdmin
      .from('report_metadata')
      .select('*')
      .or(`generated_by.eq.${userId},generated_by.is.null`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data;
  }

  /**
   * Obtém status de um relatório
   */
  async getReportStatus(reportId) {
    const report = this.activeReports.get(reportId);
    if (report) {
      return report;
    }

    const { data, error } = await supabaseAdmin
      .from('report_metadata')
      .select('*')
      .eq('id', reportId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Baixa um relatório
   */
  async downloadReport(reportId) {
    const { data, error } = await supabaseAdmin
      .from('report_metadata')
      .select('file_path')
      .eq('id', reportId)
      .single();

    if (error) throw error;
    if (!data?.file_path) throw new Error('Arquivo do relatório não encontrado');

    return data.file_path;
  }

  /**
   * Remove um relatório
   */
  async deleteReport(reportId) {
    const { data, error } = await supabaseAdmin
      .from('report_metadata')
      .select('file_path')
      .eq('id', reportId)
      .single();

    if (error) throw error;

    // Deletar arquivo
    if (data?.file_path) {
      try {
        await fs.unlink(data.file_path);
      } catch (err) {
        console.warn('Arquivo já removido:', data.file_path);
      }
    }

    // Deletar registro
    const { error: deleteError } = await supabaseAdmin
      .from('report_metadata')
      .delete()
      .eq('id', reportId);

    if (deleteError) throw deleteError;

    return { success: true, message: 'Relatório removido com sucesso' };
  }

  /**
   * Gera ID único para relatório
   */
  generateReportId() {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Limpa relatórios antigos
   */
  async cleanupOldReports() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 dias

    const { data, error } = await supabaseAdmin
      .from('report_metadata')
      .select('id, file_path')
      .lt('created_at', cutoffDate.toISOString())
      .eq('status', 'completed');

    if (error) {
      console.error('Erro ao buscar relatórios antigos:', error);
      return;
    }

    for (const report of data || []) {
      await this.deleteReport(report.id);
    }

    console.log(`Relatórios antigos removidos: ${data?.length || 0}`);
  }
}

// Exportar instância singleton
export const reportService = new ReportService();

// Agendar limpeza diária
setInterval(() => {
  reportService.cleanupOldReports();
}, 24 * 60 * 60 * 1000); // 24 horas

export default ReportService;