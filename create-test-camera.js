/**
 * Script para criar uma câmera de teste no banco de dados
 */

import { supabaseAdmin } from './backend/src/config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: join(__dirname, 'backend/.env') });

async function createTestCamera() {
  try {
    console.log('🎥 Criando câmera de teste...');
    
    const testCamera = {
      name: 'Cam Rtm',
      description: 'Câmera de teste para reproduzir erro HTTP 500',
      ip_address: '192.168.1.100',
      port: 554,
      username: 'admin',
      password: 'admin123',
      rtsp_url: 'rtsp://admin:admin123@192.168.1.100:554/stream1',
      location: 'Teste',
      zone: 'Zona Teste',
      manufacturer: 'Teste',
      model: 'Teste Model',
      resolution: '1920x1080',
      fps: 25,
      quality: 'medium',
      codec: 'h264',
      audio_enabled: false,
      recording_enabled: true,
      motion_detection: false,
      night_vision: false,
      ptz_enabled: false,
      status: 'online',
      stream_type: 'rtsp',
      continuous_recording: false,
      retention_days: 30,
      is_streaming: false,
      is_recording: false,
      active: true,
      settings: {},
      metadata: {}
    };
    
    const { data, error } = await supabaseAdmin
      .from('cameras')
      .insert([testCamera])
      .select();
    
    if (error) {
      console.error('❌ Erro ao criar câmera:', error);
      return;
    }
    
    console.log('✅ Câmera de teste criada com sucesso:');
    console.log('ID:', data[0].id);
    console.log('Nome:', data[0].name);
    console.log('IP:', data[0].ip_address);
    console.log('RTSP URL:', data[0].rtsp_url);
    
    return data[0];
  } catch (error) {
    console.error('❌ Erro durante criação da câmera:', {
      message: error.message,
      stack: error.stack
    });
  } finally {
    console.log('🏁 Script finalizado');
    process.exit(0);
  }
}

// Executar criação
createTestCamera();