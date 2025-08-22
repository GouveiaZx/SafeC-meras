/**
 * Script para criar uma câmera de teste no sistema
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createTestCamera() {
  console.log('🔍 Verificando estrutura da tabela cameras...');
  
  try {
    // Primeiro, verificar se já existe alguma câmera
    const { data: existingCameras, error: listError } = await supabase
      .from('cameras')
      .select('*')
      .limit(5);
    
    if (listError) {
      console.error('❌ Erro ao listar câmeras existentes:', listError);
      return;
    }
    
    console.log(`📹 Câmeras existentes: ${existingCameras?.length || 0}`);
    if (existingCameras && existingCameras.length > 0) {
      console.log('Exemplo de câmera existente:', existingCameras[0]);
    }
    
    // Criar uma câmera de teste baseada no schema real
    const testCamera = {
      id: uuidv4(),
      name: 'Câmera Teste - Laboratório',
      description: 'Câmera de teste para validação do sistema de streaming',
      type: 'ip',
      brand: 'Generic',
      model: 'Test Model',
      location: 'Laboratório de Testes',
      ip_address: '192.168.1.200',
      port: 554,
      rtsp_url: 'rtsp://admin:admin123@192.168.1.200:554/stream1',
      hls_url: null,
      status: 'offline',
      active: true,
      is_streaming: false,
      recording_enabled: false,
      motion_detection: false,
      ptz_enabled: false,
      audio_enabled: true,
      resolution: '1920x1080',
      fps: 25,
      quality: 'medium',
      codec: 'h264',
      stream_type: 'rtsp',
      continuous_recording: false,
      retention_days: 30,
      quality_profile: 'medium',
      settings: {},
      metadata: {}
    };
    
    console.log('\n🚀 Criando câmera de teste...');
    console.log('Dados da câmera:', JSON.stringify(testCamera, null, 2));
    
    const { data: newCamera, error: insertError } = await supabase
      .from('cameras')
      .insert(testCamera)
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao criar câmera:', insertError);
      return;
    }
    
    console.log('✅ Câmera de teste criada com sucesso!');
    console.log('ID da câmera:', newCamera.id);
    console.log('Nome:', newCamera.name);
    console.log('Status:', newCamera.status);
    
    // Tentar buscar a câmera recém-criada
    console.log('\n🔍 Verificando se a câmera foi salva corretamente...');
    const { data: verifyCamera, error: verifyError } = await supabase
      .from('cameras')
      .select('*')
      .eq('id', newCamera.id)
      .single();
    
    if (verifyError) {
      console.error('❌ Erro ao verificar câmera:', verifyError);
    } else {
      console.log('✅ Câmera verificada com sucesso!');
      console.log('Dados completos:', JSON.stringify(verifyCamera, null, 2));
      
      // Agora tentar iniciar o streaming desta câmera
      console.log('\n🎬 A câmera está pronta para testes de streaming!');
      console.log('Para testar:');
      console.log('1. Execute: node backend/src/scripts/startCameraStreaming.js');
      console.log('2. Ou acesse via interface web');
      console.log('3. URL RTSP configurada:', testCamera.rtsp_url);
      console.log('4. ID para referência:', newCamera.id);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar criação
createTestCamera().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});