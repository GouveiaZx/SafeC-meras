const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

// Criar cliente Supabase
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteAllCameras() {
  try {
    console.log('🔍 Conectando ao Supabase...');
    
    // Primeiro, contar quantas câmeras existem
    const { count: totalCameras, error: countError } = await supabase
      .from('cameras')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Erro ao contar câmeras:', countError);
      return;
    }
    
    console.log(`📊 Total de câmeras encontradas: ${totalCameras}`);
    
    if (totalCameras === 0) {
      console.log('✅ Nenhuma câmera encontrada para excluir.');
      return;
    }
    
    // Buscar todas as câmeras para mostrar o que será excluído
    const { data: cameras, error: fetchError } = await supabase
      .from('cameras')
      .select('id, name, status, active, location, created_at');
    
    if (fetchError) {
      console.error('❌ Erro ao buscar câmeras:', fetchError);
      return;
    }
    
    console.log('\n📋 Câmeras que serão excluídas:');
    cameras.forEach((camera, index) => {
      console.log(`${index + 1}. ID: ${camera.id}`);
      console.log(`   Nome: ${camera.name || 'Sem nome'}`);
      console.log(`   Status: ${camera.status || 'N/A'}`);
      console.log(`   Ativa: ${camera.active ? 'Sim' : 'Não'}`);
      console.log(`   Localização: ${camera.location || 'N/A'}`);
      console.log(`   Criada em: ${new Date(camera.created_at).toLocaleString('pt-BR')}`);
      console.log('   ---');
    });
    
    console.log('\n⚠️  ATENÇÃO: Esta operação irá excluir TODAS as câmeras do banco de dados!');
    console.log('🗑️  Iniciando exclusão em 3 segundos...');
    
    // Aguardar 3 segundos antes de excluir
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n🗑️  Excluindo todas as câmeras...');
    
    // Excluir todas as câmeras
    const { error: deleteError } = await supabase
      .from('cameras')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Condição que sempre será verdadeira para excluir tudo
    
    if (deleteError) {
      console.error('❌ Erro ao excluir câmeras:', deleteError);
      return;
    }
    
    console.log('✅ Todas as câmeras foram excluídas com sucesso!');
    
    // Verificar se realmente foram excluídas
    const { count: remainingCameras, error: verifyError } = await supabase
      .from('cameras')
      .select('*', { count: 'exact', head: true });
    
    if (verifyError) {
      console.error('❌ Erro ao verificar exclusão:', verifyError);
      return;
    }
    
    console.log(`\n🔍 Verificação: ${remainingCameras} câmeras restantes no banco.`);
    
    if (remainingCameras === 0) {
      console.log('✅ Confirmado: Todas as câmeras foram excluídas com sucesso!');
    } else {
      console.log(`⚠️  Atenção: Ainda existem ${remainingCameras} câmeras no banco.`);
    }
    
  } catch (error) {
    console.error('💥 Erro inesperado:', error);
  }
}

// Executar a função
deleteAllCameras().then(() => {
  console.log('\n🏁 Processo de exclusão concluído!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});