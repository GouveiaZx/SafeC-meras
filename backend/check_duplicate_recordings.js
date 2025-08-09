import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkDuplicateRecordings() {
  console.log('=== VERIFICAÇÃO DE DUPLICAÇÃO DE GRAVAÇÕES ===\n');
  
  try {
    // 1. Buscar todas as gravações ativas
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording')
      .order('created_at', { ascending: false });
    
    if (activeError) {
      console.error('Erro ao buscar gravações ativas:', activeError);
      return;
    }
    
    console.log(`Total de gravações com status 'recording': ${activeRecordings.length}`);
    
    if (activeRecordings.length > 0) {
      console.log('\nDetalhes das gravações ativas:');
      activeRecordings.forEach((rec, i) => {
        console.log(`${i+1}. ID: ${rec.id}`);
        console.log(`   Camera ID: ${rec.camera_id}`);
        console.log(`   Filename: ${rec.filename}`);
        console.log(`   Created: ${rec.created_at}`);
        console.log(`   Start Time: ${rec.start_time}`);
        console.log(`   Status: ${rec.status}`);
        console.log('---');
      });
      
      // 2. Verificar duplicações por camera_id
      const cameraGroups = {};
      activeRecordings.forEach(rec => {
        if (!cameraGroups[rec.camera_id]) {
          cameraGroups[rec.camera_id] = [];
        }
        cameraGroups[rec.camera_id].push(rec);
      });
      
      console.log('\nAgrupamento por câmera:');
      Object.entries(cameraGroups).forEach(([cameraId, recordings]) => {
        console.log(`Câmera ${cameraId}: ${recordings.length} gravações ativas`);
        if (recordings.length > 1) {
          console.log('  ⚠️ DUPLICAÇÃO DETECTADA!');
          recordings.forEach((rec, i) => {
            console.log(`    ${i+1}. ${rec.id} - ${rec.created_at}`);
          });
        }
      });
    }
    
    // 3. Buscar todas as câmeras
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*');
    
    if (camerasError) {
      console.error('Erro ao buscar câmeras:', camerasError);
    } else {
      console.log(`\nTotal de câmeras: ${cameras.length}`);
      cameras.forEach((cam, i) => {
        console.log(`${i+1}. ${cam.name} (${cam.id})`);
      });
    }
    
  } catch (error) {
    console.error('Erro geral:', error);
  }
}

checkDuplicateRecordings();