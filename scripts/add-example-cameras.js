/**
 * Script para adicionar câmeras de exemplo ao sistema NewCAM
 * Este script cria câmeras funcionais para testar o sistema de streaming
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: join(__dirname, '../backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Câmeras de exemplo com streams funcionais
const exampleCameras = [
  {
    name: 'Câmera Entrada Principal',
    description: 'Câmera de monitoramento da entrada principal',
    rtsp_url: 'rtsp://demo:demo@ipvmdemo.dyndns.org:5541/onvif-media/media.amp?profile=profile_1_h264',
    location: 'Entrada Principal',
    is_active: true,
    continuous_recording: true,
    recording_quality: 'high',
    motion_detection: true,
    audio_enabled: false,
    night_vision: true,
    pan_tilt_zoom: false,
    resolution: '1920x1080',
    fps: 30,
    bitrate: 2000,
    codec: 'h264'
  },
  {
    name: 'Câmera Estacionamento',
    description: 'Monitoramento da área de estacionamento',
    rtsp_url: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4',
    location: 'Estacionamento',
    is_active: true,
    continuous_recording: true,
    recording_quality: 'medium',
    motion_detection: true,
    audio_enabled: false,
    night_vision: true,
    pan_tilt_zoom: false,
    resolution: '1280x720',
    fps: 25,
    bitrate: 1500,
    codec: 'h264'
  },
  {
    name: 'Câmera Corredor',
    description: 'Monitoramento do corredor interno',
    rtsp_url: 'rtsp://demo:demo@ipvmdemo.dyndns.org:5540/onvif-media/media.amp?profile=profile_1_h264',
    location: 'Corredor Interno',
    is_active: true,
    continuous_recording: true,
    recording_quality: 'medium',
    motion_detection: true,
    audio_enabled: true,
    night_vision: false,
    pan_tilt_zoom: false,
    resolution: '1280x720',
    fps: 25,
    bitrate: 1200,
    codec: 'h264'
  }
];

async function addExampleCameras() {
  console.log('🎥 Adicionando câmeras de exemplo ao sistema NewCAM...');
  
  try {
    // Verificar se já existem câmeras
    const { data: existingCameras, error: checkError } = await supabase
      .from('cameras')
      .select('id, name')
      .limit(1);
    
    if (checkError) {
      console.error('❌ Erro ao verificar câmeras existentes:', checkError.message);
      return;
    }
    
    if (existingCameras && existingCameras.length > 0) {
      console.log('ℹ️  Já existem câmeras cadastradas no sistema. Pulando criação...');
      console.log('📋 Câmeras existentes:');
      
      const { data: allCameras } = await supabase
        .from('cameras')
        .select('id, name, location, is_active');
      
      allCameras?.forEach(camera => {
        console.log(`   - ${camera.name} (${camera.location}) - ${camera.is_active ? 'Ativa' : 'Inativa'}`);
      });
      
      return;
    }
    
    // Adicionar câmeras de exemplo
    console.log('📝 Criando câmeras de exemplo...');
    
    for (const camera of exampleCameras) {
      const { data, error } = await supabase
        .from('cameras')
        .insert([camera])
        .select();
      
      if (error) {
        console.error(`❌ Erro ao criar câmera "${camera.name}":`, error.message);
        continue;
      }
      
      console.log(`✅ Câmera "${camera.name}" criada com sucesso (ID: ${data[0].id})`);
    }
    
    console.log('\n🎉 Câmeras de exemplo adicionadas com sucesso!');
    console.log('\n📊 Resumo:');
    console.log(`   - Total de câmeras criadas: ${exampleCameras.length}`);
    console.log('   - Todas configuradas com gravação contínua ativa');
    console.log('   - Streams RTSP de demonstração configurados');
    
    console.log('\n🔄 Próximos passos:');
    console.log('   1. Verificar se o ZLMediaKit está processando os streams');
    console.log('   2. Testar a visualização no frontend');
    console.log('   3. Verificar se as gravações estão sendo criadas');
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

// Executar o script
addExampleCameras()
  .then(() => {
    console.log('\n✨ Script finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });