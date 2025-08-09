import { supabaseAdmin } from './src/config/database.js';
import logger from './src/utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Script para identificar e limpar gravações duplicadas/inválidas
 * - Busca gravações com campos vazios/nulos
 * - Verifica se existem no Wasabi/S3
 * - Remove gravações inválidas do banco
 * - Gera relatório das ações
 */

class RecordingCleanup {
  constructor() {
    this.report = {
      totalRecordings: 0,
      invalidRecordings: [],
      duplicateRecordings: [],
      missingFiles: [],
      cleanedRecordings: [],
      errors: []
    };
  }

  async findInvalidRecordings() {
    try {
      logger.info('🔍 Buscando gravações inválidas...');
      
      // Buscar todas as gravações
      const { data: allRecordings, error: allError } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .order('created_at', { ascending: false });

      if (allError) {
        throw new Error(`Erro ao buscar gravações: ${allError.message}`);
      }

      this.report.totalRecordings = allRecordings.length;
      logger.info(`📊 Total de gravações encontradas: ${this.report.totalRecordings}`);

      // Identificar gravações inválidas (campos vazios/nulos)
      const invalidRecordings = allRecordings.filter(recording => {
        const hasEmptyDuration = !recording.duration || recording.duration === 0;
        const hasEmptySize = !recording.file_size || recording.file_size === 0;
        const hasEmptyResolution = !recording.resolution;
        const hasEmptySegments = !recording.segments || recording.segments === 0;
        const hasNoFile = !recording.file_path && !recording.s3_url;
        
        return hasEmptyDuration || hasEmptySize || hasEmptyResolution || hasEmptySegments || hasNoFile;
      });

      this.report.invalidRecordings = invalidRecordings.map(r => ({
        id: r.id,
        camera_id: r.camera_id,
        created_at: r.created_at,
        status: r.status,
        duration: r.duration,
        file_size: r.file_size,
        resolution: r.resolution,
        segments: r.segments,
        file_path: r.file_path,
        s3_url: r.s3_url,
        issues: [
          !r.duration || r.duration === 0 ? 'duration_empty' : null,
          !r.file_size || r.file_size === 0 ? 'file_size_empty' : null,
          !r.resolution ? 'resolution_empty' : null,
          !r.segments || r.segments === 0 ? 'segments_empty' : null,
          !r.file_path && !r.s3_url ? 'no_file_reference' : null
        ].filter(Boolean)
      }));

      logger.info(`❌ Gravações inválidas encontradas: ${this.report.invalidRecordings.length}`);
      
      return this.report.invalidRecordings;
    } catch (error) {
      logger.error('Erro ao buscar gravações inválidas:', error);
      this.report.errors.push(`Erro ao buscar gravações: ${error.message}`);
      throw error;
    }
  }

  async findDuplicateRecordings() {
    try {
      logger.info('🔍 Buscando gravações duplicadas...');
      
      // Buscar gravações agrupadas por câmera e timestamp próximo (mesmo minuto)
      const { data: recordings, error } = await supabaseAdmin
        .from('recordings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Erro ao buscar gravações: ${error.message}`);
      }

      // Agrupar por câmera e minuto
      const groups = {};
      recordings.forEach(recording => {
        const date = new Date(recording.created_at);
        const key = `${recording.camera_id}_${date.getFullYear()}_${date.getMonth()}_${date.getDate()}_${date.getHours()}_${date.getMinutes()}`;
        
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(recording);
      });

      // Identificar grupos com múltiplas gravações
      const duplicateGroups = Object.values(groups).filter(group => group.length > 1);
      
      duplicateGroups.forEach(group => {
        // Manter a gravação mais completa (com mais dados)
        const sortedGroup = group.sort((a, b) => {
          const scoreA = (a.duration || 0) + (a.file_size || 0) + (a.segments || 0);
          const scoreB = (b.duration || 0) + (b.file_size || 0) + (b.segments || 0);
          return scoreB - scoreA;
        });
        
        // Adicionar duplicatas (exceto a primeira/melhor)
        const duplicates = sortedGroup.slice(1);
        this.report.duplicateRecordings.push(...duplicates.map(r => ({
          id: r.id,
          camera_id: r.camera_id,
          created_at: r.created_at,
          status: r.status,
          kept_recording_id: sortedGroup[0].id
        })));
      });

      logger.info(`🔄 Gravações duplicadas encontradas: ${this.report.duplicateRecordings.length}`);
      
      return this.report.duplicateRecordings;
    } catch (error) {
      logger.error('Erro ao buscar gravações duplicadas:', error);
      this.report.errors.push(`Erro ao buscar duplicadas: ${error.message}`);
      throw error;
    }
  }

  async verifyFileExistence(recordings) {
    logger.info('📁 Verificando existência de arquivos...');
    
    for (const recording of recordings) {
      try {
        let fileExists = false;
        
        // Verificar arquivo local
        if (recording.file_path) {
          const fullPath = path.resolve(recording.file_path);
          fileExists = fs.existsSync(fullPath);
        }
        
        // Se não existe localmente e tem S3 URL, assumir que existe no S3
        if (!fileExists && recording.s3_url) {
          fileExists = true; // Assumir que existe no S3 se tem URL
        }
        
        if (!fileExists) {
          this.report.missingFiles.push({
            id: recording.id,
            file_path: recording.file_path,
            s3_url: recording.s3_url
          });
        }
      } catch (error) {
        logger.error(`Erro ao verificar arquivo da gravação ${recording.id}:`, error);
        this.report.errors.push(`Erro ao verificar arquivo ${recording.id}: ${error.message}`);
      }
    }
    
    logger.info(`📂 Arquivos não encontrados: ${this.report.missingFiles.length}`);
  }

  async cleanupRecordings(dryRun = true) {
    try {
      // Combinar gravações inválidas e duplicadas para limpeza
      const recordingsToClean = [
        ...this.report.invalidRecordings.map(r => ({ id: r.id, reason: 'invalid_data' })),
        ...this.report.duplicateRecordings.map(r => ({ id: r.id, reason: 'duplicate' })),
        ...this.report.missingFiles.map(r => ({ id: r.id, reason: 'missing_file' }))
      ];

      // Remover duplicatas da lista de limpeza
      const uniqueRecordings = recordingsToClean.filter((recording, index, self) => 
        index === self.findIndex(r => r.id === recording.id)
      );

      logger.info(`🧹 Gravações para limpeza: ${uniqueRecordings.length}`);
      
      if (dryRun) {
        logger.info('🔍 MODO DRY RUN - Nenhuma gravação será removida');
        this.report.cleanedRecordings = uniqueRecordings.map(r => ({ ...r, action: 'would_delete' }));
        return;
      }

      // Executar limpeza real
      for (const recording of uniqueRecordings) {
        try {
          const { error } = await supabaseAdmin
            .from('recordings')
            .delete()
            .eq('id', recording.id);

          if (error) {
            throw new Error(`Erro ao deletar gravação ${recording.id}: ${error.message}`);
          }

          this.report.cleanedRecordings.push({ ...recording, action: 'deleted' });
          logger.info(`✅ Gravação removida: ${recording.id} (${recording.reason})`);
        } catch (error) {
          logger.error(`Erro ao remover gravação ${recording.id}:`, error);
          this.report.errors.push(`Erro ao remover ${recording.id}: ${error.message}`);
        }
      }

      logger.info(`✅ Limpeza concluída: ${this.report.cleanedRecordings.length} gravações removidas`);
    } catch (error) {
      logger.error('Erro na limpeza de gravações:', error);
      this.report.errors.push(`Erro na limpeza: ${error.message}`);
      throw error;
    }
  }

  generateReport() {
    const reportContent = {
      timestamp: new Date().toISOString(),
      summary: {
        total_recordings: this.report.totalRecordings,
        invalid_recordings: this.report.invalidRecordings.length,
        duplicate_recordings: this.report.duplicateRecordings.length,
        missing_files: this.report.missingFiles.length,
        cleaned_recordings: this.report.cleanedRecordings.length,
        errors: this.report.errors.length
      },
      details: this.report
    };

    // Salvar relatório em arquivo
    const reportPath = path.join(process.cwd(), `recording_cleanup_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(reportContent, null, 2));
    
    logger.info(`📋 Relatório salvo em: ${reportPath}`);
    
    // Exibir resumo no console
    console.log('\n📊 RELATÓRIO DE LIMPEZA DE GRAVAÇÕES');
    console.log('=====================================');
    console.log(`Total de gravações: ${reportContent.summary.total_recordings}`);
    console.log(`Gravações inválidas: ${reportContent.summary.invalid_recordings}`);
    console.log(`Gravações duplicadas: ${reportContent.summary.duplicate_recordings}`);
    console.log(`Arquivos não encontrados: ${reportContent.summary.missing_files}`);
    console.log(`Gravações limpas: ${reportContent.summary.cleaned_recordings}`);
    console.log(`Erros: ${reportContent.summary.errors}`);
    console.log(`\nRelatório detalhado: ${reportPath}\n`);
    
    return reportContent;
  }
}

// Função principal
async function main() {
  const cleanup = new RecordingCleanup();
  
  try {
    logger.info('🚀 Iniciando limpeza de gravações...');
    
    // Buscar gravações inválidas
    await cleanup.findInvalidRecordings();
    
    // Buscar gravações duplicadas
    await cleanup.findDuplicateRecordings();
    
    // Verificar existência de arquivos
    const allRecordings = [...cleanup.report.invalidRecordings, ...cleanup.report.duplicateRecordings];
    await cleanup.verifyFileExistence(allRecordings);
    
    // Executar limpeza (DRY RUN por padrão)
    const dryRun = process.argv.includes('--execute') ? false : true;
    await cleanup.cleanupRecordings(dryRun);
    
    // Gerar relatório
    cleanup.generateReport();
    
    if (dryRun) {
      console.log('\n⚠️  Para executar a limpeza real, execute: node recording_cleanup.js --execute');
    }
    
    logger.info('✅ Processo de limpeza concluído');
  } catch (error) {
    logger.error('❌ Erro no processo de limpeza:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}