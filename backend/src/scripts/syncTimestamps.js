#!/usr/bin/env node

/**
 * Script para sincronizar timestamps reais dos arquivos de gravação
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const execAsync = promisify(exec);

// Configurar cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Caminhos de busca
const RECORDING_PATHS = [
  path.join(process.cwd(), '..', 'storage', 'bin', 'www', 'record', 'live'),
  path.join(process.cwd(), '..', 'storage', 'www', 'record', 'live'),
  path.join(process.cwd(), 'storage', 'bin', 'www', 'record', 'live'),
  path.join(process.cwd(), 'storage', 'www', 'record', 'live')
];

/**
 * Extrair timestamp real do arquivo usando ffprobe
 */
async function getFileTimestamp(filePath) {
  try {
    // Obter metadata com ffprobe
    const cmd = `ffprobe -v quiet -print_format json -show_format "${filePath}"`;
    const { stdout } = await execAsync(cmd);
    const data = JSON.parse(stdout);
    
    // Tentar obter timestamp da criação
    if (data.format && data.format.tags) {
      const tags = data.format.tags;
      
      // Procurar por diferentes tags de timestamp
      const creationTime = tags.creation_time || 
                          tags.CreationTime || 
                          tags['com.apple.quicktime.creationdate'] ||
                          tags.date;
      
      if (creationTime) {
        return new Date(creationTime);
      }
    }
    
    // Fallback: usar timestamp do arquivo no sistema
    const stats = await fs.stat(filePath);
    return stats.birthtime || stats.mtime;
    
  } catch (error) {
    console.error(`❌ Erro ao obter timestamp de ${filePath}:`, error.message);
    
    // Fallback final: usar stats do arquivo
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime;
    } catch (err) {
      return null;
    }
  }
}

/**
 * Calcular timestamps baseado em duração e timestamp inicial
 */
async function calculateTimestamps(filePath) {
  try {
    // Obter duração do vídeo
    const durationCmd = `ffprobe -v quiet -select_streams v:0 -show_entries stream=duration -of csv=p=0 "${filePath}"`;
    const { stdout: durationOut } = await execAsync(durationCmd);
    const duration = parseFloat(durationOut.trim());
    
    // Obter timestamp inicial
    const startTime = await getFileTimestamp(filePath);
    
    if (!startTime || isNaN(duration)) {
      return null;
    }
    
    // Calcular end_time
    const endTime = new Date(startTime.getTime() + (duration * 1000));
    
    return {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration: Math.round(duration),
      metadata: {
        original_timestamp: startTime.toISOString(),
        calculated_end: endTime.toISOString(),
        duration_seconds: duration
      }
    };
    
  } catch (error) {
    console.error(`❌ Erro ao calcular timestamps:`, error.message);
    return null;
  }
}

/**
 * Encontrar arquivo físico da gravação
 */
async function findRecordingFile(recording) {
  const { filename, file_path, camera_id } = recording;
  
  // Normalizar caminho
  const normalizedPath = file_path?.replace(/\\\\/g, '/').replace(/\\/g, '/');
  
  // Tentar diferentes combinações de caminhos
  const possiblePaths = [];
  
  for (const basePath of RECORDING_PATHS) {
    if (normalizedPath) {
      possiblePaths.push(path.join(basePath, normalizedPath));
      possiblePaths.push(path.join(basePath, camera_id, normalizedPath));
    }
    if (filename) {
      possiblePaths.push(path.join(basePath, filename));
      possiblePaths.push(path.join(basePath, camera_id, filename));
      possiblePaths.push(path.join(basePath, camera_id, '*', filename));
    }
  }
  
  // Testar cada caminho
  for (const testPath of possiblePaths) {
    try {
      if (!testPath.includes('*')) {
        await fs.access(testPath);
        return testPath;
      }
    } catch (err) {
      // Continuar
    }
  }
  
  return null;
}

/**
 * Sincronizar timestamps de todas as gravações
 */
async function syncAllTimestamps() {
  console.log('🔄 Sincronizando timestamps de gravações...\n');
  
  // Buscar todas as gravações
  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('❌ Erro ao buscar gravações:', error);
    return;
  }
  
  console.log(`📊 Encontradas ${recordings.length} gravações para verificar`);
  
  let synced = 0;
  let notFound = 0;
  let errors = 0;
  let skipped = 0;
  
  for (const recording of recordings) {
    try {
      console.log(`\n🎬 Processando: ${recording.filename || recording.id}`);
      
      // Encontrar arquivo físico
      const filePath = await findRecordingFile(recording);
      
      if (!filePath) {
        console.log(`   ❌ Arquivo não encontrado`);
        notFound++;
        continue;
      }
      
      console.log(`   📁 Arquivo: ${filePath}`);
      
      // Calcular timestamps reais
      const timestamps = await calculateTimestamps(filePath);
      
      if (!timestamps) {
        console.log(`   ⚠️ Não foi possível calcular timestamps`);
        errors++;
        continue;
      }
      
      console.log(`   ⏰ Start: ${timestamps.start_time}`);
      console.log(`   ⏰ End: ${timestamps.end_time}`);
      console.log(`   ⏱️ Duração: ${timestamps.duration} segundos`);
      
      // Verificar se precisa atualizar
      const needsUpdate = 
        recording.start_time !== timestamps.start_time ||
        recording.end_time !== timestamps.end_time ||
        recording.duration !== timestamps.duration;
      
      if (!needsUpdate) {
        console.log(`   ✅ Timestamps já estão corretos`);
        skipped++;
        continue;
      }
      
      // Atualizar no banco
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          start_time: timestamps.start_time,
          end_time: timestamps.end_time,
          duration: timestamps.duration,
          metadata: {
            ...recording.metadata,
            ...timestamps.metadata,
            timestamp_synced: true,
            synced_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id);
      
      if (updateError) {
        console.log(`   ❌ Erro ao atualizar:`, updateError.message);
        errors++;
      } else {
        console.log(`   ✅ Timestamps atualizados com sucesso`);
        synced++;
      }
      
    } catch (error) {
      console.error(`❌ Erro ao processar ${recording.id}:`, error.message);
      errors++;
    }
  }
  
  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA SINCRONIZAÇÃO:');
  console.log(`   ✅ Sincronizadas: ${synced}`);
  console.log(`   ⏭️ Já corretas: ${skipped}`);
  console.log(`   ❌ Não encontradas: ${notFound}`);
  console.log(`   ⚠️ Erros: ${errors}`);
  console.log(`   📹 Total processado: ${recordings.length}`);
  console.log('='.repeat(60));
}

/**
 * Verificar timestamps recentes (debug)
 */
async function checkRecentTimestamps() {
  console.log('\n📅 Verificando gravações recentes...\n');
  
  const { data: recent } = await supabase
    .from('recordings')
    .select('id, filename, start_time, end_time, duration, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (recent && recent.length > 0) {
    console.log('Últimas 5 gravações:');
    for (const rec of recent) {
      console.log(`\n📹 ${rec.filename || rec.id}`);
      console.log(`   Criado: ${rec.created_at}`);
      console.log(`   Start: ${rec.start_time || 'não definido'}`);
      console.log(`   End: ${rec.end_time || 'não definido'}`);
      console.log(`   Duração: ${rec.duration || 0}s`);
      
      // Verificar consistência
      if (rec.start_time && rec.end_time) {
        const start = new Date(rec.start_time);
        const end = new Date(rec.end_time);
        const calcDuration = Math.round((end - start) / 1000);
        
        if (Math.abs(calcDuration - (rec.duration || 0)) > 2) {
          console.log(`   ⚠️ Inconsistência: duração calculada = ${calcDuration}s`);
        }
      }
    }
  }
}

// Executar script
console.log('🚀 Script de Sincronização de Timestamps');
console.log('=' .repeat(60));

syncAllTimestamps()
  .then(() => checkRecentTimestamps())
  .then(() => {
    console.log('\n✅ Sincronização concluída!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });