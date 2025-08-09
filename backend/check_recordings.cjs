const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://ixqjqfqjqjqjqjqjqjqj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4cWpxZnFqcWpxanFqcWpxanFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzM3NzI5NSwiZXhwIjoyMDUyOTUzMjk1fQ.YhJBUVJBUVJBUVJBUVJBUVJBUVJBUVJBUVJBUVJBUVJB';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecordings() {
  try {
    console.log('🔍 Verificando gravações no banco...');
    
    const { data, error } = await supabase
      .from('recordings')
      .select('id, filename, status, file_size, duration, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log('📋 Últimas 5 gravações no banco:');
    if (data && data.length > 0) {
      data.forEach((rec, i) => {
        console.log(`${i+1}. ${rec.filename} (${rec.id})`);
        console.log(`   Status: ${rec.status} | Tamanho: ${rec.file_size || 'null'} bytes | Duração: ${rec.duration || 'null'}s`);
        console.log(`   Criada: ${rec.created_at}`);
        console.log('');
      });
    } else {
      console.log('❌ Nenhuma gravação encontrada no banco');
    }
    
    // Verificar se a gravação específica existe
    console.log('🔍 Verificando gravação específica 1d062cbb-edcd-4eba-832c-f49595636ad4...');
    const { data: specificRec, error: specificError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', '1d062cbb-edcd-4eba-832c-f49595636ad4')
      .maybeSingle();
    
    if (specificError) {
      console.error('❌ Erro ao buscar gravação específica:', specificError);
    } else if (specificRec) {
      console.log('✅ Gravação específica encontrada:', specificRec);
    } else {
      console.log('❌ Gravação específica 1d062cbb-edcd-4eba-832c-f49595636ad4 NÃO EXISTE no banco');
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

checkRecordings();