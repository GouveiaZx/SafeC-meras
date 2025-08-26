/**
 * Script para limpeza completa de todas as gravações
 * Remove dados do banco, arquivos físicos e limpa filas
 */

import fs from 'fs/promises';
import path from 'path';
import { createModuleLogger } from '../config/logger.js';
import { supabaseAdmin } from '../config/database.js';

const logger = createModuleLogger('CleanAllRecordings');

async function cleanAllRecordings() {
  try {
    logger.info('🧹 Iniciando limpeza completa de todas as gravações...');
    
    // 1. Limpar banco de dados
    logger.info('📊 Limpando registros do banco de dados...');
    
    const { error: recordingsError } = await supabaseAdmin
      .from('recordings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using a condition that matches all)
    
    if (recordingsError) {
      logger.error('Erro ao limpar registros:', recordingsError);
    } else {
      logger.info('✅ Registros de gravações removidos do banco');
    }

    // Limpar tabela de filas de upload se existir
    try {
      const { error: queueError } = await supabaseAdmin
        .from('upload_queue')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (!queueError) {
        logger.info('✅ Fila de upload limpa');
      }
    } catch (error) {
      logger.debug('Tabela upload_queue não existe ou erro:', error.message);
    }

    // 2. Limpar arquivos físicos
    logger.info('🗂️ Limpando arquivos MP4 do sistema...');
    
    const storagePaths = [
      path.join(process.cwd(), 'storage', 'www', 'record'),
      path.join(process.cwd(), 'storage', 'www', 'thumbnails'),
      path.join(process.cwd(), '..', 'storage', 'www', 'record'),
      path.join(process.cwd(), '..', 'storage', 'www', 'thumbnails')
    ];

    let filesRemoved = 0;
    
    for (const storagePath of storagePaths) {
      try {
        await cleanDirectory(storagePath);
        filesRemoved++;
        logger.info(`✅ Limpeza concluída: ${storagePath}`);
      } catch (error) {
        logger.debug(`Diretório não encontrado: ${storagePath}`);
      }
    }

    // 3. Limpar diretório Docker se acessível
    try {
      logger.info('🐳 Tentando limpar arquivos do container Docker...');
      
      // Verificar se container existe
      const { spawn } = await import('child_process');
      
      const dockerClean = spawn('docker', [
        'exec', 'newcam-zlmediakit', 'find', '/opt/media/bin/www/record', 
        '-name', '*.mp4', '-delete'
      ]);

      dockerClean.on('close', (code) => {
        if (code === 0) {
          logger.info('✅ Arquivos Docker removidos com sucesso');
        } else {
          logger.debug('Container Docker não acessível ou já limpo');
        }
      });

      dockerClean.on('error', () => {
        logger.debug('Docker não disponível - continuando...');
      });

      // Aguardar 3 segundos para o comando Docker
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      logger.debug('Docker cleanup não disponível:', error.message);
    }

    // 4. Estatísticas finais
    const { count } = await supabaseAdmin
      .from('recordings')
      .select('id', { count: 'exact', head: true });

    logger.info('🎯 LIMPEZA COMPLETA REALIZADA:');
    logger.info(`   📊 Registros no banco: ${count || 0}`);
    logger.info(`   🗂️ Diretórios limpos: ${filesRemoved}`);
    logger.info('✅ Sistema pronto para teste do zero!');

  } catch (error) {
    logger.error('❌ Erro na limpeza:', error);
    throw error;
  }
}

async function cleanDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await cleanDirectory(fullPath); // Recursivo
        // Tentar remover diretório se vazio
        try {
          await fs.rmdir(fullPath);
        } catch (error) {
          // Diretório não vazio, ok
        }
      } else if (entry.isFile() && (entry.name.endsWith('.mp4') || entry.name.endsWith('.jpg'))) {
        await fs.unlink(fullPath);
        console.log(`Removido: ${fullPath}`);
      }
    }
  } catch (error) {
    throw error;
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanAllRecordings()
    .then(() => {
      console.log('✅ Limpeza concluída com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na limpeza:', error);
      process.exit(1);
    });
}

export default cleanAllRecordings;