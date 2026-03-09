/**
 * Job de Sincronização Contínua de Gravações
 * 
 * Executa verificações automáticas para:
 * - Vincular arquivos órfãos a registros
 * - Detectar e corrigir inconsistências
 * - Monitorar saúde do sistema de gravação
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração (alterado de 60s para 180s para reduzir Egress)
const SYNC_INTERVAL = 180000; // 180 segundos (3 minutos)
const STORAGE_PATHS = [
  path.join(__dirname, '../../../storage/www/record/live'),
  path.join(__dirname, '../../../storage/www/record')
];

class RecordingSyncJob {
  constructor() {
    this.supabase = null;
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      filesScanned: 0,
      orphansFound: 0,
      recordingsLinked: 0,
      errors: 0
    };
  }

  /**
   * Inicializa o job
   */
  async initialize() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('🔄 Recording Sync Job inicializado');
  }

  /**
   * Inicia o job de sincronização
   */
  start() {
    if (this.isRunning) {
      console.warn('⚠️ Recording Sync Job já está em execução');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Iniciando Recording Sync Job (intervalo: ${SYNC_INTERVAL / 1000}s)`);
    
    // Executar imediatamente
    this.runSync();
    
    // Executar periodicamente
    this.interval = setInterval(() => {
      this.runSync();
    }, SYNC_INTERVAL);
  }

  /**
   * Para o job de sincronização
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    console.log('⏹️ Recording Sync Job parado');
  }

  /**
   * Executa uma rodada de sincronização
   */
  async runSync() {
    if (!this.supabase) {
      console.error('❌ Supabase não inicializado');
      return;
    }

    const startTime = Date.now();
    console.log('🔄 Iniciando sincronização de gravações...');

    try {
      // Reset stats
      this.stats = {
        filesScanned: 0,
        orphansFound: 0,
        recordingsLinked: 0,
        errors: 0
      };

      // 1. Buscar arquivos MP4 recentes (últimas 2 horas)
      const recentFiles = await this.findRecentMP4Files();
      this.stats.filesScanned = recentFiles.length;

      if (recentFiles.length === 0) {
        console.log('✅ Nenhum arquivo recente encontrado');
        return;
      }

      // 2. Buscar gravações órfãs no banco
      const orphanRecordings = await this.findOrphanRecordings();

      // 3. Tentar vincular arquivos a gravações órfãs
      for (const file of recentFiles) {
        try {
          const linked = await this.tryLinkFile(file, orphanRecordings);
          if (linked) {
            this.stats.recordingsLinked++;
          }
        } catch (error) {
          console.error(`❌ Erro ao processar arquivo ${file.filename}:`, error.message);
          this.stats.errors++;
        }
      }

      this.lastRun = new Date();
      const duration = Date.now() - startTime;

      console.log(`✅ Sincronização concluída em ${duration}ms:`, {
        arquivos_escaneados: this.stats.filesScanned,
        órfãos_encontrados: this.stats.orphansFound,
        gravações_vinculadas: this.stats.recordingsLinked,
        erros: this.stats.errors
      });

    } catch (error) {
      console.error('❌ Erro durante sincronização:', error);
      this.stats.errors++;
    }
  }

  /**
   * Busca arquivos MP4 criados nas últimas 2 horas
   */
  async findRecentMP4Files() {
    const files = [];
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

    for (const basePath of STORAGE_PATHS) {
      try {
        await this.scanRecentFiles(basePath, files, twoHoursAgo);
      } catch (error) {
        console.warn(`⚠️ Erro ao escanear ${basePath}:`, error.message);
      }
    }

    return files;
  }

  /**
   * Escaneia diretório por arquivos recentes
   */
  async scanRecentFiles(dirPath, files, cutoffTime) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.scanRecentFiles(fullPath, files, cutoffTime);
        } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
          const stats = await fs.stat(fullPath);
          
          // Apenas arquivos modificados nas últimas 2 horas
          if (stats.mtime.getTime() > cutoffTime) {
            const relativePath = path.relative(path.join(__dirname, '../../..'), fullPath).replace(/\\/g, '/');
            
            files.push({
              fullPath,
              relativePath: this.normalizePath(relativePath),
              filename: entry.name,
              size: stats.size,
              mtime: stats.mtime,
              cameraId: this.extractCameraIdFromPath(relativePath)
            });
          }
        }
      }
    } catch (error) {
      // Ignorar diretórios inacessíveis
    }
  }

  /**
   * Busca gravações órfãs no banco (sem file_path)
   */
  async findOrphanRecordings() {
    const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();

    const { data, error } = await this.supabase
      .from('recordings')
      .select('id, camera_id, filename, status, created_at, start_time')
      .is('file_path', null)
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar gravações órfãs: ${error.message}`);
    }

    this.stats.orphansFound = data?.length || 0;
    return data || [];
  }

  /**
   * Tenta vincular arquivo a uma gravação órfã
   */
  async tryLinkFile(file, orphanRecordings) {
    // Buscar gravação correspondente
    let matchedRecording = orphanRecordings.find(r => 
      r.camera_id === file.cameraId && (
        r.filename === file.filename ||
        !r.filename // Gravação sem filename pode receber qualquer arquivo da câmera
      )
    );

    if (!matchedRecording) {
      return false;
    }

    // CORREÇÃO: Verificar se gravação é muito recente (< 30 minutos)
    const recordingAge = Date.now() - new Date(matchedRecording.created_at).getTime();
    const thirtyMinutes = 30 * 60 * 1000;
    
    if (recordingAge < thirtyMinutes) {
      console.log(`⏳ Gravação ${matchedRecording.id} muito recente (${Math.round(recordingAge/60000)}min), mantendo como 'recording'`);
      
      // Apenas atualizar dados do arquivo, manter status 'recording'
      const updateData = {
        filename: file.filename,
        file_path: file.relativePath,
        local_path: file.relativePath,
        file_size: file.size,
        updated_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('recordings')
        .update(updateData)
        .eq('id', matchedRecording.id);

      if (!error) {
        console.log(`🔗 Arquivo ${file.filename} vinculado à gravação ativa ${matchedRecording.id}`);
        return true;
      }
      return false;
    }

    // Atualizar gravação antiga com dados do arquivo e marcar como completed
    const updateData = {
      filename: file.filename,
      file_path: file.relativePath,
      local_path: file.relativePath,
      file_size: file.size,
      status: 'completed', // Só marcar como completed gravações antigas
      updated_at: new Date().toISOString()
    };

    // Calcular end_time se possível
    if (matchedRecording.start_time) {
      // Estimar duração baseada no tamanho do arquivo (aproximado)
      const estimatedDuration = Math.max(30, Math.round(file.size / 500000)); // ~500KB/s
      updateData.end_time = new Date(new Date(matchedRecording.start_time).getTime() + (estimatedDuration * 1000)).toISOString();
      updateData.duration = estimatedDuration;
    }

    const { error } = await this.supabase
      .from('recordings')
      .update(updateData)
      .eq('id', matchedRecording.id);

    if (error) {
      throw new Error(`Erro ao atualizar gravação ${matchedRecording.id}: ${error.message}`);
    }

    console.log(`🔗 Arquivo ${file.filename} vinculado à gravação ${matchedRecording.id}`);
    return true;
  }

  /**
   * Normaliza path para formato consistente
   */
  normalizePath(filePath) {
    if (!filePath) return null;
    
    return filePath
      .replace(/^\/opt\/media\/bin\/www\//, 'storage/www/')
      .replace(/^\/opt\/media\/www\//, 'storage/www/')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
  }

  /**
   * Extrai camera_id do caminho do arquivo
   */
  extractCameraIdFromPath(filePath) {
    const match = filePath.match(/storage\/www\/record\/live\/([a-f0-9-]{36})\//);
    return match ? match[1] : null;
  }

  /**
   * Retorna estatísticas do job
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      stats: this.stats
    };
  }
}

// Exportar instância singleton
const recordingSyncJob = new RecordingSyncJob();

export default recordingSyncJob;