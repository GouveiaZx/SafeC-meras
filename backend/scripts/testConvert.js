#!/usr/bin/env node

console.log('🎬 Teste de conversão iniciado');

try {
  console.log('✅ Script executando corretamente');
  console.log('📁 Diretório atual:', process.cwd());
  console.log('🔧 Versão do Node:', process.version);
  
  // Testar imports
  console.log('📦 Testando imports...');
  
  import('fs/promises').then(() => {
    console.log('✅ fs/promises importado');
  }).catch(err => {
    console.error('❌ Erro ao importar fs/promises:', err.message);
  });
  
  import('path').then(() => {
    console.log('✅ path importado');
  }).catch(err => {
    console.error('❌ Erro ao importar path:', err.message);
  });
  
  import('child_process').then(() => {
    console.log('✅ child_process importado');
  }).catch(err => {
    console.error('❌ Erro ao importar child_process:', err.message);
  });
  
  import('@supabase/supabase-js').then(() => {
    console.log('✅ @supabase/supabase-js importado');
  }).catch(err => {
    console.error('❌ Erro ao importar @supabase/supabase-js:', err.message);
  });
  
  import('dotenv').then(() => {
    console.log('✅ dotenv importado');
  }).catch(err => {
    console.error('❌ Erro ao importar dotenv:', err.message);
  });
  
} catch (error) {
  console.error('❌ Erro no script:', error.message);
  console.error(error.stack);
}

console.log('🏁 Teste concluído');