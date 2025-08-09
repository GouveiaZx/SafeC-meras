import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const zlmApiUrl = process.env.ZLMEDIAKIT_API_URL || 'http://localhost:8000';
const zlmSecret = process.env.ZLMEDIAKIT_SECRET || '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

async function testManualSegmentation() {
  console.log('🧪 Testando segmentação manual...');
  
  try {
    // 1. Verificar streams ativas no ZLMediaKit
    console.log('\n1. Verificando streams ativas no ZLMediaKit...');
    const streamsResponse = await axios.get(`${zlmApiUrl}/index/api/getMediaList`, {
      params: { secret: zlmSecret },
      timeout: 5000
    });
    
    if (streamsResponse.data.code !== 0) {
      console.error('❌ Erro ao obter lista de streams:', streamsResponse.data.msg);
      return;
    }
    
    const activeStreams = streamsResponse.data.data || [];
    console.log(`✅ Encontradas ${activeStreams.length} streams ativas`);
    
    if (activeStreams.length === 0) {
      console.log('⚠️ Nenhuma stream ativa encontrada. Iniciando streams de teste...');
      await startTestStreams();
      return;
    }
    
    // 2. Verificar gravações ativas no banco
    console.log('\n2. Verificando gravações ativas no banco...');
    const { data: activeRecordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (recordingsError) {
      console.error('❌ Erro ao buscar gravações ativas:', recordingsError);
      return;
    }
    
    console.log(`✅ Encontradas ${activeRecordings?.length || 0} gravações ativas`);
    
    // 3. Testar segmentação para cada stream ativa
    for (const stream of activeStreams) {
      const streamKey = `${stream.app}/${stream.stream}`;
      console.log(`\n3. Testando segmentação para stream: ${streamKey}`);
      
      // Extrair cameraId do nome da stream
      const cameraId = extractCameraId(stream.stream);
      
      if (!cameraId) {
        console.log(`⚠️ Não foi possível extrair cameraId da stream: ${stream.stream}`);
        continue;
      }
      
      console.log(`📹 CameraId extraído: ${cameraId}`);
      
      // Verificar se há gravação ativa para esta câmera
      const activeRecording = activeRecordings?.find(r => r.camera_id === cameraId);
      
      if (!activeRecording) {
        console.log(`⚠️ Nenhuma gravação ativa encontrada para câmera ${cameraId}`);
        continue;
      }
      
      console.log(`✅ Gravação ativa encontrada: ${activeRecording.id}`);
      
      // Executar segmentação manual
      await performManualSegmentation(streamKey, stream, activeRecording, cameraId);
    }
    
  } catch (error) {
    console.error('❌ Erro durante teste de segmentação:', error);
  }
}

async function performManualSegmentation(streamKey, streamInfo, activeRecording, cameraId) {
  try {
    console.log(`🔄 Iniciando segmentação manual para ${streamKey}...`);
    
    // 1. Parar gravação atual
    console.log('  📹 Parando gravação atual...');
    const stopResponse = await axios.get(`${zlmApiUrl}/index/api/stopRecord`, {
      params: {
        secret: zlmSecret,
        type: 1, // MP4
        vhost: streamInfo.vhost || '__defaultVhost__',
        app: streamInfo.app,
        stream: streamInfo.stream
      },
      timeout: 10000
    });
    
    if (stopResponse.data.code === 0) {
      console.log('  ✅ Gravação parada com sucesso');
    } else {
      console.log(`  ⚠️ Falha ao parar gravação: ${stopResponse.data.msg}`);
    }
    
    // 2. Aguardar um momento
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Iniciar nova gravação
    console.log('  📹 Iniciando nova gravação...');
    const startResponse = await axios.get(`${zlmApiUrl}/index/api/startRecord`, {
      params: {
        secret: zlmSecret,
        type: 1, // MP4
        vhost: streamInfo.vhost || '__defaultVhost__',
        app: streamInfo.app,
        stream: streamInfo.stream
      },
      timeout: 10000
    });
    
    if (startResponse.data.code === 0) {
      console.log('  ✅ Nova gravação iniciada com sucesso');
    } else {
      console.log(`  ⚠️ Falha ao iniciar nova gravação: ${startResponse.data.msg}`);
    }
    
    // 4. Atualizar banco de dados
    console.log('  💾 Atualizando banco de dados...');
    await updateRecordingSegmentation(activeRecording, cameraId);
    
    console.log(`✅ Segmentação manual concluída para ${streamKey}`);
    
  } catch (error) {
    console.error(`❌ Erro na segmentação manual de ${streamKey}:`, error.message);
  }
}

async function updateRecordingSegmentation(activeRecording, cameraId) {
  try {
    const now = new Date();
    
    // Marcar gravação anterior como completa
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        status: 'completed',
        end_time: now.toISOString(),
        is_segmentation: true,
        updated_at: now.toISOString()
      })
      .eq('id', activeRecording.id);
    
    if (updateError) {
      console.error('  ❌ Erro ao atualizar gravação:', updateError);
      throw updateError;
    }
    
    console.log('  ✅ Gravação anterior marcada como completa');
    
    // Criar nova gravação
    const { error: createError } = await supabase
      .from('recordings')
      .insert({
        camera_id: cameraId,
        filename: `${cameraId}_${Date.now()}.mp4`,
        status: 'recording',
        start_time: now.toISOString(),
        is_segmentation: true,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });
    
    if (createError) {
      console.error('  ❌ Erro ao criar nova gravação:', createError);
      throw createError;
    }
    
    console.log('  ✅ Nova gravação criada no banco de dados');
    
  } catch (error) {
    console.error(`  ❌ Erro ao atualizar banco de dados para câmera ${cameraId}:`, error);
  }
}

function extractCameraId(streamName) {
  // Assumindo que o nome da stream é o próprio ID da câmera (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(streamName)) {
    return streamName;
  }
  
  // Se não for UUID, tentar extrair de outros formatos
  // Por exemplo: camera_123, stream_abc, etc.
  const match = streamName.match(/([a-f0-9-]{36})/i);
  return match ? match[1] : null;
}

async function startTestStreams() {
  console.log('🚀 Iniciando streams de teste...');
  
  try {
    // Buscar câmeras no banco
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('*')
      .limit(2);
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    if (!cameras || cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera encontrada no banco de dados');
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras`);
    
    for (const camera of cameras) {
      console.log(`\n🎬 Tentando iniciar stream para câmera: ${camera.name} (${camera.id})`);
      
      // Aqui você pode implementar a lógica para iniciar streams
      // Por exemplo, chamando o StreamingService ou API específica
      console.log(`  📡 RTSP URL: ${camera.rtsp_url}`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao iniciar streams de teste:', error);
  }
}

// Executar teste
testManualSegmentation()
  .then(() => {
    console.log('\n🎉 Teste de segmentação manual concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });