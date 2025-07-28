import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Filter,
  TrendingUp,
  Video,
  HardDrive,
  Clock,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import MetricCard from '@/components/dashboard/MetricCard';
import { api, endpoints } from '@/lib/api';

interface ReportResponse {
  success: boolean;
  data: {
    summary: {
      total_recordings: number;
      total_size: number;
      avg_duration: number;
      uptime: number;
      incidents: number;
    };
    charts: {
      recordings_by_hour: Array<{ hour: string; recordings: number; size: number }>;
      camera_usage: Array<{ name: string; value: number }>;
      storage_growth: Array<{ date: string; used: number; total: number }>;
      system_metrics: Array<{ time: string; cpu: number; memory: number; disk: number }>;
    };
  };
}

interface ReportFilters {
  startDate: string;
  endDate: string;
  reportType: 'system' | 'cameras' | 'recordings' | 'storage' | 'users';
  period: 'day' | 'week' | 'month' | 'custom';
  cameraId?: string;
}

interface ReportData {
  summary: {
    totalRecordings: number;
    totalSize: number;
    avgDuration: number;
    uptime: number;
    incidents: number;
  };
  charts: {
    recordingsByHour: Array<{ hour: string; recordings: number; size: number }>;
    cameraUsage: Array<{ name: string; value: number }>;
    storageGrowth: Array<{ date: string; used: number; total: number }>;
    systemMetrics: Array<{ time: string; cpu: number; memory: number; disk: number }>;
  };
}

const Reports: React.FC = () => {
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reportType: 'system',
    period: 'week'
  });
  
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      // Construir parâmetros da query
      const params = {
        type: filters.reportType,
        start_date: filters.startDate,
        end_date: filters.endDate,
        ...(filters.cameraId && { camera_id: filters.cameraId })
      };
      
      const data = await api.get<ReportResponse>(endpoints.reports.generate(), params);
      
      if (data.success && data.data) {
        setReportData({
          summary: {
            totalRecordings: data.data.summary?.total_recordings || 0,
            totalSize: data.data.summary?.total_size || 0,
            avgDuration: data.data.summary?.avg_duration || 0,
            uptime: data.data.summary?.uptime || 0,
            incidents: data.data.summary?.incidents || 0
          },
          charts: {
            recordingsByHour: data.data.charts?.recordings_by_hour || [],
            cameraUsage: data.data.charts?.camera_usage || [],
            storageGrowth: data.data.charts?.storage_growth || [],
            systemMetrics: data.data.charts?.system_metrics || []
          }
        });
        toast.success('Relatório gerado com sucesso!');
      } else {
        throw new Error('Dados do relatório não encontrados');
      }
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar relatório');
      // Em caso de erro, definir dados vazios
      setReportData({
        summary: {
          totalRecordings: 0,
          totalSize: 0,
          avgDuration: 0,
          uptime: 0,
          incidents: 0
        },
        charts: {
          recordingsByHour: [],
          cameraUsage: [],
          storageGrowth: [],
          systemMetrics: []
        }
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  const exportReport = async (format: 'pdf' | 'csv' | 'excel') => {
    setExporting(true);
    try {
      // Construir parâmetros da query
      const params = {
        type: filters.reportType,
        start_date: filters.startDate,
        end_date: filters.endDate,
        format: format,
        ...(filters.cameraId && { camera_id: filters.cameraId })
      };
      
      // Gerar nome do arquivo
      const filename = `relatorio_${filters.reportType}_${new Date().toISOString().split('T')[0]}.${format}`;
      
      // Criar blob e fazer download
      const response = await api.download(endpoints.reports.export());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Relatório exportado em ${format.toUpperCase()}!`);
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao exportar relatório');
    } finally {
      setExporting(false);
    }
  };

  const handleFilterChange = (key: keyof ReportFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const setPeriod = (period: ReportFilters['period']) => {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return;
    }
    
    setFilters(prev => ({
      ...prev,
      period,
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    }));
  };



  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-gray-600">Análise detalhada do sistema Safe Câmeras</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => exportReport('pdf')}
            disabled={exporting || !reportData}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </button>
          
          <button
            onClick={() => exportReport('excel')}
            disabled={exporting || !reportData}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Excel</span>
          </button>
          
          <button
            onClick={() => exportReport('csv')}
            disabled={exporting || !reportData}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Relatório
            </label>
            <select
              value={filters.reportType}
              onChange={(e) => handleFilterChange('reportType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="system">Sistema</option>
              <option value="cameras">Câmeras</option>
              <option value="recordings">Gravações</option>
              <option value="storage">Armazenamento</option>
              <option value="users">Usuários</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período
            </label>
            <div className="flex space-x-2">
              {(['day', 'week', 'month'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setPeriod(period)}
                  className={`px-3 py-2 text-sm rounded-lg ${
                    filters.period === period
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period === 'day' ? '1D' : period === 'week' ? '7D' : '30D'}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Inicial
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Final
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-gray-600">Gerando relatório...</span>
        </div>
      ) : reportData ? (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <MetricCard
              title="Total de Gravações"
              value={reportData.summary.totalRecordings}
              icon={Video}
              color="blue"
            />
            
            <MetricCard
              title="Tamanho Total"
              value={reportData.summary.totalSize}
              unit="GB"
              icon={HardDrive}
              color="green"
            />
            
            <MetricCard
              title="Duração Média"
              value={reportData.summary.avgDuration}
              unit="min"
              icon={Clock}
              color="purple"
            />
            
            <MetricCard
              title="Uptime"
              value={reportData.summary.uptime}
              unit="%"
              icon={TrendingUp}
              color="green"
            />
            
            <MetricCard
              title="Incidentes"
              value={reportData.summary.incidents}
              icon={AlertTriangle}
              color={reportData.summary.incidents > 0 ? 'red' : 'green'}
            />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gravações por Hora */}
            <LineChart
              data={reportData.charts.recordingsByHour}
              height={300}
              title="Gravações por Hora"
              lines={[
                { dataKey: 'recordings', name: 'Gravações', color: '#3b82f6', unit: '' },
                { dataKey: 'size', name: 'Tamanho', color: '#10b981', unit: 'GB' }
              ]}
            />
            
            {/* Uso por Câmera */}
            <BarChart
              data={reportData.charts.cameraUsage}
              height={300}
              title="Uso por Câmera"
              bar={{ dataKey: 'value', name: 'Gravações', color: '#8b5cf6' }}
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Crescimento de Armazenamento */}
            <LineChart
              data={reportData.charts.storageGrowth}
              height={300}
              title="Crescimento de Armazenamento"
              lines={[
                { dataKey: 'used', name: 'Usado', color: '#f59e0b', unit: 'TB' },
                { dataKey: 'total', name: 'Total', color: '#6b7280', unit: 'TB' }
              ]}
            />
            
            {/* Métricas do Sistema */}
            <LineChart
              data={reportData.charts.systemMetrics}
              height={300}
              title="Métricas do Sistema"
              lines={[
                { dataKey: 'cpu', name: 'CPU', color: '#ef4444', unit: '%' },
                { dataKey: 'memory', name: 'Memória', color: '#10b981', unit: '%' },
                { dataKey: 'disk', name: 'Disco', color: '#f59e0b', unit: '%' }
              ]}
            />
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Selecione os filtros e clique em gerar para visualizar o relatório</p>
        </div>
      )}
    </div>
  );
};

export default Reports;