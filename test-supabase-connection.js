const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
const supabaseUrl = 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE';

async function testSupabaseConnection() {
  try {
    console.log('🔄 Testando conectividade com Supabase...');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Teste 1: Verificar se consegue conectar
    console.log('✅ Cliente Supabase criado com sucesso');
    
    // Teste 2: Listar tabelas disponíveis
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('*')
      .limit(1);
    
    if (camerasError) {
      console.log('❌ Erro ao acessar tabela cameras:', camerasError.message);
    } else {
      console.log('✅ Tabela cameras acessível');
      console.log('📊 Número de câmeras encontradas:', cameras?.length || 0);
    }
    
    // Teste 3: Verificar tabela users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (usersError) {
      console.log('❌ Erro ao acessar tabela users:', usersError.message);
    } else {
      console.log('✅ Tabela users acessível');
      console.log('👥 Número de usuários encontrados:', users?.length || 0);
    }
    
    // Teste 4: Verificar tabela streams
    const { data: streams, error: streamsError } = await supabase
      .from('streams')
      .select('*')
      .limit(1);
    
    if (streamsError) {
      console.log('❌ Erro ao acessar tabela streams:', streamsError.message);
    } else {
      console.log('✅ Tabela streams acessível');
      console.log('📺 Número de streams encontrados:', streams?.length || 0);
    }
    
    console.log('\n🎉 Teste de conectividade com Supabase concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    process.exit(1);
  }
}

testSupabaseConnection();