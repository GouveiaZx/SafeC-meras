import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkConstraints() {
  try {
    console.log('🔍 Verificando constraints da tabela cameras...');
    
    // Consultar constraints da tabela cameras
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT 
          conname as constraint_name,
          pg_get_constraintdef(oid) as constraint_definition
        FROM pg_constraint 
        WHERE conrelid = 'cameras'::regclass 
        AND contype = 'c'
        ORDER BY conname;
      `
    });
    
    if (error) {
      console.error('❌ Erro ao consultar constraints:', error);
      
      // Tentar uma abordagem alternativa
      console.log('\n🔄 Tentando abordagem alternativa...');
      
      const { data: altData, error: altError } = await supabase
        .from('information_schema.check_constraints')
        .select('constraint_name, check_clause')
        .eq('constraint_schema', 'public');
      
      if (altError) {
        console.error('❌ Erro na abordagem alternativa:', altError);
        return;
      }
      
      console.log('📋 Constraints encontradas (alternativa):');
      altData.forEach(constraint => {
        console.log(`   ${constraint.constraint_name}: ${constraint.check_clause}`);
      });
      
    } else {
      console.log('📋 Constraints encontradas:');
      data.forEach(constraint => {
        console.log(`   ${constraint.constraint_name}: ${constraint.constraint_definition}`);
      });
    }
    
    // Verificar as câmeras existentes
    console.log('\n📹 Verificando câmeras existentes...');
    const { data: cameras, error: camerasError } = await supabase
      .from('cameras')
      .select('id, name, ip_address, rtsp_url, status');
    
    if (camerasError) {
      console.error('❌ Erro ao buscar câmeras:', camerasError);
    } else {
      console.log(`   Total: ${cameras.length} câmeras`);
      cameras.forEach(camera => {
        console.log(`   - ${camera.name} (${camera.id.substring(0, 8)}...) - Status: ${camera.status}`);
        console.log(`     IP: ${camera.ip_address || 'N/A'}, RTSP: ${camera.rtsp_url ? 'Sim' : 'Não'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

checkConstraints();