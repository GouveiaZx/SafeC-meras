import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRecordingFixed() {
  try {
    console.log('🎬 Testando gravação com stream ativo...');
    
    // Buscar streams ativos no ZLMediaKit
    const response = await fetch(`${process.env.ZLMEDIAKIT_API_URL}/index/api/getMediaList?secret=${process.env.ZLMEDIAKIT_SECRET}`);
    const mediaData = await response.json();
    
    if (mediaData.code !== 0 || !mediaData.data || mediaData.data.length === 0) {
      console.log('❌ Nenhum stream ativo encontrado no ZLMediaKit');
      return;
    }
    
    const activeStream = mediaData.data[0];
    console.log(`📡 Stream ativo encontrado:`);
    console.log(`   App: ${activeStream.app}`);
    console.log(`   Stream: ${activeStream.stream}`);
    console.log(`   VHost: ${activeStream.vhost}`);
    console.log(`   Schema: ${activeStream.schema}`);
    
    // Buscar câmera correspondente
    const { data: camera, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .eq('id', activeStream.stream)
      .single();
    
    if (cameraError || !camera) {
      console.log(`❌ Câmera não encontrada para stream ${activeStream.stream}`);
      return;
    }
    
    console.log(`📹 Câmera encontrada: ${camera.name}`);
    
    // Testar gravação diretamente via API ZLMediaKit
    const recordingParams = {
      type: 0, // MP4
      vhost: activeStream.vhost,
      app: activeStream.app,
      stream: activeStream.stream,
      customized_path: `recordings/${camera.id}`,
      max_second: 60, // 1 minuto para teste
      secret: process.env.ZLMEDIAKIT_SECRET
    };
    
    console.log('\n🚀 Iniciando gravação via ZLMediaKit...');
    console.log('📋 Parâmetros:', JSON.stringify(recordingParams, null, 2));
    
    const recordResponse = await fetch(`${process.env.ZLMEDIAKIT_API_URL}/index/api/startRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(recordingParams)
    });
    
    const recordResult = await recordResponse.json();
    console.log('📊 Resposta ZLMediaKit:', JSON.stringify(recordResult, null, 2));
    
    if (recordResult.code === 0) {
      console.log('✅ Gravação iniciada com sucesso!');
      
      // Criar registro no banco de dados
      const recordingId = crypto.randomUUID();
      const { data: recording, error: insertError } = await supabase
        .from('recordings')
        .insert({
          id: recordingId,
          camera_id: camera.id,
          filename: `test_recording_${Date.now()}.mp4`,
          file_path: `${recordingParams.customized_path}/test_recording_${Date.now()}.mp4`,
          status: 'recording',
          start_time: new Date().toISOString(),
          created_at: new Date().toISOString(),
          metadata: {
            vhost: recordingParams.vhost,
            app: recordingParams.app,
            stream: recordingParams.stream,
            type: recordingParams.type,
            zlmediakit_response: recordResult
          }
        })
        .select()
        .single();
      
      if (insertError) {
        console.log('❌ Erro ao criar registro no banco:', insertError);
      } else {
        console.log('✅ Registro criado no banco de dados!');
        console.log('📋 ID da gravação:', recordingId);
        
        // Aguardar alguns segundos
        console.log('\n⏳ Aguardando 10 segundos...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Parar gravação
        console.log('🛑 Parando gravação...');
        const stopResponse = await fetch(`${process.env.ZLMEDIAKIT_API_URL}/index/api/stopRecord`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: recordingParams.type,
            vhost: recordingParams.vhost,
            app: recordingParams.app,
            stream: recordingParams.stream,
            secret: process.env.ZLMEDIAKIT_SECRET
          })
        });
        
        const stopResult = await stopResponse.json();
        console.log('📊 Resultado da parada:', JSON.stringify(stopResult, null, 2));
        
        // Atualizar status no banco
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', recordingId);
        
        if (updateError) {
          console.log('❌ Erro ao atualizar status:', updateError);
        } else {
          console.log('✅ Status atualizado para completed!');
        }
        
        // Verificar se o arquivo foi criado
        console.log('\n🔍 Verificando arquivos criados...');
        const fs = await import('fs/promises');
        const path = await import('path');
        
        try {
          const recordingsDir = './storage/recordings';
          const cameraDir = path.join(recordingsDir, camera.id);
          
          const files = await fs.readdir(cameraDir);
          console.log(`📁 Arquivos encontrados em ${cameraDir}:`);
          for (const file of files) {
            const filePath = path.join(cameraDir, file);
            const stats = await fs.stat(filePath);
            console.log(`   ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
          }
        } catch (dirError) {
          console.log('❌ Erro ao verificar diretório:', dirError.message);
        }
      }
    } else {
      console.log('❌ Erro ao iniciar gravação:', recordResult.msg);
    }
    
  } catch (error) {
    console.error('❌ Erro geral no teste:', error);
  }
}

testRecordingFixed();