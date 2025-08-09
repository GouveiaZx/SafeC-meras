import { createClient } from '@supabase/supabase-js';
import recordingService from './src/services/RecordingService.js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRecording() {
  try {
    console.log('🎬 Testando sistema de gravação...');
    
    // Buscar uma câmera online
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .eq('status', 'online')
      .limit(1);
    
    if (camerasError || !cameras || cameras.length === 0) {
      console.log('❌ Nenhuma câmera online encontrada');
      return;
    }
    
    const camera = cameras[0];
    console.log(`📹 Testando com câmera: ${camera.name} (${camera.id})`);
    console.log(`📡 RTSP URL: ${camera.rtsp_url}`);
    
    // Verificar configurações necessárias
    console.log('\n🔧 Verificando configurações:');
    console.log(`ZLMEDIAKIT_API_URL: ${process.env.ZLMEDIAKIT_API_URL}`);
    console.log(`ZLMEDIAKIT_SECRET: ${process.env.ZLMEDIAKIT_SECRET ? '***configurado***' : 'NÃO CONFIGURADO'}`);
    console.log(`RECORDINGS_PATH: ${process.env.RECORDINGS_PATH}`);
    
    if (!process.env.ZLMEDIAKIT_API_URL || !process.env.ZLMEDIAKIT_SECRET) {
      console.log('❌ Configurações do ZLMediaKit não encontradas!');
      console.log('💡 Verifique se ZLMEDIAKIT_API_URL e ZLMEDIAKIT_SECRET estão configurados no .env');
      return;
    }
    
    // Usar RecordingService singleton
    // const recordingService já está importado
    
    console.log('\n🚀 Tentando iniciar gravação...');
    
    try {
      const result = await recordingService.startRecording(camera.id);
      console.log('✅ Gravação iniciada com sucesso!');
      console.log('📊 Resultado:', JSON.stringify(result, null, 2));
      
      // Aguardar alguns segundos e verificar se a gravação foi criada no banco
      console.log('\n⏳ Aguardando 3 segundos para verificar o banco...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const { data: recordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', camera.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!recordingsError && recordings && recordings.length > 0) {
        console.log('✅ Gravação encontrada no banco de dados!');
        console.log('📋 Detalhes:', JSON.stringify(recordings[0], null, 2));
        
        // Parar a gravação após o teste
        console.log('\n🛑 Parando gravação de teste...');
        const stopResult = await recordingService.stopRecording(camera.id, recordings[0].id);
        console.log('✅ Gravação parada:', JSON.stringify(stopResult, null, 2));
      } else {
        console.log('❌ Gravação não encontrada no banco de dados');
        console.log('🔍 Erro:', recordingsError);
      }
      
    } catch (recordingError) {
      console.log('❌ Erro ao iniciar gravação:', recordingError.message);
      console.log('🔍 Detalhes do erro:', recordingError);
      
      // Verificar se é um problema de conectividade com ZLMediaKit
      if (recordingError.message.includes('ECONNREFUSED') || recordingError.message.includes('timeout')) {
        console.log('\n💡 Possíveis causas:');
        console.log('   1. ZLMediaKit não está rodando');
        console.log('   2. URL do ZLMediaKit está incorreta');
        console.log('   3. Firewall bloqueando a conexão');
        console.log('   4. ZLMediaKit não está configurado corretamente');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error);
  }
}

testRecording();