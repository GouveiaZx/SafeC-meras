import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function checkRecordingsTable() {
    console.log('🔍 Verificando estrutura da tabela recordings...');
    
    try {
        // Tentar inserir um registro de teste para ver quais campos são aceitos
        const testRecord = {
            id: 'test-id',
            camera_id: '15d899b1-2a41-4d9d-8bfc-1497d534143f',
            filename: 'test.mp4',
            file_path: '/test/path',
            file_size: 1000,
            duration: 300,
            status: 'completed'
        };
        
        const { data, error } = await supabase
            .from('recordings')
            .insert(testRecord)
            .select();
            
        if (error) {
            console.log('❌ Erro ao inserir teste:', error.message);
            console.log('🔍 Detalhes:', error);
        } else {
            console.log('✅ Teste inserido com sucesso!');
            console.log('📊 Dados inseridos:', data);
            
            // Remover o registro de teste
            await supabase
                .from('recordings')
                .delete()
                .eq('id', 'test-id');
                
            console.log('🗑️  Registro de teste removido');
        }
        
        // Tentar buscar um registro existente para ver a estrutura
        const { data: existingRecordings, error: selectError } = await supabase
            .from('recordings')
            .select('*')
            .limit(1);
            
        if (selectError) {
            console.log('❌ Erro ao buscar registros:', selectError.message);
        } else if (existingRecordings && existingRecordings.length > 0) {
            console.log('📋 Estrutura da tabela (baseada em registro existente):');
            console.log(Object.keys(existingRecordings[0]));
        } else {
            console.log('📋 Nenhum registro existente encontrado');
        }
        
    } catch (error) {
        console.log('💥 Erro:', error.message);
    }
}

checkRecordingsTable().then(() => {
    console.log('\n✅ Verificação concluída!');
}).catch(error => {
    console.error('💥 Erro fatal:', error);
});