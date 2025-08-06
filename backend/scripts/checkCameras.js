/**
 * Script para verificar status das câmeras
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

async function checkCameras() {
  try {
    console.log('🔍 Verificando câmeras no banco de dados...');
    
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('id, name, status, rtsp_url, location, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log(`\n📹 Encontradas ${cameras.length} câmeras:`);
    
    cameras.forEach((camera, index) => {
      const statusIcon = camera.status === 'online' ? '🟢' : 
                        camera.status === 'offline' ? '🔴' : 
                        camera.status === 'error' ? '⚠️' : '⚪';
      
      console.log(`\n${index + 1}. ${statusIcon} ${camera.name}`);
      console.log(`   ID: ${camera.id}`);
      console.log(`   Status: ${camera.status}`);
      console.log(`   RTSP URL: ${camera.rtsp_url}`);
      console.log(`   Localização: ${camera.location || 'Não definida'}`);
      console.log(`   Criada em: ${camera.created_at}`);
    });
    
    // Estatísticas
    const onlineCount = cameras.filter(c => c.status === 'online').length;
    const offlineCount = cameras.filter(c => c.status === 'offline').length;
    const errorCount = cameras.filter(c => c.status === 'error').length;
    
    console.log(`\n📊 Estatísticas:`);
    console.log(`   🟢 Online: ${onlineCount}`);
    console.log(`   🔴 Offline: ${offlineCount}`);
    console.log(`   ⚠️  Com erro: ${errorCount}`);
    
    if (offlineCount > 0 || errorCount > 0) {
      console.log(`\n⚠️  ${offlineCount + errorCount} câmeras precisam de atenção!`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

checkCameras();