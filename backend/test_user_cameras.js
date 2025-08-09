/**
 * Script para testar o acesso do usuário às câmeras
 * Verifica se as novas câmeras estão sendo incluídas no sistema de permissões
 */

import { config } from 'dotenv';
import { supabaseAdmin } from './src/config/database.js';
import { User } from './src/models/User.js';
import { Camera } from './src/models/Camera.js';
import { createModuleLogger } from './src/config/logger.js';

config();

const logger = createModuleLogger('TestUserCameras');

async function testUserCameras() {
  try {
    console.log('🔍 [Database] Verificando variáveis de ambiente...');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');

    // Buscar um usuário de teste (primeiro usuário ativo)
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('active', true)
      .limit(1);

    if (usersError) {
      throw usersError;
    }

    if (!users || users.length === 0) {
      console.log('❌ Nenhum usuário ativo encontrado');
      return;
    }

    const testUser = users[0];
    console.log(`\n👤 Testando usuário: ${testUser.email} (${testUser.role})`);
    console.log(`   ID: ${testUser.id}`);
    console.log(`   Camera Access: ${JSON.stringify(testUser.camera_access)}`);

    // Buscar todas as câmeras ativas
    const { data: allCameras, error: camerasError } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (camerasError) {
      throw camerasError;
    }

    console.log(`\n📹 Total de câmeras ativas no sistema: ${allCameras.length}`);
    allCameras.forEach((camera, index) => {
      console.log(`   ${index + 1}. ${camera.name} (${camera.id}) - Status: ${camera.status}`);
    });

    // Testar o método Camera.findByUserId
    console.log(`\n🔍 Testando Camera.findByUserId(${testUser.id})...`);
    const userCameras = await Camera.findByUserId(testUser.id);
    
    console.log(`📊 Câmeras acessíveis pelo usuário: ${userCameras.length}`);
    userCameras.forEach((camera, index) => {
      console.log(`   ${index + 1}. ${camera.name} (${camera.id}) - Status: ${camera.status}`);
    });

    // Verificar se há câmeras que não estão no acesso do usuário
    const userCameraIds = userCameras.map(cam => cam.id);
    const missingCameras = allCameras.filter(cam => !userCameraIds.includes(cam.id));
    
    if (missingCameras.length > 0) {
      console.log(`\n⚠️ Câmeras não acessíveis pelo usuário (${missingCameras.length}):`);
      missingCameras.forEach((camera, index) => {
        console.log(`   ${index + 1}. ${camera.name} (${camera.id}) - Status: ${camera.status}`);
        console.log(`      Criada em: ${camera.created_at}`);
      });

      // Se o usuário não é admin, verificar se as câmeras estão no camera_access
      if (testUser.role !== 'admin') {
        console.log(`\n🔧 Usuário não é admin. Verificando campo camera_access...`);
        console.log(`   Camera Access atual: ${JSON.stringify(testUser.camera_access)}`);
        
        const missingFromAccess = missingCameras.filter(cam => 
          !testUser.camera_access || !testUser.camera_access.includes(cam.id)
        );
        
        if (missingFromAccess.length > 0) {
          console.log(`\n❌ Câmeras que precisam ser adicionadas ao camera_access:`);
          missingFromAccess.forEach((camera, index) => {
            console.log(`   ${index + 1}. ${camera.name} (${camera.id})`);
          });
        }
      }
    } else {
      console.log(`\n✅ Usuário tem acesso a todas as câmeras ativas`);
    }

    // Testar busca de gravações
    console.log(`\n🎥 Testando busca de gravações...`);
    const RecordingServiceModule = await import('./src/services/RecordingService.js');
    const RecordingService = RecordingServiceModule.default;
    const recordingsResult = await RecordingService.searchRecordings(testUser.id, { limit: 5 });
    
    console.log(`📊 Gravações encontradas: ${recordingsResult.total}`);
    console.log(`   Dados retornados: ${recordingsResult.data.length}`);
    
    if (recordingsResult.data.length > 0) {
      console.log(`   Câmeras das gravações:`);
      const cameraIds = [...new Set(recordingsResult.data.map(rec => rec.camera_id))];
      cameraIds.forEach(cameraId => {
        const camera = allCameras.find(cam => cam.id === cameraId);
        console.log(`     - ${camera ? camera.name : 'Câmera não encontrada'} (${cameraId})`);
      });
    }

  } catch (error) {
    console.error('❌ Erro ao testar acesso do usuário às câmeras:', error);
  }
}

testUserCameras();