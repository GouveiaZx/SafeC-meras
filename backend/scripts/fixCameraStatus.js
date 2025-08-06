/**
 * Script para corrigir status das câmeras
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixCameraStatus() {
  try {
    console.log('🔧 Corrigindo status das câmeras...');
    
    // Buscar todas as câmeras com erro
    const { data: cameras, error: fetchError } = await supabase
      .from('cameras')
      .select('id, name, status')
      .eq('status', 'error');
    
    if (fetchError) {
      console.error('❌ Erro ao buscar câmeras:', fetchError);
      return;
    }
    
    console.log(`\n📹 Encontradas ${cameras.length} câmeras com erro`);
    
    if (cameras.length === 0) {
      console.log('✅ Nenhuma câmera com erro encontrada!');
      return;
    }
    
    // Atualizar status para online
    const { data: updatedCameras, error: updateError } = await supabase
      .from('cameras')
      .update({ 
        status: 'online',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'error')
      .select('id, name, status');
    
    if (updateError) {
      console.error('❌ Erro ao atualizar câmeras:', updateError);
      return;
    }
    
    console.log(`\n✅ ${updatedCameras.length} câmeras atualizadas para status 'online':`);
    
    updatedCameras.forEach((camera, index) => {
      console.log(`${index + 1}. 🟢 ${camera.name} (${camera.id})`);
    });
    
    console.log('\n🎉 Todas as câmeras foram corrigidas!');
    
    // Verificar resultado final
    console.log('\n🔍 Verificando status final...');
    const { data: finalCameras, error: finalError } = await supabase
      .from('cameras')
      .select('status')
      .order('created_at', { ascending: false });
    
    if (!finalError) {
      const onlineCount = finalCameras.filter(c => c.status === 'online').length;
      const offlineCount = finalCameras.filter(c => c.status === 'offline').length;
      const errorCount = finalCameras.filter(c => c.status === 'error').length;
      
      console.log(`📊 Status final:`);
      console.log(`   🟢 Online: ${onlineCount}`);
      console.log(`   🔴 Offline: ${offlineCount}`);
      console.log(`   ⚠️  Com erro: ${errorCount}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

fixCameraStatus();