import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Camera } from '../src/models/Camera.js';

// Carregar variáveis de ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

async function enableContinuousRecording() {
  console.log('🎬 Ativando gravação contínua nas câmeras online...');
  
  try {
    const result = await Camera.findAll({ limit: 20 });
    const cameras = result.cameras || [];
    
    console.log(`\n📹 Encontradas ${cameras.length} câmeras`);
    
    // Filtrar câmeras online que não estão com gravação contínua
    const camerasToEnable = cameras.filter(camera => 
      camera.status === 'online' && 
      camera.active === true && 
      camera.continuous_recording === false
    );
    
    console.log(`\n🎯 Câmeras para ativar gravação contínua: ${camerasToEnable.length}`);
    
    if (camerasToEnable.length === 0) {
      console.log('✅ Todas as câmeras online já possuem gravação contínua ativada.');
      return;
    }
    
    for (const camera of camerasToEnable) {
      try {
        console.log(`\n🔄 Ativando gravação contínua para: ${camera.name}`);
        
        // Atualizar a câmera para ativar gravação contínua
        const updatedCamera = await Camera.findById(camera.id);
        if (updatedCamera) {
          updatedCamera.continuous_recording = true;
          await updatedCamera.save();
          
          console.log(`✅ Gravação contínua ativada para: ${camera.name}`);
        } else {
          console.log(`❌ Câmera não encontrada: ${camera.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Erro ao ativar gravação para ${camera.name}:`, error.message);
      }
    }
    
    // Verificar resultado final
    console.log('\n📊 Verificando resultado final...');
    const finalResult = await Camera.findAll({ limit: 20 });
    const finalCameras = finalResult.cameras || [];
    
    const onlineCameras = finalCameras.filter(c => c.status === 'online').length;
    const recordingCameras = finalCameras.filter(c => c.continuous_recording === true).length;
    
    console.log(`\n✅ RESULTADO FINAL:`);
    console.log(`   Câmeras online: ${onlineCameras}`);
    console.log(`   Câmeras com gravação contínua: ${recordingCameras}`);
    
  } catch (error) {
    console.error('❌ Erro ao ativar gravação contínua:', error.message);
  }
}

// Executar ativação
enableContinuousRecording().then(() => {
  console.log('\n🏁 Processo concluído');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro:', error);
  process.exit(1);
});