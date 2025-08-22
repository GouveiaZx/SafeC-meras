#!/usr/bin/env node

/**
 * Script de Resincronização Completa
 * Limpa dados antigos e sincroniza todos os arquivos MP4 com o Supabase
 */

import path from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente ANTES de importar outros módulos
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import UnifiedRecordingService from '../services/UnifiedRecordingService.js';

const execAsync = promisify(exec);

// Criar instância do serviço
const unifiedService = new UnifiedRecordingService();

// Cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fullResync() {
  console.log('🔄 RESINCRONIZAÇÃO COMPLETA DO SISTEMA DE GRAVAÇÕES');
  console.log('=' .repeat(60));
  
  try {
    // 1. Backup dos dados atuais
    console.log('\n📦 Fazendo backup dos dados atuais...');
    const { data: backupData } = await supabase
      .from('recordings')
      .select('*');
    
    console.log(`   Backup de ${backupData?.length || 0} registros realizado`);
    
    // 2. Limpar todos os registros antigos
    console.log('\n🗑️ Limpando registros antigos do Supabase...');
    const { error: deleteError } = await supabase
      .from('recordings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletar todos
    
    if (deleteError) {
      console.error('❌ Erro ao limpar registros:', deleteError);
    } else {
      console.log('✅ Registros antigos removidos');
    }
    
    // 3. Buscar todos os arquivos MP4 no container Docker
    console.log('\n🔍 Buscando arquivos no container Docker...');
    let dockerFiles = [];
    
    try {
      const { stdout } = await execAsync(
        'docker exec newcam-zlmediakit sh -c "find /opt/media/bin/www/record -name \'*.mp4\' -type f 2>/dev/null"'
      );
      
      dockerFiles = stdout.trim().split('\n').filter(f => f && !f.includes('.tmp'));
      console.log(`   Encontrados ${dockerFiles.length} arquivos no Docker`);
    } catch (error) {
      console.warn('⚠️ Não foi possível acessar container Docker:', error.message);
    }
    
    // 4. Buscar arquivos locais
    console.log('\n🔍 Buscando arquivos locais...');
    const localResult = await unifiedService.syncAllFiles();
    console.log(`   Encontrados ${localResult.total} arquivos locais`);
    console.log(`   Sincronizados ${localResult.synced} arquivos`);
    
    // 5. Processar arquivos do Docker
    if (dockerFiles.length > 0) {
      console.log('\n🐳 Processando arquivos do Docker...');
      let dockerSynced = 0;
      
      for (const dockerPath of dockerFiles) {
        // Extrair informações do caminho
        const pathParts = dockerPath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        
        // Procurar camera_id no caminho
        let cameraId = null;
        for (const part of pathParts) {
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
            cameraId = part;
            break;
          }
        }
        
        if (!cameraId) {
          console.warn(`⚠️ Não foi possível extrair camera_id de: ${fileName}`);
          continue;
        }
        
        // Verificar se já existe
        const { data: existing } = await supabase
          .from('recordings')
          .select('id')
          .eq('filename', fileName)
          .single();
        
        if (existing) {
          continue;
        }
        
        // Obter informações do arquivo
        try {
          const { stdout: statOutput } = await execAsync(
            `docker exec newcam-zlmediakit sh -c "stat -c '%Y %s' '${dockerPath}'"`
          );
          
          const [timestamp, size] = statOutput.trim().split(' ');
          
          // Tentar obter duração
          let duration = 60; // padrão
          try {
            const { stdout: durationOutput } = await execAsync(
              `docker exec newcam-zlmediakit sh -c "ffprobe -v quiet -select_streams v:0 -show_entries stream=duration -of csv=p=0 '${dockerPath}' 2>/dev/null || echo 60"`
            );
            duration = Math.round(parseFloat(durationOutput.trim()) || 60);
          } catch (e) {
            // Usar padrão
          }
          
          const startTime = new Date(parseInt(timestamp) * 1000);
          const endTime = new Date(startTime.getTime() + (duration * 1000));
          
          // Mapear para caminho local
          const localPath = dockerPath.replace('/opt/media/bin/', 'storage/');
          
          // Criar registro
          const { error: insertError } = await supabase
            .from('recordings')
            .insert({
              camera_id: cameraId,
              filename: fileName,
              file_path: localPath,
              local_path: localPath,
              file_size: parseInt(size),
              duration: duration,
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              status: 'completed',
              quality: 'medium',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {
                source: 'docker_resync',
                docker_path: dockerPath,
                sync_time: new Date().toISOString()
              }
            });
          
          if (!insertError) {
            dockerSynced++;
            console.log(`   ✅ ${fileName}`);
          } else {
            console.error(`   ❌ Erro ao inserir ${fileName}:`, insertError.message);
          }
        } catch (error) {
          console.error(`   ❌ Erro ao processar ${fileName}:`, error.message);
        }
      }
      
      console.log(`   Total sincronizado do Docker: ${dockerSynced}`);
    }
    
    // 6. Verificar câmeras ativas
    console.log('\n📹 Verificando câmeras ativas...');
    const { data: cameras } = await supabase
      .from('cameras')
      .select('id, name, status, is_recording');
    
    for (const camera of cameras || []) {
      const { count } = await supabase
        .from('recordings')
        .select('*', { count: 'exact', head: true })
        .eq('camera_id', camera.id);
      
      console.log(`   ${camera.name}: ${count || 0} gravações | Status: ${camera.status} | Gravando: ${camera.is_recording ? 'Sim' : 'Não'}`);
    }
    
    // 7. Resumo final
    console.log('\n📊 RESUMO DA RESINCRONIZAÇÃO');
    console.log('=' .repeat(60));
    
    const { count: totalRecordings } = await supabase
      .from('recordings')
      .select('*', { count: 'exact', head: true });
    
    const { data: stats } = await supabase
      .from('recordings')
      .select('file_size, duration');
    
    let totalSize = 0;
    let totalDuration = 0;
    
    for (const stat of stats || []) {
      totalSize += stat.file_size || 0;
      totalDuration += stat.duration || 0;
    }
    
    console.log(`✅ Total de gravações: ${totalRecordings || 0}`);
    console.log(`💾 Tamanho total: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`⏱️ Duração total: ${Math.round(totalDuration / 60)} minutos`);
    
    // 8. Limpar registros órfãos
    console.log('\n🧹 Verificando registros órfãos...');
    const orphans = await unifiedService.cleanOrphanRecords();
    console.log(`   Removidos ${orphans} registros sem arquivo`);
    
    console.log('\n✅ RESINCRONIZAÇÃO COMPLETA FINALIZADA!');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('\n❌ ERRO FATAL:', error);
    process.exit(1);
  }
}

// Executar
console.log('');
fullResync()
  .then(() => {
    console.log('\n👍 Script executado com sucesso!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erro na execução:', error);
    process.exit(1);
  });