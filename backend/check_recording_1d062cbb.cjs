const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSpecificRecording() {
  try {
    console.log('🔍 Verificando gravação específica: 1d062cbb-edcd-4eba-832c-f49595636ad4');
    
    // Buscar a gravação específica
    const { data: recording, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', '1d062cbb-edcd-4eba-832c-f49595636ad4')
      .single();
    
    if (error) {
      console.error('❌ Erro ao buscar gravação:', error.message);
      
      // Se não encontrou, buscar gravações recentes para comparar
      console.log('\n🔍 Buscando 5 gravações mais recentes para comparação:');
      const { data: recentRecordings, error: recentError } = await supabase
        .from('recordings')
        .select('id, camera_id, filename, file_path, local_path, file_size, duration, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (recentError) {
        console.error('❌ Erro ao buscar gravações recentes:', recentError.message);
      } else {
        console.log('📋 Gravações recentes encontradas:');
        recentRecordings.forEach((rec, index) => {
          console.log(`${index + 1}. ID: ${rec.id}`);
          console.log(`   Camera: ${rec.camera_id}`);
          console.log(`   Filename: ${rec.filename}`);
          console.log(`   File Path: ${rec.file_path}`);
          console.log(`   Local Path: ${rec.local_path}`);
          console.log(`   File Size: ${rec.file_size}`);
          console.log(`   Duration: ${rec.duration}`);
          console.log(`   Created: ${rec.created_at}`);
          console.log('   ---');
        });
      }
      return;
    }
    
    console.log('✅ Gravação encontrada!');
    console.log('📋 Dados da gravação:');
    console.log(`   ID: ${recording.id}`);
    console.log(`   Camera ID: ${recording.camera_id}`);
    console.log(`   Filename: ${recording.filename}`);
    console.log(`   File Path: ${recording.file_path}`);
    console.log(`   Local Path: ${recording.local_path}`);
    console.log(`   File Size: ${recording.file_size}`);
    console.log(`   Duration: ${recording.duration}`);
    console.log(`   Status: ${recording.status}`);
    console.log(`   Created: ${recording.created_at}`);
    
    // Verificar se o arquivo físico existe
    if (recording.local_path) {
      const fs = require('fs');
      const path = require('path');
      
      console.log('\n🔍 Verificando arquivo físico...');
      const fullPath = path.resolve(recording.local_path);
      console.log(`   Caminho completo: ${fullPath}`);
      
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`✅ Arquivo existe! Tamanho: ${stats.size} bytes`);
      } else {
        console.log('❌ Arquivo físico não encontrado!');
      }
    } else {
      console.log('⚠️  Local path não definido!');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
}

checkSpecificRecording();