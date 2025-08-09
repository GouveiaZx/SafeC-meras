import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableStructure() {
  console.log('=== VERIFICAÇÃO DA ESTRUTURA DA TABELA RECORDINGS ===\n');
  
  try {
    // Verificar estrutura da tabela recordings
    const { data, error } = await supabase
      .rpc('get_table_columns', { table_name: 'recordings' })
      .single();
    
    if (error) {
      console.log('Erro ao obter estrutura via RPC, tentando query direta...');
      
      // Tentar obter informações das colunas diretamente
      const { data: columns, error: colError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_name', 'recordings')
        .eq('table_schema', 'public');
      
      if (colError) {
        console.error('Erro ao obter colunas:', colError);
        
        // Como último recurso, vamos pegar uma gravação e ver seus campos
        console.log('\nTentando obter campos através de uma gravação existente...');
        const { data: sampleRecord, error: sampleError } = await supabase
          .from('recordings')
          .select('*')
          .limit(1)
          .single();
        
        if (sampleError) {
          console.error('Erro ao obter gravação de exemplo:', sampleError);
        } else {
          console.log('\nCampos disponíveis na tabela recordings:');
          Object.keys(sampleRecord).forEach(field => {
            console.log(`  - ${field}: ${typeof sampleRecord[field]} = ${sampleRecord[field]}`);
          });
        }
      } else {
        console.log('\nColunas da tabela recordings:');
        columns.forEach(col => {
          console.log(`  - ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable} - Default: ${col.column_default || 'N/A'}`);
        });
      }
    } else {
      console.log('Estrutura da tabela:', data);
    }
    
    // Verificar se existem gravações em andamento
    console.log('\n=== VERIFICAÇÃO DE GRAVAÇÕES ATIVAS ===');
    
    const { data: activeRecordings, error: activeError } = await supabase
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (activeError) {
      console.error('Erro ao buscar gravações ativas:', activeError);
    } else {
      console.log(`\nGravações com status 'recording': ${activeRecordings.length}`);
      
      if (activeRecordings.length > 0) {
        activeRecordings.forEach((recording, index) => {
          console.log(`\n${index + 1}. ID: ${recording.id}`);
          console.log(`   Câmera: ${recording.camera_id}`);
          console.log(`   Status: ${recording.status}`);
          console.log(`   Criada: ${recording.created_at}`);
          console.log(`   Arquivo: ${recording.file_path || 'N/A'}`);
          console.log(`   Duração: ${recording.duration || 0}s`);
        });
      }
    }
    
    // Verificar gravações recentes (últimas 24h)
    console.log('\n=== GRAVAÇÕES RECENTES (ÚLTIMAS 24H) ===');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: recentRecordings, error: recentError } = await supabase
      .from('recordings')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (recentError) {
      console.error('Erro ao buscar gravações recentes:', recentError);
    } else {
      console.log(`\nGravações das últimas 24h: ${recentRecordings.length}`);
      
      recentRecordings.forEach((recording, index) => {
        console.log(`\n${index + 1}. ID: ${recording.id}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Criada: ${recording.created_at}`);
        console.log(`   Duração: ${recording.duration || 0}s`);
      });
    }
    
  } catch (error) {
    console.error('Erro geral:', error);
  }
}

checkTableStructure();