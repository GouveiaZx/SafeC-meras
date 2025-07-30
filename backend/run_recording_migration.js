/**
 * Script para executar migração da coluna recording_enabled
 */

import { supabaseAdmin } from './src/config/database.js';
import { createModuleLogger } from './src/config/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createModuleLogger('RecordingMigration');

async function runRecordingMigration() {
  try {
    logger.info('Iniciando migração da coluna recording_enabled...');
    
    // Ler o arquivo SQL da migração
    const sqlPath = path.join(__dirname, 'database', 'migrations', '20240102_add_recording_enabled_to_cameras.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');
    
    logger.info('Executando migração SQL...');
    
    // Executar a migração usando SQL direto
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: sqlContent
    });
    
    if (error) {
      // Se a função exec_sql não existir, tentar executar diretamente
      if (error.code === '42883') {
        logger.info('Função exec_sql não encontrada, executando comandos individuais...');
        
        // Dividir em comandos individuais
        const commands = sqlContent
          .split(';')
          .map(cmd => cmd.trim())
          .filter(cmd => cmd && !cmd.startsWith('--') && !cmd.startsWith('/*'));
        
        for (const command of commands) {
          if (command.trim()) {
            logger.info(`Executando: ${command.substring(0, 50)}...`);
            
            try {
              const { error: cmdError } = await supabaseAdmin.rpc('exec_sql', {
                sql_query: command
              });
              
              if (cmdError) {
                logger.error(`Erro no comando: ${cmdError.message}`);
                // Se for erro de coluna já existir, continuar
                if (cmdError.message.includes('already exists') || 
                    cmdError.message.includes('já existe')) {
                  logger.info('Continuando (coluna já existe)...');
                  continue;
                }
                throw cmdError;
              }
            } catch (directError) {
              logger.error(`Erro direto: ${directError.message}`);
              // Tentar executar via query simples
              const { error: queryError } = await supabaseAdmin
                .from('cameras')
                .select('recording_enabled')
                .limit(1);
              
              if (queryError && queryError.code === '42703') {
                logger.info('Coluna recording_enabled não existe, tentando criar...');
                // Executar comando ALTER TABLE diretamente
                const alterCommand = 'ALTER TABLE cameras ADD COLUMN recording_enabled BOOLEAN DEFAULT false';
                logger.info('Executando ALTER TABLE...');
                
                // Como não conseguimos executar SQL direto, vamos informar ao usuário
                logger.error('Não foi possível executar a migração automaticamente.');
                logger.info('Execute manualmente no painel do Supabase:');
                logger.info('SQL Editor > New Query > Cole o código abaixo:');
                logger.info('\n' + sqlContent);
                return;
              }
            }
          }
        }
      } else {
        throw error;
      }
    }
    
    logger.info('✅ Migração da coluna recording_enabled concluída com sucesso!');
    
    // Testar se a migração funcionou
    logger.info('🧪 Testando a migração...');
    
    const { data: testData, error: testError } = await supabaseAdmin
      .from('cameras')
      .select('id, recording_enabled')
      .limit(1);
      
    if (testError) {
      if (testError.code === '42703') {
        logger.error('❌ Coluna recording_enabled ainda não existe');
        logger.info('Execute manualmente no painel do Supabase:');
        logger.info('\n' + sqlContent);
      } else {
        logger.error('❌ Erro no teste pós-migração:', testError);
      }
    } else {
      logger.info('✅ Teste pós-migração bem-sucedido!');
      logger.info('📊 Dados de teste:', testData);
    }
    
  } catch (error) {
    logger.error('❌ Erro na migração:', error);
    logger.info('Execute manualmente no painel do Supabase:');
    
    const sqlContent = `
-- Migration: Add recording_enabled column to cameras table
-- Description: Adiciona coluna para controlar se a gravação está habilitada por câmera

-- 1. Adicionar coluna recording_enabled se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cameras' AND column_name = 'recording_enabled'
    ) THEN
        ALTER TABLE cameras ADD COLUMN recording_enabled BOOLEAN DEFAULT false;
        RAISE NOTICE 'Coluna recording_enabled adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna recording_enabled já existe';
    END IF;
END $$;

-- 2. Atualizar câmeras existentes para ter gravação habilitada por padrão
UPDATE cameras SET recording_enabled = true WHERE recording_enabled IS NULL;

-- 3. Adicionar comentário na coluna
COMMENT ON COLUMN cameras.recording_enabled IS 'Indica se a gravação está habilitada para esta câmera';
    `;
    
    logger.info('\n' + sqlContent);
  }
}

// Executar a migração
runRecordingMigration()
  .then(() => {
    logger.info('Script de migração finalizado');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Falha no script de migração:', error);
    process.exit(1);
  });