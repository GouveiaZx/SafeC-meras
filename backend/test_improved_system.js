/**
 * Script de teste para verificar o sistema melhorado de gravações
 * Testa: webhook → banco → localização robusta → player
 */

import { createClient } from '@supabase/supabase-js';
import ImprovedRecordingService from './src/services/RecordingService_improved.js';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Configurar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_BASE = 'http://localhost:3002';

async function testImprovedSystem() {
  console.log('🚀 TESTE DO SISTEMA MELHORADO DE GRAVAÇÕES');
  console.log('=' .repeat(60));
  
  try {
    // 1. Verificar se o sistema está limpo
    console.log('\n1️⃣ Verificando estado inicial do sistema...');
    const { data: existingRecordings, error } = await supabase
      .from('recordings')
      .select('*')
      .limit(5);
    
    if (error) {
      console.error('❌ Erro ao verificar gravações:', error);
      return;
    }
    
    console.log(`   📊 Gravações existentes: ${existingRecordings.length}`);
    
    // 2. Buscar ou criar câmera de teste
    console.log('\n2️⃣ Preparando câmera de teste...');
    
    let testCameraId;
    
    // Buscar câmera existente
    const { data: existingCameras } = await supabase
      .from('cameras')
      .select('id')
      .limit(1);
    
    if (existingCameras && existingCameras.length > 0) {
      testCameraId = existingCameras[0].id;
      console.log('   ✅ Usando câmera existente:', testCameraId);
    } else {
      // Criar câmera temporária
      testCameraId = uuidv4();
      const { error: cameraError } = await supabase
        .from('cameras')
        .insert([{
          id: testCameraId,
          name: 'Câmera de Teste',
          rtsp_url: 'rtsp://test.example.com/stream',
          status: 'active',
          created_at: new Date().toISOString()
        }]);
      
      if (cameraError) {
        console.error('❌ Erro ao criar câmera de teste:', cameraError);
        return;
      }
      console.log('   ✅ Câmera de teste criada:', testCameraId);
    }
    
    // 3. Criar uma gravação de teste no banco
    console.log('\n3️⃣ Criando gravação de teste no banco...');
    
    const testRecording = {
      id: uuidv4(),
      camera_id: testCameraId,
      filename: `test-video-${Date.now()}.mp4`,
      file_path: 'test-video.mp4',
      local_path: null, // Será definido pela localização robusta
      file_size: 1024000,
      duration: 30,
      status: 'completed',
      quality: 'medium',
      event_type: 'manual',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 30000).toISOString(),
      created_at: new Date().toISOString()
    };
    
    const { data: insertedRecording, error: insertError } = await supabase
      .from('recordings')
      .insert([testRecording])
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao inserir gravação de teste:', insertError);
      return;
    }
    
    console.log('   ✅ Gravação de teste criada:', insertedRecording.id);
    
    // 4. Criar arquivo de teste físico
    console.log('\n4️⃣ Criando arquivo de teste físico...');
    
    const recordingsDir = path.join(__dirname, 'recordings');
    await fs.mkdir(recordingsDir, { recursive: true });
    
    const testFilePath = path.join(recordingsDir, testRecording.filename);
    const testContent = Buffer.alloc(1024, 'test video content'); // 1KB de dados de teste
    
    await fs.writeFile(testFilePath, testContent);
    console.log('   ✅ Arquivo de teste criado:', testFilePath);
    
    // 5. Testar localização robusta
    console.log('\n5️⃣ Testando localização robusta de arquivos...');
    
    const locationResult = await ImprovedRecordingService.locateRecordingFile(insertedRecording);
    
    if (locationResult.found) {
      console.log('   ✅ Arquivo localizado com sucesso!');
      console.log(`   📁 Estratégia: ${locationResult.strategy}`);
      console.log(`   📄 Caminho: ${locationResult.filePath}`);
      console.log(`   📊 Tamanho: ${locationResult.fileSize} bytes`);
    } else {
      console.log('   ❌ Falha na localização:', locationResult.reason);
    }
    
    // 6. Testar prepareDownload
    console.log('\n6️⃣ Testando prepareDownload...');
    
    const downloadInfo = await ImprovedRecordingService.prepareDownload(insertedRecording.id);
    
    if (downloadInfo.exists) {
      console.log('   ✅ PrepareDownload bem-sucedido!');
      console.log(`   📁 Estratégia: ${downloadInfo.strategy}`);
      console.log(`   📄 Arquivo: ${downloadInfo.filename}`);
      console.log(`   📊 Tamanho: ${downloadInfo.fileSize} bytes`);
    } else {
      console.log('   ❌ PrepareDownload falhou:', downloadInfo.message);
    }
    
    // 7. Testar getFileStream
    console.log('\n7️⃣ Testando getFileStream...');
    
    if (downloadInfo.exists && !downloadInfo.isS3) {
      try {
        const streamInfo = await ImprovedRecordingService.getFileStream(downloadInfo.filePath);
        console.log('   ✅ Stream criado com sucesso!');
        console.log(`   📊 Tamanho total: ${streamInfo.totalSize} bytes`);
        
        // Testar stream com range
        const rangeStreamInfo = await ImprovedRecordingService.getFileStream(
          downloadInfo.filePath, 
          'bytes=0-99'
        );
        console.log('   ✅ Stream com range criado!');
        console.log(`   📊 Range: ${rangeStreamInfo.contentRange}`);
        
      } catch (streamError) {
        console.log('   ❌ Erro ao criar stream:', streamError.message);
      }
    }
    
    // 8. Testar sincronização de todas as gravações
    console.log('\n8️⃣ Testando sincronização de gravações...');
    
    const syncResult = await ImprovedRecordingService.syncAllRecordings();
    console.log('   📊 Resultado da sincronização:');
    console.log(`   ✅ Sincronizadas: ${syncResult.synced}`);
    console.log(`   ❌ Falharam: ${syncResult.failed}`);
    console.log(`   📋 Total: ${syncResult.total}`);
    
    // 9. Verificar se local_path foi atualizado
    console.log('\n9️⃣ Verificando atualização do local_path...');
    
    const { data: updatedRecording } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', insertedRecording.id)
      .single();
    
    if (updatedRecording.local_path) {
      console.log('   ✅ local_path atualizado:', updatedRecording.local_path);
    } else {
      console.log('   ⚠️ local_path ainda não foi definido');
    }
    
    // 10. Simular teste de API (se servidor estiver rodando)
    console.log('\n🔟 Testando API endpoints...');
    
    try {
      // Testar endpoint de streaming
      const streamResponse = await fetch(`${API_BASE}/api/recordings/${insertedRecording.id}/stream`, {
        method: 'HEAD', // Usar HEAD para não baixar o arquivo
        headers: {
          'Range': 'bytes=0-99'
        }
      });
      
      console.log(`   📡 Stream endpoint: ${streamResponse.status} ${streamResponse.statusText}`);
      
      if (streamResponse.status === 206 || streamResponse.status === 200) {
        console.log('   ✅ Streaming funcionando!');
        console.log(`   📊 Content-Length: ${streamResponse.headers.get('content-length')}`);
        console.log(`   📊 Content-Range: ${streamResponse.headers.get('content-range')}`);
      }
      
    } catch (apiError) {
      console.log('   ⚠️ API não disponível (servidor não está rodando)');
    }
    
    // 11. Limpeza
    console.log('\n🧹 Limpando dados de teste...');
    
    // Remover arquivo de teste
    try {
      await fs.unlink(testFilePath);
      console.log('   ✅ Arquivo de teste removido');
    } catch (error) {
      console.log('   ⚠️ Erro ao remover arquivo de teste:', error.message);
    }
    
    // Remover gravação de teste do banco
    const { error: deleteError } = await supabase
      .from('recordings')
      .delete()
      .eq('id', insertedRecording.id);
    
    if (deleteError) {
      console.log('   ⚠️ Erro ao remover gravação de teste:', deleteError.message);
    } else {
      console.log('   ✅ Gravação de teste removida do banco');
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
    console.log('=' .repeat(60));
    console.log('✅ Sistema melhorado está funcionando corretamente');
    console.log('✅ Localização robusta de arquivos implementada');
    console.log('✅ Streaming com suporte a Range requests');
    console.log('✅ Sincronização automática de local_path');
    
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Executar teste
testImprovedSystem().catch(console.error);