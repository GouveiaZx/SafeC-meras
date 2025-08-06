import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Camera } from '../src/models/Camera.js';

// Carregar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

async function checkCameraStatus() {
  console.log('🔍 Verificando status das câmeras...');
  
  try {
    const result = await Camera.findAll({ limit: 20 });
    const cameras = result.cameras || [];
    
    console.log('\n=== STATUS DAS CÂMERAS ===');
    console.log(`Total de câmeras: ${cameras.length}\n`);
    
    cameras.forEach((camera, index) => {
      console.log(`📹 ${index + 1}. ${camera.name} (${camera.id})`);
      console.log(`   Status: ${camera.status}`);
      console.log(`   Ativa: ${camera.active}`);
      console.log(`   Gravação Contínua: ${camera.continuous_recording}`);
      console.log(`   IP: ${camera.ip_address}:${camera.port}`);
      console.log(`   Última atualização: ${camera.updated_at}`);
      console.log('');
    });
    
    // Estatísticas
    const onlineCameras = cameras.filter(c => c.status === 'online').length;
    const activeCameras = cameras.filter(c => c.active === true).length;
    const recordingCameras = cameras.filter(c => c.continuous_recording === true).length;
    
    console.log('📊 ESTATÍSTICAS:');
    console.log(`   Online: ${onlineCameras}/${cameras.length}`);
    console.log(`   Ativas: ${activeCameras}/${cameras.length}`);
    console.log(`   Com gravação contínua: ${recordingCameras}/${cameras.length}`);
    
  } catch (error) {
    console.error('❌ Erro ao verificar câmeras:', error.message);
  }
}

// Executar verificação
checkCameraStatus().then(() => {
  console.log('\n✅ Verificação concluída');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro:', error);
  process.exit(1);
});