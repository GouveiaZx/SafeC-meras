import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function simpleCheck() {
  console.log('=== VERIFICAÇÃO SIMPLES ===\n');
  
  try {
    // Pegar uma gravação e ver seus campos
    const { data: sampleRecord, error } = await supabase
      .from('recordings')
      .select('*')
      .limit(1)
      .single();
    
    if (error) {
      console.error('Erro:', error);
      return;
    }
    
    console.log('Campos disponíveis na tabela recordings:');
    Object.keys(sampleRecord).forEach(field => {
      console.log(`  - ${field}: ${typeof sampleRecord[field]}`);
    });
    
    console.log('\nExemplo de gravação:');
    console.log(JSON.stringify(sampleRecord, null, 2));
    
    // Verificar gravações ativas
    const { data: activeCount } = await supabase
      .from('recordings')
      .select('id', { count: 'exact' })
      .eq('status', 'recording');
    
    console.log(`\nGravações ativas: ${activeCount?.length || 0}`);
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

simpleCheck();