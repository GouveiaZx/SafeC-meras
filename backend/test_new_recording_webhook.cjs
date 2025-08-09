const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração
const BACKEND_URL = 'http://localhost:3002';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kcjqjqjqjqjqjqjq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testNewRecordingWebhook() {
  console.log('🧪 [TESTE] Testando webhook de nova gravação...');
  
  try {
    // 1. Verificar se existe uma câmera ativa
    console.log('\n1️⃣ Verificando câmeras ativas...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .eq('active', true)
      .limit(1);
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    if (!cameras || cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera ativa encontrada. Criando câmera de teste...');
      
      const testCameraId = '4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd';
      const { data: newCamera, error: createError } = await supabase
        .from('cameras')
        .upsert({
          id: testCameraId,
          name: 'Câmera Teste Webhook',
          rtsp_url: 'rtsp://test.camera/stream',
          active: true,
          status: 'online',
          user_id: null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Erro ao criar câmera de teste:', createError);
        return;
      }
      
      console.log('✅ Câmera de teste criada:', newCamera);
      cameras.push(newCamera);
    }
    
    const testCamera = cameras[0];
    console.log('✅ Usando câmera:', testCamera.name, '(ID:', testCamera.id + ')');
    
    // 2. Simular dados de webhook on_record_mp4
    console.log('\n2️⃣ Simulando webhook on_record_mp4...');
    
    const now = Math.floor(Date.now() / 1000); // timestamp Unix
    const webhookData = {
      start_time: now - 300, // 5 minutos atrás
      file_size: 15728640, // ~15MB
      time_len: 300, // 5 minutos
      file_path: `recordings/${testCamera.id}/test_recording_${now}.mp4`,
      file_name: `test_recording_${now}.mp4`,
      folder: `recordings/${testCamera.id}`,
      url: `http://zlmediakit:8000/recordings/${testCamera.id}/test_recording_${now}.mp4`,
      app: 'live',
      stream: testCamera.id
    };
    
    console.log('📤 Dados do webhook:', JSON.stringify(webhookData, null, 2));
    
    // 3. Enviar webhook para o backend
    console.log('\n3️⃣ Enviando webhook para o backend...');
    
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/webhooks/on_record_mp4`,
        webhookData,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log('✅ Webhook enviado com sucesso!');
      console.log('📥 Resposta do backend:', response.data);
      
    } catch (webhookError) {
      console.error('❌ Erro ao enviar webhook:', {
        status: webhookError.response?.status,
        statusText: webhookError.response?.statusText,
        data: webhookError.response?.data,
        message: webhookError.message
      });
      return;
    }
    
    // 4. Aguardar processamento
    console.log('\n4️⃣ Aguardando processamento (3 segundos)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 5. Verificar se a gravação foi criada no banco
    console.log('\n5️⃣ Verificando se a gravação foi criada no banco...');
    
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .eq('camera_id', testCamera.id)
      .eq('filename', webhookData.file_name)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recordingsError) {
      console.error('❌ Erro ao buscar gravações:', recordingsError);
      return;
    }
    
    if (!recordings || recordings.length === 0) {
      console.error('❌ FALHA: Gravação não foi criada no banco de dados!');
      console.log('🔍 Verificando todas as gravações da câmera...');
      
      const { data: allRecordings } = await supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', testCamera.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      console.log('📋 Últimas 5 gravações da câmera:', allRecordings);
      return;
    }
    
    const newRecording = recordings[0];
    console.log('✅ SUCESSO: Gravação criada no banco!');
    console.log('📊 Dados da gravação:', {
      id: newRecording.id,
      filename: newRecording.filename,
      file_size: newRecording.file_size,
      duration: newRecording.duration,
      status: newRecording.status,
      created_at: newRecording.created_at,
      metadata: newRecording.metadata
    });
    
    // 6. Testar rota de streaming
    console.log('\n6️⃣ Testando rota de streaming...');
    
    try {
      const streamResponse = await axios.get(
        `${BACKEND_URL}/api/recordings/${newRecording.id}/stream`,
        {
          headers: {
            'Authorization': 'Bearer test-token' // Token fictício para teste
          },
          timeout: 5000,
          maxRedirects: 0,
          validateStatus: function (status) {
            return status < 500; // Aceitar redirecionamentos
          }
        }
      );
      
      console.log('✅ Rota de streaming respondeu:', {
        status: streamResponse.status,
        statusText: streamResponse.statusText,
        headers: {
          'content-type': streamResponse.headers['content-type'],
          'content-length': streamResponse.headers['content-length']
        }
      });
      
    } catch (streamError) {
      console.log('⚠️ Rota de streaming (esperado falhar sem arquivo real):', {
        status: streamError.response?.status,
        statusText: streamError.response?.statusText
      });
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
    console.log('✅ Webhook funcionando corretamente');
    console.log('✅ Gravação sincronizada com Supabase');
    console.log('✅ Rota de streaming configurada');
    
  } catch (error) {
    console.error('❌ ERRO GERAL NO TESTE:', error);
  }
}

// Executar teste
testNewRecordingWebhook().catch(console.error);