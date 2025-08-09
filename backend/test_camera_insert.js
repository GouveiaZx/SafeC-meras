import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCameraInsert() {
  try {
    console.log('🧪 Testando inserção de câmera para identificar constraints...');
    
    // Primeiro, vamos ver uma câmera existente como exemplo
    const { data: existingCameras, error: existingError } = await supabase
      .from('cameras')
      .select('*')
      .limit(1);
    
    if (existingError) {
      console.error('❌ Erro ao buscar câmeras existentes:', existingError);
      return;
    }
    
    if (existingCameras.length > 0) {
      console.log('📹 Exemplo de câmera existente:');
      const example = existingCameras[0];
      console.log('   ID:', example.id);
      console.log('   Nome:', example.name);
      console.log('   IP:', example.ip_address);
      console.log('   RTSP URL:', example.rtsp_url);
      console.log('   Status:', example.status);
      console.log('   Stream Type:', example.stream_type);
    }
    
    // Tentar inserir uma câmera com dados mínimos
    console.log('\n🔧 Tentativa 1: Dados mínimos...');
    const testCamera1 = {
      id: '5467d328-1426-4444-8ed9-6ea3e156f76f',
      name: 'Câmera Antiga 5467d328',
      status: 'offline'
    };
    
    const { error: error1 } = await supabase
      .from('cameras')
      .insert(testCamera1);
    
    if (error1) {
      console.log('   ❌ Falhou:', error1.message);
      
      // Tentar com mais campos
      console.log('\n🔧 Tentativa 2: Com IP e porta...');
      const testCamera2 = {
        id: '5467d328-1426-4444-8ed9-6ea3e156f76f',
        name: 'Câmera Antiga 5467d328',
        ip_address: '192.168.1.100',
        port: 554,
        status: 'offline'
      };
      
      const { error: error2 } = await supabase
        .from('cameras')
        .insert(testCamera2);
      
      if (error2) {
        console.log('   ❌ Falhou:', error2.message);
        
        // Tentar com RTSP URL
        console.log('\n🔧 Tentativa 3: Com RTSP URL...');
        const testCamera3 = {
          id: '5467d328-1426-4444-8ed9-6ea3e156f76f',
          name: 'Câmera Antiga 5467d328',
          ip_address: '192.168.1.100',
          port: 554,
          rtsp_url: 'rtsp://192.168.1.100:554/stream',
          status: 'offline'
        };
        
        const { error: error3 } = await supabase
          .from('cameras')
          .insert(testCamera3);
        
        if (error3) {
          console.log('   ❌ Falhou:', error3.message);
          
          // Tentar com todos os campos de conexão
          console.log('\n🔧 Tentativa 4: Com todos os campos de conexão...');
          const testCamera4 = {
            id: '5467d328-1426-4444-8ed9-6ea3e156f76f',
            name: 'Câmera Antiga 5467d328',
            ip_address: '192.168.1.100',
            port: 554,
            username: 'admin',
            password: 'password',
            rtsp_url: 'rtsp://admin:password@192.168.1.100:554/stream',
            status: 'offline',
            stream_type: 'rtsp'
          };
          
          const { error: error4 } = await supabase
            .from('cameras')
            .insert(testCamera4);
          
          if (error4) {
            console.log('   ❌ Falhou:', error4.message);
          } else {
            console.log('   ✅ Sucesso! Câmera inserida.');
            
            // Remover a câmera de teste
            await supabase
              .from('cameras')
              .delete()
              .eq('id', '5467d328-1426-4444-8ed9-6ea3e156f76f');
            console.log('   🗑️  Câmera de teste removida.');
          }
        } else {
          console.log('   ✅ Sucesso! Câmera inserida.');
          
          // Remover a câmera de teste
          await supabase
            .from('cameras')
            .delete()
            .eq('id', '5467d328-1426-4444-8ed9-6ea3e156f76f');
          console.log('   🗑️  Câmera de teste removida.');
        }
      } else {
        console.log('   ✅ Sucesso! Câmera inserida.');
        
        // Remover a câmera de teste
        await supabase
          .from('cameras')
          .delete()
          .eq('id', '5467d328-1426-4444-8ed9-6ea3e156f76f');
        console.log('   🗑️  Câmera de teste removida.');
      }
    } else {
      console.log('   ✅ Sucesso! Câmera inserida.');
      
      // Remover a câmera de teste
      await supabase
        .from('cameras')
        .delete()
        .eq('id', '5467d328-1426-4444-8ed9-6ea3e156f76f');
      console.log('   🗑️  Câmera de teste removida.');
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

testCameraInsert