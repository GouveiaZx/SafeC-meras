import { supabaseAdmin } from './src/config/database.js';
import { createModuleLogger } from './src/config/logger.js';

const logger = createModuleLogger('CheckCameras');

async function checkCameras() {
  try {
    console.log('🔍 Verificando câmeras no banco de dados...');
    
    // Buscar todas as câmeras
    const { data: cameras, error, count } = await supabaseAdmin
      .from('cameras')
      .select('*', { count: 'exact' });
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`📊 Total de câmeras no banco: ${count}`);
    
    if (cameras && cameras.length > 0) {
      console.log('\n📋 Lista de câmeras:');
      cameras.forEach((camera, index) => {
        console.log(`${index + 1}. ID: ${camera.id}`);
        console.log(`   Nome: ${camera.name}`);
        console.log(`   Status: ${camera.status}`);
        console.log(`   Ativo: ${camera.active}`);
        console.log(`   IP: ${camera.ip_address}`);
        console.log(`   RTSP URL: ${camera.rtsp_url}`);
        console.log(`   Criado em: ${camera.created_at}`);
        console.log('   ---');
      });
    } else {
      console.log('❌ Nenhuma câmera encontrada no banco de dados!');
    }
    
    // Verificar também se há câmeras inativas
    const { data: inactiveCameras, error: inactiveError } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('active', false);
    
    if (!inactiveError && inactiveCameras) {
      console.log(`\n🔴 Câmeras inativas: ${inactiveCameras.length}`);
    }
    
    // Verificar câmeras por status
    const { data: onlineCameras, error: onlineError } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('status', 'online');
    
    if (!onlineError && onlineCameras) {
      console.log(`🟢 Câmeras online: ${onlineCameras.length}`);
    }
    
    const { data: offlineCameras, error: offlineError } = await supabaseAdmin
      .from('cameras')
      .select('*')
      .eq('status', 'offline');
    
    if (!offlineError && offlineCameras) {
      console.log(`🔴 Câmeras offline: ${offlineCameras.length}`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar câmeras:', error);
  }
}

checkCameras().then(() => {
  console.log('\n✅ Verificação concluída');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro na verificação:', error);
  process.exit(1);
});