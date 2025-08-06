/**
 * Script para testar gravações ativas
 */

import { createModuleLogger } from '../src/config/logger.js';
import RecordingService from '../src/services/RecordingService.js';
import { Camera } from '../src/models/Camera.js';

const logger = createModuleLogger('TestActiveRecordings');

async function testActiveRecordings() {
  try {
    console.log('🔍 Testando gravações ativas...');
    
    // Buscar gravações ativas
    const result = await RecordingService.getActiveRecordings(null);
    const activeRecordings = result?.data || result || [];
    
    console.log('\n=== GRAVAÇÕES ATIVAS ===');
    console.log(`Total de gravações ativas: ${activeRecordings.length}\n`);
    
    if (activeRecordings.length > 0) {
      activeRecordings.forEach((recording, index) => {
        console.log(`📹 ${index + 1}. ${recording.filename || 'Sem nome'}`);
        console.log(`   Câmera: ${recording.cameraName || recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Duração: ${recording.duration || 0}s`);
        console.log(`   Iniciado em: ${recording.start_time || recording.created_at}`);
        console.log('');
      });
    } else {
      console.log('❌ Nenhuma gravação ativa encontrada');
    }
    
    // Verificar câmeras online
    const cameras = await Camera.findOnline();
    console.log(`\n📊 ESTATÍSTICAS:`);
    console.log(`   Câmeras online: ${cameras.length}`);
    console.log(`   Gravações ativas: ${activeRecordings.length}`);
    
    console.log('\n✅ Teste concluído');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
    process.exit(1);
  }
}

testActiveRecordings();