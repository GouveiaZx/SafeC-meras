import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFullRecordingCycle() {
  console.log('🔄 Iniciando teste do ciclo completo de gravação...');
  
  try {
    // 1. Verificar câmeras online
    console.log('\n📹 1. Verificando câmeras online...');
    
    // Primeiro, verificar todas as câmeras
    const { data: allCameras, error: allCamerasError } = await supabase
      .from('cameras')
      .select('*');
    
    if (allCamerasError) {
      console.error('❌ Erro ao buscar todas as câmeras:', allCamerasError);
      return;
    }
    
    console.log(`📊 Total de câmeras: ${allCameras.length}`);
    allCameras.forEach(camera => {
      console.log(`   ${camera.status === 'online' ? '🟢' : camera.status === 'offline' ? '🔴' : '⚠️'} ${camera.name} (${camera.status})`);
    });
    
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .eq('status', 'online');
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
      return;
    }
    
    console.log(`📊 Câmeras online: ${cameras.length}`);
    if (cameras.length === 0) {
      console.log('⚠️ Nenhuma câmera online encontrada');
      return;
    }
    
    // 2. Verificar gravações ativas
    console.log('\n🔴 2. Verificando gravações ativas...');
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (activeError) {
      console.error('❌ Erro ao buscar gravações ativas:', activeError);
      return;
    }
    
    console.log(`📊 Gravações ativas: ${activeRecordings.length}`);
    
    // 3. Verificar gravações recentes (últimas 2 horas)
    console.log('\n📅 3. Verificando gravações recentes (últimas 2 horas)...');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: recentRecordings, error: recentError } = await supabase
      .from('recordings')
      .select('*')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false });
    
    if (recentError) {
      console.error('❌ Erro ao buscar gravações recentes:', recentError);
      return;
    }
    
    console.log(`📊 Gravações nas últimas 2 horas: ${recentRecordings.length}`);
    
    // Estatísticas por status
    const statusCounts = recentRecordings.reduce((acc, rec) => {
      acc[rec.status] = (acc[rec.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 Status das gravações recentes:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      const emoji = {
        'completed': '✅',
        'recording': '🔴',
        'failed': '❌',
        'processing': '🔄',
        'uploaded': '☁️'
      }[status] || '❓';
      console.log(`   ${emoji} ${status}: ${count}`);
    });
    
    // 4. Testar criação de nova gravação
    console.log('\n🧪 4. Testando criação de nova gravação...');
    const testCamera = cameras[0];
    
    const newRecording = {
      camera_id: testCamera.id,
      filename: `test-recording-${Date.now()}.mp4`,
      status: 'recording',
      started_at: new Date().toISOString(),
      duration: 0,
      file_size: 0,
      quality: 'high'
    };
    
    const { data: createdRecording, error: createError } = await supabase
      .from('recordings')
      .insert([newRecording])
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Erro ao criar gravação de teste:', createError.message);
    } else {
      console.log('✅ Gravação de teste criada com sucesso!');
      console.log(`   ID: ${createdRecording.id}`);
      console.log(`   Arquivo: ${createdRecording.filename}`);
      console.log(`   Câmera: ${testCamera.name}`);
      
      // 5. Simular finalização da gravação
      console.log('\n⏹️ 5. Simulando finalização da gravação...');
      
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          duration: 30, // 30 segundos simulados
          file_size: 1024 * 1024 // 1MB simulado
        })
        .eq('id', createdRecording.id);
      
      if (updateError) {
        console.error('❌ Erro ao finalizar gravação:', updateError.message);
      } else {
        console.log('✅ Gravação finalizada com sucesso!');
      }
    }
    
    // 6. Verificar integridade dos dados
    console.log('\n🔍 6. Verificando integridade dos dados...');
    
    const { data: allRecordings, error: allError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (allError) {
      console.error('❌ Erro ao verificar integridade:', allError);
    } else {
      console.log(`📊 Total de gravações (últimas 10): ${allRecordings.length}`);
      
      // Verificar se há gravações sem filename
      const withoutFilename = allRecordings.filter(r => !r.filename);
      if (withoutFilename.length > 0) {
        console.log(`⚠️ Gravações sem filename: ${withoutFilename.length}`);
      } else {
        console.log('✅ Todas as gravações têm filename válido');
      }
      
      // Verificar se há gravações órfãs (sem câmera)
      const cameraIds = cameras.map(c => c.id);
      const orphanRecordings = allRecordings.filter(r => !cameraIds.includes(r.camera_id));
      if (orphanRecordings.length > 0) {
        console.log(`⚠️ Gravações órfãs (sem câmera): ${orphanRecordings.length}`);
      } else {
        console.log('✅ Todas as gravações têm câmera válida');
      }
    }
    
    console.log('\n✅ Teste do ciclo completo de gravação concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

// Executar o teste
testFullRecordingCycle();