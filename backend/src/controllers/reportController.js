/**
 * ReportController - Geração de relatórios e dashboards
 */
import { supabase, supabaseAdmin } from '../config/database.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('ReportController');

/**
 * Controller para geração de relatórios
 */
export class ReportController {
  /**
   * Dashboard geral do sistema
   */
  async getDashboard(req, res) {
    try {
      const [cameras, recordings, alerts, users] = await Promise.all([
        this.getCameraStats(),
        this.getRecordingStats(),
        this.getAlertStats(),
        this.getUserStats()
      ]);

      res.json({
        cameras,
        recordings,
        alerts,
        users,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro no getDashboard:', error);
      res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
  }

  /**
   * Estatísticas de câmeras
   */
  async getCameraStats() {
    try {
      const { data: stats, error } = await supabaseAdmin
        .from('cameras')
        .select('status, recording_enabled, motion_detection, count()')
        .group('status, recording_enabled, motion_detection');

      if (error) throw error;

      const total = stats.reduce((sum, stat) => sum + (stat.count || 0), 0);
      const online = stats.filter(s => s.status === 'online').reduce((sum, stat) => sum + (stat.count || 0), 0);
      const recording = stats.filter(s => s.recording_enabled).reduce((sum, stat) => sum + (stat.count || 0), 0);

      return {
        total,
        online,
        offline: total - online,
        recording,
        byStatus: stats.reduce((acc, stat) => {
          const key = `${stat.status}_${stat.recording_enabled ? 'recording' : 'not_recording'}`;
          acc[key] = (acc[key] || 0) + (stat.count || 0);
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Erro ao buscar estatísticas de câmeras:', error);
      throw error;
    }
  }

  /**
   * Estatísticas de gravações
   */
  async getRecordingStats() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      const [total, todayCount, weekCount, monthCount] = await Promise.all([
        supabaseAdmin.from('recordings').select('count()').single(),
        supabaseAdmin.from('recordings').select('count()').gte('created_at', today.toISOString()).single(),
        supabaseAdmin.from('recordings').select('count()').gte('created_at', lastWeek.toISOString()).single(),
        supabaseAdmin.from('recordings').select('count()').gte('created_at', lastMonth.toISOString()).single()
      ]);

      const { data: sizeStats } = await supabaseAdmin
        .from('recordings')
        .select('file_size, format')
        .not('file_size', 'is', null);

      const totalSize = sizeStats?.reduce((sum, rec) => sum + (rec.file_size || 0), 0) || 0;

      return {
        total: total.data?.count || 0,
        today: todayCount.data?.count || 0,
        thisWeek: weekCount.data?.count || 0,
        thisMonth: monthCount.data?.count || 0,
        totalSize: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100, // GB
        byFormat: sizeStats?.reduce((acc, rec) => {
          acc[rec.format] = (acc[rec.format] || 0) + 1;
          return acc;
        }, {}) || {}
      };
    } catch (error) {
      logger.error('Erro ao buscar estatísticas de gravações:', error);
      throw error;
    }
  }

  /**
   * Estatísticas de alertas
   */
  async getAlertStats() {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [total, recent, week] = await Promise.all([
        supabaseAdmin.from('alerts').select('count()').single(),
        supabaseAdmin.from('alerts').select('count()').gte('created_at', last24h.toISOString()).single(),
        supabaseAdmin.from('alerts').select('count()').gte('created_at', lastWeek.toISOString()).single()
      ]);

      const { data: severityStats } = await supabaseAdmin
        .from('alerts')
        .select('severity, count()')
        .group('severity');

      return {
        total: total.data?.count || 0,
        last24h: recent.data?.count || 0,
        lastWeek: week.data?.count || 0,
        bySeverity: severityStats?.reduce((acc, alert) => {
          acc[alert.severity] = alert.count;
          return acc;
        }, {}) || {}
      };
    } catch (error) {
      logger.error('Erro ao buscar estatísticas de alertas:', error);
      throw error;
    }
  }

  /**
   * Estatísticas de usuários
   */
  async getUserStats() {
    try {
      const { data: userStats } = await supabaseAdmin
        .from('users')
        .select('role, is_active, count()')
        .group('role, is_active');

      const total = userStats?.reduce((sum, user) => sum + (user.count || 0), 0) || 0;
      const active = userStats?.filter(u => u.is_active).reduce((sum, user) => sum + (user.count || 0), 0) || 0;

      return {
        total,
        active,
        inactive: total - active,
        byRole: userStats?.reduce((acc, user) => {
          acc[user.role] = (acc[user.role] || 0) + (user.count || 0);
          return acc;
        }, {}) || {}
      };
    } catch (error) {
      logger.error('Erro ao buscar estatísticas de usuários:', error);
      throw error;
    }
  }

  /**
   * Relatório de atividades por período
   */
  async getActivityReport(req, res) {
    try {
      const { startDate, endDate, type = 'all' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Datas de início e fim são obrigatórias' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      let data = {};

      if (type === 'all' || type === 'recordings') {
        const { data: recordings } = await supabaseAdmin
          .from('recordings')
          .select('*, cameras(name)')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false });

        data.recordings = recordings || [];
      }

      if (type === 'all' || type === 'alerts') {
        const { data: alerts } = await supabaseAdmin
          .from('alerts')
          .select('*, cameras(name)')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false });

        data.alerts = alerts || [];
      }

      if (type === 'all' || type === 'logs') {
        const { data: logs } = await supabaseAdmin
          .from('system_logs')
          .select('*, cameras(name)')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
          .limit(1000);

        data.logs = logs || [];
      }

      res.json({
        period: { start: start.toISOString(), end: end.toISOString() },
        data,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro no getActivityReport:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório de atividades' });
    }
  }

  /**
   * Relatório de uso de câmeras
   */
  async getCameraUsageReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const { data: cameras } = await supabaseAdmin
        .from('cameras')
        .select('id, name, status, recording_enabled');

      const { data: recordings } = await supabaseAdmin
        .from('recordings')
        .select('camera_id, duration, file_size, created_at')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      const usage = cameras?.map(camera => {
        const cameraRecordings = recordings?.filter(r => r.camera_id === camera.id) || [];
        const totalDuration = cameraRecordings.reduce((sum, rec) => sum + (rec.duration || 0), 0);
        const totalSize = cameraRecordings.reduce((sum, rec) => sum + (rec.file_size || 0), 0);

        return {
          ...camera,
          totalRecordings: cameraRecordings.length,
          totalDuration: Math.round(totalDuration / 60 * 100) / 100, // horas
          totalSize: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100, // GB
          lastRecording: cameraRecordings.length > 0 ? 
            new Date(Math.max(...cameraRecordings.map(r => new Date(r.created_at)))) : null
        };
      }) || [];

      res.json({
        period: { start: start.toISOString(), end: end.toISOString() },
        cameras: usage,
        summary: {
          totalCameras: cameras?.length || 0,
          totalRecordings: recordings?.length || 0,
          totalDuration: Math.round(usage.reduce((sum, cam) => sum + cam.totalDuration, 0) * 100) / 100,
          totalSize: Math.round(usage.reduce((sum, cam) => sum + cam.totalSize, 0) * 100) / 100
        }
      });
    } catch (error) {
      logger.error('Erro no getCameraUsageReport:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório de uso de câmeras' });
    }
  }

  /**
   * Exportar relatório em CSV
   */
  async exportReport(req, res) {
    try {
      const { type, startDate, endDate } = req.query;

      if (!type || !startDate || !endDate) {
        return res.status(400).json({ error: 'Tipo e datas são obrigatórios' });
      }

      let data = [];
      let filename = '';
      let headers = '';

      const start = new Date(startDate);
      const end = new Date(endDate);

      switch (type) {
        case 'recordings':
          const { data: recordings } = await supabaseAdmin
            .from('recordings')
            .select('*, cameras(name)')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });

          data = recordings || [];
          filename = `relatorio-gravacoes-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}.csv`;
          headers = 'Data,Hora,Câmera,Duração,Tamanho,Formato,Status\n';
          break;

        case 'alerts':
          const { data: alerts } = await supabaseAdmin
            .from('alerts')
            .select('*, cameras(name)')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });

          data = alerts || [];
          filename = `relatorio-alertas-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}.csv`;
          headers = 'Data,Hora,Câmera,Tipo,Severidade,Mensagem\n';
          break;

        default:
          return res.status(400).json({ error: 'Tipo de relatório inválido' });
      }

      // Configurar headers para download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Enviar CSV
      res.send(headers + this.formatToCSV(data, type));
    } catch (error) {
      logger.error('Erro no exportReport:', error);
      res.status(500).json({ error: 'Erro ao exportar relatório' });
    }
  }

  /**
   * Formatar dados para CSV
   */
  formatToCSV(data, type) {
    return data.map(item => {
      switch (type) {
        case 'recordings':
          return `${item.created_at},${item.cameras?.name || 'Desconhecida'},${item.duration || 0},${item.file_size || 0},${item.format || 'N/A'},${item.status || 'N/A'}`;
        case 'alerts':
          return `${item.created_at},${item.cameras?.name || 'Desconhecida'},${item.type || 'N/A'},${item.severity || 'N/A'},${item.message || ''}`;
        default:
          return '';
      }
    }).join('\n');
  }
}

export default new ReportController();