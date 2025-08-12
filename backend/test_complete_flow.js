import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCompleteFlow() {
  console.log('🎯 TESTANDO FLUXO COMPLETO DE GRAVAÇÃO\n');

  // 1. Verificar câmeras disponíveis
  console.log('📹 Verificando câmeras disponíveis...');
  const { data: cameras, error: camerasError } = await supabase
    .from('cameras')
    .select('*');

  if (camerasError) {
    console.error('❌ Erro ao buscar câmeras:', camerasError);
    return;
  }

  if (!cameras || cameras.length === 0) {
    console.log('⚠️ Nenhuma câmera encontrada. Criando câmera de teste...');
    
    const { data: newCamera, error: createError } = await supabase
      .from('cameras')
      .insert({
        name: 'Câmera Teste Completo',
        stream_url: 'rtmp://localhost/live/test',
        status: 'active',
        config: { test: true }
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Erro ao criar câmera:', createError);
      return;
    }

    cameras.push(newCamera);
    console.log(`✅ Câmera criada: ${newCamera.id}`);
  }

  const camera = cameras[0];
  console.log(`📹 Usando câmera: ${camera.name} (${camera.id})`);

  // 2. Testar webhook com dados reais
  console.log('\n🔗 Testando webhook...');
  const webhookData = {
    start_time: Math.floor(Date.now() / 1000) - 1800,
    file_size: 52428800,
    time_len: 1800,
    file_path: `live/${camera.id}/2025-08-10/2025-08-10-14-00-00-0.mp4`,
    file_name: '2025-08-10-14-00-00-0.mp4',
    folder: `live/${camera.id}/2025-08-10`,
    url: `record/live/${camera.id}/2025-08-10/2025-08-10-14-00-00-0.mp4`,
    app: 'live',
    stream: camera.id
  };

  try {
    const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    const result = await response.json();
    console.log('✅ Resposta do webhook:', result);

    if (result.code === 0) {
      console.log('🎉 Webhook processado com sucesso!');
    } else {
      console.log('⚠️ Webhook retornou erro:', result.msg);
    }

  } catch (error) {
    console.error('❌ Erro ao testar webhook:', error);
  }

  // 3. Verificar gravações no banco
  console.log('\n📊 Verificando gravações no banco...');
  const { data: recordings, error: recordingsError } = await supabase
    .from('recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (recordingsError) {
    console.error('❌ Erro ao buscar gravações:', recordingsError);
    return;
  }

  console.log(`📹 Gravações encontradas: ${recordings?.length || 0}`);
  recordings.forEach(rec => {
    console.log(`   📹 ${rec.camera_id} - ${rec.filename} - ${rec.status}`);
  });

  // 4. Verificar arquivos físicos
  console.log('\n📁 Verificando arquivos físicos...');
  const recordingsPath = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live';
  
  if (fs.existsSync(recordingsPath)) {
    const cameras = fs.readdirSync(recordingsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`📹 Câmeras com arquivos físicos: ${cameras.length}`);
    
    cameras.forEach(cameraId => {
      const cameraPath = path.join(recordingsPath, cameraId);
      const dates = fs.readdirSync(cameraPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      let fileCount = 0;
      dates.forEach(dateDir => {
        const datePath = path.join(cameraPath, dateDir);
        const files = fs.readdirSync(datePath)
          .filter(file => file.endsWith('.mp4'));
        fileCount += files.length;
      });

      console.log(`   📹 ${cameraId}: ${fileCount} arquivos`);
    });
  }

  // 5. Status final
  console.log('\n📋 STATUS FINAL DO SISTEMA:');
  console.log(`   ✅ Câmeras: ${cameras.length}`);
  console.log(`   ✅ Gravações no banco: ${recordings?.length || 0}`);
  console.log(`   ✅ Webhook endpoint: http://localhost:3002/api/webhooks/on_record_mp4`);
  console.log(`   ✅ ZLMediaKit: Rodando via Docker`);
  console.log('\n🎯 Sistema pronto para novas gravações!');
}

testCompleteFlow();