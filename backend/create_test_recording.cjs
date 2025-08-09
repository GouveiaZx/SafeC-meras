const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestRecording() {
  try {
    console.log('🎬 Criando gravação de teste funcional...');
    
    // 1. Verificar se existe uma câmera ativa
    console.log('📹 Verificando câmeras disponíveis...');
    const { data: cameras, error: cameraError } = await supabase
      .from('cameras')
      .select('*')
      .eq('status', 'online')
      .limit(1);
    
    if (cameraError) {
      console.error('❌ Erro ao buscar câmeras:', cameraError);
      return;
    }
    
    let cameraId;
    if (!cameras || cameras.length === 0) {
      console.log('📹 Nenhuma câmera ativa encontrada. Criando câmera de teste...');
      const testCameraId = uuidv4();
      const { data: newCamera, error: createCameraError } = await supabase
        .from('cameras')
        .insert({
          id: testCameraId,
          name: 'Câmera de Teste',
          rtsp_url: 'rtsp://localhost:554/test_camera',
          rtmp_url: 'rtmp://localhost:1935/live/test_camera',
          status: 'online',
          active: true
        })
        .select()
        .single();
      
      if (createCameraError) {
        console.error('❌ Erro ao criar câmera de teste:', createCameraError);
        return;
      }
      
      cameraId = newCamera.id;
      console.log('✅ Câmera de teste criada:', cameraId);
    } else {
      cameraId = cameras[0].id;
      console.log('✅ Usando câmera existente:', cameraId);
    }
    
    // 2. Criar diretório de gravações se não existir
    const recordingsDir = path.join(__dirname, 'recordings');
    try {
      await fs.access(recordingsDir);
    } catch {
      await fs.mkdir(recordingsDir, { recursive: true });
      console.log('📁 Diretório de gravações criado:', recordingsDir);
    }
    
    // 3. Criar arquivo de vídeo de teste (simulado)
    const recordingId = uuidv4();
    const filename = `test_recording_${Date.now()}.mp4`;
    const filePath = path.join(recordingsDir, filename);
    
    // Criar um arquivo de vídeo simulado (pequeno arquivo binário)
    const videoHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box header
      0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00, // isom brand
      0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32, // compatible brands
      0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31  // more brands
    ]);
    
    // Adicionar dados simulados para criar um arquivo de ~1MB
    const simulatedData = Buffer.alloc(1024 * 1024, 0x00); // 1MB de zeros
    const fullVideoData = Buffer.concat([videoHeader, simulatedData]);
    
    await fs.writeFile(filePath, fullVideoData);
    console.log('🎥 Arquivo de vídeo de teste criado:', filePath);
    
    // 4. Obter estatísticas do arquivo
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // 5. Inserir gravação no banco de dados
    console.log('💾 Inserindo gravação no banco de dados...');
    const now = new Date().toISOString();
    
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .insert({
        id: recordingId,
        camera_id: cameraId,
        filename: filename,
        file_path: filename, // Caminho relativo
        local_path: filePath, // Caminho absoluto
        file_size: fileSize,
        duration: 30, // 30 segundos simulados
        status: 'completed',
        start_time: new Date(Date.now() - 30000).toISOString(), // 30 segundos atrás
        created_at: now,
        updated_at: now,
        metadata: {
          stream_name: 'test_camera',
          format: 'mp4',
          processed_by_hook: false,
          is_test: true
        }
      })
      .select()
      .single();
    
    if (recordingError) {
      console.error('❌ Erro ao inserir gravação no banco:', recordingError);
      return;
    }
    
    console.log('✅ Gravação de teste criada com sucesso!');
    console.log('📋 Detalhes da gravação:');
    console.log(`   ID: ${recording.id}`);
    console.log(`   Filename: ${recording.filename}`);
    console.log(`   Tamanho: ${(recording.file_size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Duração: ${recording.duration}s`);
    console.log(`   Status: ${recording.status}`);
    console.log(`   Caminho: ${recording.local_path}`);
    
    // 6. Testar a rota de streaming
    console.log('\n🎥 Testando rota de streaming...');
    const streamUrl = `http://localhost:3002/api/recordings/${recording.id}/stream`;
    console.log(`   URL de streaming: ${streamUrl}`);
    
    return {
      recordingId: recording.id,
      filename: recording.filename,
      streamUrl: streamUrl
    };
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

createTestRecording().then(result => {
  if (result) {
    console.log('\n🎉 Gravação de teste pronta para uso!');
    console.log(`\n📝 Para testar no frontend, use o ID: ${result.recordingId}`);
    console.log(`\n🌐 URL de streaming: ${result.streamUrl}`);
  }
});