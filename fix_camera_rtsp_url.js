const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function fixCameraRTSPUrl() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Variáveis de ambiente do Supabase não encontradas');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔧 Corrigindo URL RTSP da câmera...');
    
    // Buscar a câmera atual
    const { data: cameras, error: fetchError } = await supabase
      .from('cameras')
      .select('*')
      .eq('name', 'Câmera Principal');
    
    if (fetchError) {
      console.error('❌ Erro ao buscar câmera:', fetchError);
      return;
    }
    
    if (!cameras || cameras.length === 0) {
      console.error('❌ Câmera "Câmera Principal" não encontrada');
      return;
    }
    
    const camera = cameras[0];
    console.log('📹 Câmera encontrada:', camera.name);
    console.log('📡 URL RTSP atual:', camera.rtsp_url);
    console.log('📊 Status atual:', camera.status);
    
    // Baseado nos testes, sabemos que:
    // 1. A porta 37777 é RTSP válida
    // 2. Todos os caminhos testados retornam 404
    // 3. A câmera responde com RTSP/1.0 400 Bad Request para requisições malformadas
    
    // Vamos tentar algumas URLs RTSP alternativas mais simples
    const alternativeUrls = [
      // URL mais simples possível
      'rtsp://visualizar:infotec5384@170.245.45.10:37777',
      // Com barra no final
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/',
      // Caminhos mais genéricos
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/stream',
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/live',
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/video',
      // Tentar canal 1 em vez de 4
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/ch1/main/av_stream',
      // Sem especificar canal
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/h264/main/av_stream',
      // Formato mais simples
      'rtsp://visualizar:infotec5384@170.245.45.10:37777/av_stream'
    ];
    
    console.log('\n🔍 URLs alternativas para testar:');
    alternativeUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    
    // Por enquanto, vamos usar a URL mais simples (sem caminho)
    const newRtspUrl = 'rtsp://visualizar:infotec5384@170.245.45.10:37777';
    
    console.log(`\n🔄 Atualizando URL RTSP para: ${newRtspUrl}`);
    
    // Atualizar a câmera no Supabase
    const { data: updatedCamera, error: updateError } = await supabase
      .from('cameras')
      .update({
        rtsp_url: newRtspUrl,
        status: 'offline', // Resetar status para permitir nova tentativa
        is_streaming: false,
        last_seen: new Date().toISOString()
      })
      .eq('id', camera.id)
      .select();
    
    if (updateError) {
      console.error('❌ Erro ao atualizar câmera:', updateError);
      return;
    }
    
    console.log('✅ Câmera atualizada com sucesso!');
    console.log('📊 Nova configuração:');
    console.log(`   URL RTSP: ${updatedCamera[0].rtsp_url}`);
    console.log(`   Status: ${updatedCamera[0].status}`);
    console.log(`   Streaming: ${updatedCamera[0].is_streaming}`);
    
    console.log('\n💡 PRÓXIMOS PASSOS:');
    console.log('1. Teste o stream novamente no frontend');
    console.log('2. Se ainda não funcionar, teste as URLs alternativas manualmente');
    console.log('3. Consulte a documentação da câmera para o caminho RTSP correto');
    console.log('4. Considere contatar o fabricante da câmera');
    
    console.log('\n📋 INFORMAÇÕES PARA O FABRICANTE:');
    console.log(`   IP: ${camera.ip_address}`);
    console.log(`   Porta: ${camera.port}`);
    console.log(`   Modelo: ${camera.model || 'Não especificado'}`);
    console.log(`   Usuário: ${camera.username}`);
    console.log('   Problema: Todos os caminhos RTSP retornam 404 Not Found');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

fixCameraRTSPUrl();