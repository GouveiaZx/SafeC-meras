import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugRecordingSegmentation() {
  console.log('🔍 Depurando Segmentação de Gravações\n');

  try {
    // 1. Verificar configuração do ZLMediaKit
    console.log('1. Verificando configuração do ZLMediaKit...');
    
    const zlmConfigPath = path.join(__dirname, 'zlm_config.ini');
    if (fs.existsSync(zlmConfigPath)) {
      const config = fs.readFileSync(zlmConfigPath, 'utf8');
      
      // Verificar configurações de gravação
      const recordSection = config.match(/\[record\][\s\S]*?(?=\[|$)/)?.[0];
      if (recordSection) {
        console.log('   ✅ Seção [record] encontrada:');
        
        const enableRecord = recordSection.match(/enableRecord\s*=\s*(\w+)/)?.[1];
        const recordSec = recordSection.match(/recordSec\s*=\s*(\d+)/)?.[1];
        const continueRecord = recordSection.match(/continueRecord\s*=\s*(\w+)/)?.[1];
        
        console.log(`   - enableRecord: ${enableRecord || 'não definido'}`);
        console.log(`   - recordSec: ${recordSec || 'não definido'} segundos (${recordSec ? recordSec/60 : 'N/A'} minutos)`);
        console.log(`   - continueRecord: ${continueRecord || 'não definido'}`);
        
        if (recordSec && parseInt(recordSec) !== 1800) {
          console.log('   ⚠️  PROBLEMA: recordSec deveria ser 1800 (30 minutos)');
        }
      } else {
        console.log('   ❌ Seção [record] não encontrada no config');
      }
      
      // Verificar configurações de hook
      const hookSection = config.match(/\[hook\][\s\S]*?(?=\[|$)/)?.[0];
      if (hookSection) {
        console.log('   ✅ Seção [hook] encontrada:');
        
        const enableHook = hookSection.match(/enable\s*=\s*(\w+)/)?.[1];
        const onRecordMp4 = hookSection.match(/on_record_mp4\s*=\s*(.+)/)?.[1];
        
        console.log(`   - enable: ${enableHook || 'não definido'}`);
        console.log(`   - on_record_mp4: ${onRecordMp4 || 'não definido'}`);
        
        if (!onRecordMp4 || !onRecordMp4.includes('/api/webhooks/on_record_mp4')) {
          console.log('   ⚠️  PROBLEMA: Hook on_record_mp4 não configurado corretamente');
        }
      } else {
        console.log('   ❌ Seção [hook] não encontrada no config');
      }
    } else {
      console.log('   ❌ Arquivo zlm_config.ini não encontrado');
    }

    // 2. Verificar gravações no banco de dados
    console.log('\n2. Verificando gravações no banco de dados...');
    
    const { data: allRecordings, error: allError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (allError) {
      console.error('   ❌ Erro ao buscar gravações:', allError);
      return;
    }

    console.log(`   📊 Total de gravações encontradas: ${allRecordings.length}`);
    
    // Agrupar por status
    const statusCount = allRecordings.reduce((acc, rec) => {
      acc[rec.status] = (acc[rec.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('   📈 Distribuição por status:');
    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });

    // 3. Verificar gravações ativas
    console.log('\n3. Analisando gravações ativas...');
    
    const activeRecordings = allRecordings.filter(rec => rec.status === 'recording');
    console.log(`   🔴 Gravações com status 'recording': ${activeRecordings.length}`);
    
    if (activeRecordings.length > 0) {
      console.log('   📋 Detalhes das gravações ativas:');
      activeRecordings.forEach((rec, index) => {
        const duration = rec.start_time ? 
          Math.floor((new Date() - new Date(rec.start_time)) / 1000 / 60) : 'N/A';
        
        console.log(`   ${index + 1}. ID: ${rec.id.substring(0, 8)}...`);
        console.log(`      Câmera: ${rec.camera_id}`);
        console.log(`      Início: ${rec.start_time}`);
        console.log(`      Duração: ${duration} minutos`);
        console.log(`      Arquivo: ${rec.filename || 'N/A'}`);
        console.log(`      Segmentação: ${rec.metadata?.is_segmentation || false}`);
        console.log(`      Segmento #: ${rec.metadata?.segment_number || 1}`);
        
        if (duration > 30) {
          console.log(`      ⚠️  PROBLEMA: Gravação ativa há mais de 30 minutos!`);
        }
        console.log('');
      });
    }

    // 4. Verificar segmentações recentes
    console.log('4. Verificando segmentações recentes...');
    
    const segmentedRecordings = allRecordings.filter(rec => 
      rec.metadata?.is_segmentation === true
    );
    
    console.log(`   🔄 Gravações marcadas como segmentação: ${segmentedRecordings.length}`);
    
    if (segmentedRecordings.length > 0) {
      console.log('   📋 Últimas segmentações:');
      segmentedRecordings.slice(0, 5).forEach((rec, index) => {
        console.log(`   ${index + 1}. Câmera: ${rec.camera_id}, Segmento: ${rec.metadata?.segment_number}, Status: ${rec.status}`);
      });
    }

    // 5. Verificar câmeras ativas
    console.log('\n5. Verificando câmeras ativas...');
    
    const { data: cameras, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .eq('status', 'online');

    if (cameraError) {
      console.error('   ❌ Erro ao buscar câmeras:', cameraError);
      return;
    }

    console.log(`   📹 Câmeras online: ${cameras.length}`);
    
    if (cameras.length > 0) {
      console.log('   📋 Câmeras ativas:');
      cameras.forEach((camera, index) => {
        const activeRec = activeRecordings.find(rec => rec.camera_id === camera.id);
        console.log(`   ${index + 1}. ${camera.name} (${camera.id})`);
        console.log(`      Status: ${camera.status}`);
        console.log(`      Gravando: ${activeRec ? 'SIM' : 'NÃO'}`);
        if (activeRec) {
          const duration = Math.floor((new Date() - new Date(activeRec.start_time)) / 1000 / 60);
          console.log(`      Duração atual: ${duration} minutos`);
        }
        console.log('');
      });
    }

    // 6. Verificar arquivos de gravação no sistema
    console.log('6. Verificando arquivos de gravação...');
    
    const recordingsPath = path.join(__dirname, 'recordings');
    if (fs.existsSync(recordingsPath)) {
      const files = fs.readdirSync(recordingsPath);
      const mp4Files = files.filter(file => file.endsWith('.mp4'));
      
      console.log(`   📁 Arquivos MP4 encontrados: ${mp4Files.length}`);
      
      if (mp4Files.length > 0) {
        console.log('   📋 Últimos arquivos:');
        mp4Files.slice(-5).forEach((file, index) => {
          const filePath = path.join(recordingsPath, file);
          const stats = fs.statSync(filePath);
          const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
          
          console.log(`   ${index + 1}. ${file}`);
          console.log(`      Tamanho: ${sizeInMB} MB`);
          console.log(`      Modificado: ${stats.mtime.toISOString()}`);
          console.log('');
        });
      }
    } else {
      console.log('   ❌ Diretório de gravações não encontrado');
    }

    // 7. Recomendações
    console.log('\n7. 🎯 Diagnóstico e Recomendações:');
    
    if (activeRecordings.length === 0) {
      console.log('   ❌ PROBLEMA: Nenhuma gravação ativa encontrada');
      console.log('   💡 Verifique se as câmeras estão realmente gravando');
    }
    
    const longRunningRecordings = activeRecordings.filter(rec => {
      const duration = rec.start_time ? 
        Math.floor((new Date() - new Date(rec.start_time)) / 1000 / 60) : 0;
      return duration > 30;
    });
    
    if (longRunningRecordings.length > 0) {
      console.log(`   ❌ PROBLEMA: ${longRunningRecordings.length} gravação(ões) ativa(s) há mais de 30 minutos`);
      console.log('   💡 A segmentação automática não está funcionando');
      console.log('   💡 Verifique se o hook on_record_mp4 está sendo chamado');
      console.log('   💡 Verifique se o ZLMediaKit está configurado com recordSec=1800');
    }
    
    if (segmentedRecordings.length === 0) {
      console.log('   ⚠️  Nenhuma segmentação automática detectada');
      console.log('   💡 Isso pode ser normal se o sistema foi reiniciado recentemente');
    }
    
    console.log('\n✅ Diagnóstico concluído!');

  } catch (error) {
    console.error('❌ Erro durante o diagnóstico:', error);
  }
}

// Executar diagnóstico
debugRecordingSegmentation();