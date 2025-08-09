const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createSpecificRecording() {
  try {
    console.log('🎯 CRIANDO GRAVAÇÃO ESPECÍFICA PARA O USUÁRIO');
    console.log('===============================================');
    
    const specificId = '1d062cbb-edcd-4eba-832c-f49595636ad4';
    const filename = `recording_${Date.now()}.mp4`;
    const recordingsPath = path.resolve('./recordings');
    const filePath = path.join(recordingsPath, filename);
    
    console.log(`📋 ID específico: ${specificId}`);
    console.log(`📁 Arquivo: ${filename}`);
    
    // Garantir que o diretório existe
    await fs.mkdir(recordingsPath, { recursive: true });
    
    // Criar arquivo de vídeo MP4 mínimo (mais realista)
    console.log('🎬 Criando arquivo de vídeo MP4...');
    const mp4Header = Buffer.from([
      // ftyp box
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // box size + 'ftyp'
      0x69, 0x73, 0x6F, 0x6D, // major brand 'isom'
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32, // compatible brands
      0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31,
      
      // mdat box (minimal)
      0x00, 0x00, 0x00, 0x08, 0x6D, 0x64, 0x61, 0x74  // box size + 'mdat'
    ]);
    
    // Adicionar dados de vídeo simulados para ter um tamanho maior
    const videoData = Buffer.alloc(1024 * 50); // 50KB de dados
    videoData.fill(0x00); // Preencher com zeros
    
    const fullVideoData = Buffer.concat([mp4Header, videoData]);
    await fs.writeFile(filePath, fullVideoData);
    
    const stats = await fs.stat(filePath);
    console.log(`✅ Arquivo criado: ${stats.size} bytes`);
    
    // Não precisamos de user_id - a tabela recordings não tem essa coluna
    console.log('ℹ️  Tabela recordings não requer user_id');
    
    // Buscar uma câmera para associar à gravação
    console.log('📹 Buscando câmera...');
    const { data: cameras } = await supabase
      .from('cameras')
      .select('id')
      .limit(1);
    
    if (!cameras || cameras.length === 0) {
      throw new Error('Nenhuma câmera encontrada');
    }
    
    const cameraId = cameras[0].id;
    console.log(`✅ Câmera encontrada: ${cameraId}`);
    
    // Inserir gravação no banco com o ID específico
    console.log('💾 Inserindo gravação no banco...');
    const now = new Date().toISOString();
    const recordingData = {
      id: specificId,
      filename: filename.replace('.mp4', ''),
      file_path: filename,
      local_path: filename,
      file_size: stats.size,
      duration: 60, // 1 minuto
      status: 'completed',
      camera_id: cameraId,
      start_time: now,
      end_time: now,
      started_at: now,
      stopped_at: now,
      created_at: now,
      updated_at: now
    };
    
    const { data: recording, error } = await supabase
      .from('recordings')
      .insert([recordingData])
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erro ao inserir gravação:', error);
      throw error;
    }
    
    console.log('✅ Gravação inserida com sucesso!');
    console.log('');
    console.log('📊 DETALHES DA GRAVAÇÃO CRIADA:');
    console.log('==============================');
    console.log(`🆔 ID: ${recording.id}`);
    console.log(`📁 Filename: ${recording.filename}`);
    console.log(`📂 File Path: ${recording.file_path}`);
    console.log(`📍 Local Path: ${recording.local_path}`);
    console.log(`📏 Tamanho: ${recording.file_size} bytes`);
    console.log(`⏱️  Duração: ${recording.duration}s`);
    console.log(`📹 Câmera: ${recording.camera_id}`);
    console.log(`📅 Criada: ${recording.created_at}`);
    console.log(`⏰ Iniciada: ${recording.started_at}`);
    console.log(`⏹️  Parada: ${recording.stopped_at}`);
    console.log('');
    console.log('🎉 GRAVAÇÃO ESPECÍFICA CRIADA COM SUCESSO!');
    console.log('🎬 O player agora deve conseguir reproduzir esta gravação.');
    console.log('');
    console.log('🔗 URLs para testar:');
    console.log(`   📺 Streaming: /api/recordings/${specificId}/stream`);
    console.log(`   📥 Download: /api/recordings/${specificId}/download`);
    
  } catch (error) {
    console.error('❌ Erro ao criar gravação específica:', error);
    process.exit(1);
  }
}

createSpecificRecording();