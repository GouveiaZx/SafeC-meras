const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSpecificRecording() {
  console.log('🚀 Verificando gravação específica...');
  
  try {
    const recordingId = '299514de-63c6-4a80-8924-c9ad328e611e';
    
    console.log(`🔍 Buscando gravação ${recordingId}...`);
    
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();
    
    if (error) {
      console.error('❌ Erro ao buscar gravação:', error);
      return;
    }
    
    if (!data) {
      console.log('❌ Gravação não encontrada!');
      return;
    }
    
    console.log('📋 Dados da gravação:');
    console.log('   ID:', data.id);
    console.log('   Camera ID:', data.camera_id);
    console.log('   Filename:', data.filename);
    console.log('   File Path:', data.file_path);
    console.log('   Local Path:', data.local_path);
    console.log('   File Size:', data.file_size);
    console.log('   Duration:', data.duration);
    console.log('   Status:', data.status);
    console.log('   Created At:', data.created_at);
    
    // Verificar se o arquivo existe fisicamente
    if (data.local_path) {
      const fs = require('fs');
      const path = require('path');
      
      console.log('\n🔍 Verificando arquivo físico...');
      console.log('   Caminho:', data.local_path);
      
      if (fs.existsSync(data.local_path)) {
        const stats = fs.statSync(data.local_path);
        console.log('✅ Arquivo encontrado!');
        console.log('   Tamanho:', stats.size, 'bytes');
        console.log('   Modificado em:', stats.mtime);
      } else {
        console.log('❌ Arquivo NÃO encontrado no caminho especificado!');
        
        // Tentar encontrar o arquivo em outros locais
        const possiblePaths = [
          path.join(__dirname, 'storage', 'www', 'record', 'live', data.camera_id, '2025-08-09', `${data.filename}.mp4`),
          path.join(__dirname, 'storage', 'recordings', `${data.filename}.mp4`),
          path.join(__dirname, 'storage', 'www', 'recordings', `${data.filename}.mp4`)
        ];
        
        console.log('\n🔍 Procurando arquivo em outros locais...');
        for (const possiblePath of possiblePaths) {
          console.log(`   Verificando: ${possiblePath}`);
          if (fs.existsSync(possiblePath)) {
            const stats = fs.statSync(possiblePath);
            console.log(`✅ Arquivo encontrado em: ${possiblePath}`);
            console.log(`   Tamanho: ${stats.size} bytes`);
            break;
          }
        }
      }
    } else {
      console.log('❌ local_path é null - arquivo não foi processado corretamente!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
  
  console.log('\n✅ Verificação concluída');
}

checkSpecificRecording();