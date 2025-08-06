import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSystemMetrics() {
  console.log('🔍 Verificando métricas do sistema...');
  
  try {
    // 1. Verificar uploads pendentes
    console.log('\n📤 Verificando uploads pendentes...');
    const { data: uploads, error: uploadsError } = await supabase
      .from('uploads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (uploadsError && uploadsError.code !== 'PGRST116') {
      console.error('❌ Erro ao buscar uploads:', uploadsError.message);
    } else if (uploadsError && uploadsError.code === 'PGRST116') {
      console.log('⚠️  Tabela uploads não existe');
    } else {
      console.log(`📊 Total de uploads encontrados: ${uploads.length}`);
      if (uploads.length === 0) {
        console.log('⚠️  Nenhum upload encontrado - dados zerados');
      }
    }
    
    // 2. Verificar histórico de métricas
    console.log('\n📈 Verificando histórico de métricas...');
    const { data: metrics, error: metricsError } = await supabase
      .from('metrics_history')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(5);
    
    if (metricsError) {
      console.error('❌ Erro ao buscar métricas:', metricsError.message);
    } else {
      console.log(`📊 Registros de métricas: ${metrics.length}`);
      if (metrics.length > 0) {
        const latest = metrics[0];
        console.log(`📊 Última métrica:`);
        console.log(`   Câmeras total: ${latest.total_cameras || 0}`);
        console.log(`   Câmeras online: ${latest.online_cameras || 0}`);
        console.log(`   Câmeras gravando: ${latest.recording_cameras || 0}`);
        console.log(`   CPU: ${latest.cpu_usage || 0}%`);
        console.log(`   Memória: ${latest.memory_usage || 0}%`);
        console.log(`   Disco: ${latest.disk_usage || 0}%`);
      } else {
        console.log('⚠️  Nenhuma métrica encontrada - dados zerados');
      }
    }
    
    // 3. Verificar estatísticas de gravações
    console.log('\n🎥 Verificando estatísticas de gravações...');
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (recordingsError) {
      console.error('❌ Erro ao buscar gravações:', recordingsError.message);
    } else {
      console.log(`📊 Total de gravações: ${recordings.length}`);
      if (recordings.length === 0) {
        console.log('⚠️  Nenhuma gravação encontrada - dados zerados');
      } else {
        const totalSize = recordings.reduce((sum, rec) => sum + (rec.file_size || 0), 0);
        const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
        console.log(`📊 Espaço usado: ${totalSizeGB} GB`);
      }
    }
    
    // 4. Verificar câmeras
    console.log('\n📹 Verificando status das câmeras...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*');
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError.message);
    } else {
      const online = cameras.filter(c => c.status === 'online').length;
      const offline = cameras.filter(c => c.status === 'offline').length;
      const error = cameras.filter(c => c.status === 'error').length;
      
      console.log(`📊 Câmeras: ${cameras.length} total`);
      console.log(`   🟢 Online: ${online}`);
      console.log(`   🔴 Offline: ${offline}`);
      console.log(`   ⚠️  Com erro: ${error}`);
      
      if (online === 0 && cameras.length > 0) {
        console.log('⚠️  Nenhuma câmera online - possível problema');
      }
    }
    
    console.log('\n✅ Verificação de métricas concluída!');
    
  } catch (error) {
    console.error('❌ Erro durante verificação:', error.message);
  }
}

// Executar verificação
checkSystemMetrics();