import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRecordingSystem() {
  console.log('🎥 Testando sistema de gravação...');
  
  try {
    // 1. Verificar câmeras online
    console.log('\n📹 Verificando câmeras online...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .eq('status', 'online');
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError.message);
      return;
    }
    
    console.log(`📊 Câmeras online: ${cameras.length}`);
    
    if (cameras.length === 0) {
      console.log('⚠️  Nenhuma câmera online para testar gravação');
      return;
    }
    
    // 2. Verificar gravações ativas
    console.log('\n🔴 Verificando gravações ativas...');
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording')
      .order('start_time', { ascending: false });
    
    if (activeError) {
      console.error('❌ Erro ao buscar gravações ativas:', activeError.message);
    } else {
      console.log(`📊 Gravações ativas: ${activeRecordings.length}`);
      
      if (activeRecordings.length > 0) {
        console.log('\n📋 Gravações em andamento:');
        activeRecordings.forEach((recording, index) => {
          console.log(`${index + 1}. Câmera: ${recording.camera_id}`);
          console.log(`   Iniciada em: ${recording.start_time}`);
          console.log(`   Duração: ${recording.duration || 0}s`);
          console.log('');
        });
      } else {
        console.log('⚠️  Nenhuma gravação ativa encontrada');
      }
    }
    
    // 3. Verificar gravações recentes (últimas 24h)
    console.log('\n📅 Verificando gravações recentes (últimas 24h)...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: recentRecordings, error: recentError } = await supabase
      .from('recordings')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false });
    
    if (recentError) {
      console.error('❌ Erro ao buscar gravações recentes:', recentError.message);
    } else {
      console.log(`📊 Gravações nas últimas 24h: ${recentRecordings.length}`);
      
      if (recentRecordings.length > 0) {
        const completed = recentRecordings.filter(r => r.status === 'completed').length;
        const failed = recentRecordings.filter(r => r.status === 'failed').length;
        const processing = recentRecordings.filter(r => r.status === 'processing').length;
        
        console.log(`   ✅ Concluídas: ${completed}`);
        console.log(`   ❌ Falharam: ${failed}`);
        console.log(`   🔄 Processando: ${processing}`);
        
        // Mostrar as 3 mais recentes
        console.log('\n📋 Últimas 3 gravações:');
        recentRecordings.slice(0, 3).forEach((recording, index) => {
          console.log(`${index + 1}. ID: ${recording.id}`);
          console.log(`   Status: ${recording.status}`);
          console.log(`   Câmera: ${recording.camera_id}`);
          console.log(`   Criada em: ${recording.created_at}`);
          console.log(`   Arquivo: ${recording.file_path || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('⚠️  Nenhuma gravação recente - sistema pode estar inativo');
      }
    }
    
    // 4. Simular início de gravação para teste
    console.log('\n🧪 Simulando início de gravação de teste...');
    const testCamera = cameras[0]; // Usar primeira câmera online
    
    const testRecording = {
      camera_id: testCamera.id,
      status: 'recording',
      start_time: new Date().toISOString(),
      file_path: `recordings/test_${Date.now()}.mp4`,
      duration: 0,
      file_size: 0,
      quality: 'HD',
      codec: 'h264',
      resolution: '1920x1080',
      fps: 30,
      bitrate: 2000
    };
    
    const { data: newRecording, error: insertError } = await supabase
      .from('recordings')
      .insert([testRecording])
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Erro ao criar gravação de teste:', insertError.message);
    } else {
      console.log(`✅ Gravação de teste criada com sucesso!`);
      console.log(`   ID: ${newRecording.id}`);
      console.log(`   Câmera: ${testCamera.name}`);
      console.log(`   Arquivo: ${newRecording.file_path}`);
      
      // Simular finalização da gravação após 2 segundos
      console.log('\n⏱️  Simulando finalização da gravação...');
      
      setTimeout(async () => {
        const { error: updateError } = await supabase
          .from('recordings')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            duration: 2,
            file_size: 1024 * 1024 // 1MB simulado
          })
          .eq('id', newRecording.id);
        
        if (updateError) {
          console.error('❌ Erro ao finalizar gravação de teste:', updateError.message);
        } else {
          console.log('✅ Gravação de teste finalizada com sucesso!');
        }
      }, 2000);
    }
    
    console.log('\n✅ Teste do sistema de gravação concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante teste:', error.message);
  }
}

// Executar teste
testRecordingSystem();