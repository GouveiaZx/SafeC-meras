import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupDuplicateRecordings() {
  console.log('=== LIMPEZA DE GRAVAÇÕES DUPLICADAS ===\n');
  
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
    
    console.log(`Total de gravações ativas encontradas: ${activeRecordings.length}`);
    
    if (activeRecordings.length === 0) {
      console.log('Nenhuma gravação ativa encontrada.');
      return;
    }
    
    // 2. Agrupar por camera_id
    const cameraGroups = {};
    activeRecordings.forEach(recording => {
      if (!cameraGroups[recording.camera_id]) {
        cameraGroups[recording.camera_id] = [];
      }
      cameraGroups[recording.camera_id].push(recording);
    });
    
    // 3. Para cada câmera, manter apenas a gravação mais recente
    for (const [cameraId, recordings] of Object.entries(cameraGroups)) {
      console.log(`\nProcessando câmera ${cameraId}: ${recordings.length} gravações`);
      
      if (recordings.length > 1) {
        // Ordenar por data de criação (mais recente primeiro)
        recordings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        const keepRecording = recordings[0];
        const duplicateRecordings = recordings.slice(1);
        
        console.log(`  ✅ Mantendo gravação: ${keepRecording.id} (${keepRecording.created_at})`);
        console.log(`  🗑️ Removendo ${duplicateRecordings.length} duplicatas:`);
        
        // Parar gravação no ZLMediaKit primeiro
        try {
          const stopParams = {
            type: 0,
            vhost: '__defaultVhost__',
            app: 'live',
            stream: cameraId,
            secret: process.env.ZLMEDIAKIT_SECRET
          };
          
          console.log(`  ⏹️ Parando gravação no ZLMediaKit para câmera ${cameraId}...`);
          const zlmResponse = await axios.get(
            `${process.env.ZLMEDIAKIT_API_URL}/index/api/stopRecord`,
            { params: stopParams, timeout: 5000 }
          );
          
          console.log(`  📡 Resposta ZLMediaKit: ${zlmResponse.data.msg}`);
        } catch (zlmError) {
          console.warn(`  ⚠️ Erro ao parar gravação no ZLMediaKit: ${zlmError.message}`);
        }
        
        // Remover duplicatas do banco
        for (const duplicate of duplicateRecordings) {
          console.log(`    - Removendo: ${duplicate.id} (${duplicate.created_at})`);
          
          const { error: deleteError } = await supabase
            .from('recordings')
            .delete()
            .eq('id', duplicate.id);
          
          if (deleteError) {
            console.error(`    ❌ Erro ao remover ${duplicate.id}:`, deleteError);
          } else {
            console.log(`    ✅ Removido com sucesso: ${duplicate.id}`);
          }
        }
        
        // Reiniciar gravação para a câmera
        try {
          console.log(`  🎬 Reiniciando gravação para câmera ${cameraId}...`);
          
          const recordParams = {
            type: 0,
            vhost: '__defaultVhost__',
            app: 'live',
            stream: cameraId,
            customized_path: `recordings/${cameraId}`,
            max_second: 1800,
            secret: process.env.ZLMEDIAKIT_SECRET
          };
          
          const startResponse = await axios.get(
            `${process.env.ZLMEDIAKIT_API_URL}/index/api/startRecord`,
            { params: recordParams, timeout: 10000 }
          );
          
          if (startResponse.data.code === 0) {
            console.log(`  ✅ Gravação reiniciada com sucesso para câmera ${cameraId}`);
            
            // Atualizar o registro mantido com novo timestamp
            const { error: updateError } = await supabase
              .from('recordings')
              .update({
                updated_at: new Date().toISOString(),
                metadata: {
                  ...keepRecording.metadata,
                  cleaned_duplicates: true,
                  restart_timestamp: new Date().toISOString()
                }
              })
              .eq('id', keepRecording.id);
            
            if (updateError) {
              console.warn(`  ⚠️ Erro ao atualizar registro: ${updateError.message}`);
            }
          } else {
            console.error(`  ❌ Erro ao reiniciar gravação: ${startResponse.data.msg}`);
          }
        } catch (restartError) {
          console.error(`  ❌ Erro ao reiniciar gravação: ${restartError.message}`);
        }
      } else {
        console.log(`  ✅ Câmera ${cameraId}: apenas 1 gravação, nenhuma duplicata`);
      }
    }
    
    console.log('\n=== LIMPEZA CONCLUÍDA ===');
    
    // Verificar resultado final
    const { data: finalRecordings, error: finalError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (!finalError) {
      console.log(`\nGravações ativas restantes: ${finalRecordings.length}`);
      finalRecordings.forEach(rec => {
        console.log(`  - ${rec.camera_id}: ${rec.id} (${rec.created_at})`);
      });
    }
    
  } catch (error) {
    console.error('Erro durante limpeza:', error);
  }
}

cleanupDuplicateRecordings();