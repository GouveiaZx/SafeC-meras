import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente SUPABASE não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndFixRecordingStatus() {
  console.log('🔍 Verificando status das câmeras e gravações...');
  
  try {
    // 1. Verificar câmeras ativas
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .eq('active', true);
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    console.log(`📹 Encontradas ${cameras.length} câmeras ativas`);
    
    for (const camera of cameras) {
      console.log(`\n📹 Câmera: ${camera.name} (${camera.id})`);
      console.log(`   Status: ${camera.status}`);
      console.log(`   Streaming: ${camera.is_streaming ? 'SIM' : 'NÃO'}`);
      console.log(`   Gravação habilitada: ${camera.recording_enabled ? 'SIM' : 'NÃO'}`);
      
      // Verificar gravações recentes
      const { data: recentRecordings, error: recordingsError } = await supabase
        .from('recordings')
        .select('*')
        .eq('camera_id', camera.id)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // últimas 2 horas
        .order('created_at', { ascending: false });
      
      if (recordingsError) {
        console.error(`   ❌ Erro ao buscar gravações: ${recordingsError.message}`);
      } else {
        console.log(`   📼 Gravações recentes (2h): ${recentRecordings.length}`);
        
        if (recentRecordings.length > 0) {
          const latest = recentRecordings[0];
          const minutesAgo = Math.floor((Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60));
          console.log(`   📼 Última gravação: ${minutesAgo} minutos atrás (${latest.status})`);
        }
      }
      
      // Se a câmera está ativa, streaming e com gravação habilitada, mas sem gravações recentes
      if (camera.is_streaming && camera.recording_enabled && (!recentRecordings || recentRecordings.length === 0)) {
        console.log(`   ⚠️  Câmera deveria estar gravando mas não há gravações recentes`);
        
        // Tentar iniciar gravação via API do ZLMediaKit
        try {
          const startRecordingUrl = `http://localhost:8000/index/api/startRecord?secret=035c73f7-bb6b-4889-a715-d9eb2d1925cc&type=1&vhost=__defaultVhost__&app=live&stream=${camera.id}`;
          
          const response = await fetch(startRecordingUrl);
          const result = await response.json();
          
          if (result.code === 0) {
            console.log(`   ✅ Gravação iniciada com sucesso`);
          } else {
            console.log(`   ❌ Erro ao iniciar gravação: ${result.msg}`);
          }
        } catch (error) {
          console.log(`   ❌ Erro ao tentar iniciar gravação: ${error.message}`);
        }
      }
    }
    
    // 2. Verificar gravações ativas no banco
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*, cameras(name)')
      .eq('status', 'recording');
    
    if (activeError) {
      console.error('❌ Erro ao buscar gravações ativas:', activeError);
    } else {
      console.log(`\n📼 Gravações ativas no banco: ${activeRecordings.length}`);
      
      activeRecordings.forEach(recording => {
        const minutesAgo = Math.floor((Date.now() - new Date(recording.created_at).getTime()) / (1000 * 60));
        console.log(`   📼 ${recording.cameras?.name || recording.camera_id}: ${minutesAgo} minutos`);
      });
    }
    
    console.log('\n✅ Verificação concluída!');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkAndFixRecordingStatus();