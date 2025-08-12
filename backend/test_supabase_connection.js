import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

console.log('🔍 Testando conexão com Supabase...');
console.log('📊 Variáveis de ambiente:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Definida' : '❌ Não definida');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Definida' : '❌ Não definida');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Definida' : '❌ Não definida');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Variáveis de ambiente do Supabase não configuradas!');
    console.log('\n📋 Para configurar:');
    console.log('1. Copie o arquivo .env.example para .env');
    console.log('2. Configure as variáveis SUPABASE_URL e SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function testConnection() {
    try {
        console.log('\n🔗 Testando conexão...');
        
        // Teste básico de conexão
        const { data, error } = await supabase
            .from('cameras')
            .select('count')
            .limit(1);
            
        if (error) {
            console.log('❌ Erro na conexão:', error.message);
            console.log('🔍 Detalhes do erro:', error);
            return false;
        }
        
        console.log('✅ Conexão com Supabase OK!');
        
        // Listar câmeras
        const { data: cameras, error: camerasError } = await supabase
            .from('cameras')
            .select('id, name, status, recording_enabled')
            .limit(10);
            
        if (camerasError) {
            console.log('❌ Erro ao buscar câmeras:', camerasError.message);
            return false;
        }
        
        console.log(`📹 Encontradas ${cameras.length} câmeras:`);
        cameras.forEach(camera => {
            console.log(`   - ${camera.name} (${camera.id}) - Status: ${camera.status} - Gravação: ${camera.recording_enabled ? 'SIM' : 'NÃO'}`);
        });
        
        // Listar gravações
        const { data: recordings, error: recordingsError } = await supabase
            .from('recordings')
            .select('id, filename, status, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (recordingsError) {
            console.log('❌ Erro ao buscar gravações:', recordingsError.message);
            return false;
        }
        
        console.log(`📼 Encontradas ${recordings.length} gravações recentes:`);
        recordings.forEach(recording => {
            console.log(`   - ${recording.filename} - ${recording.status} - ${new Date(recording.created_at).toLocaleString()}`);
        });
        
        return true;
        
    } catch (error) {
        console.log('💥 Erro fatal:', error.message);
        return false;
    }
}

testConnection().then(success => {
    if (success) {
        console.log('\n✅ Teste de conexão concluído com sucesso!');
    } else {
        console.log('\n❌ Teste de conexão falhou!');
    }
}).catch(error => {
    console.error('💥 Erro:', error);
});