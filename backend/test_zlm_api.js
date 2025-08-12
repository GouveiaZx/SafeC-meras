import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Secret correto do ZLMediaKit
const ZLM_SECRET = '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
const ZLM_BASE_URL = 'http://localhost:8000';

async function testZLMAPI() {
    console.log('🔍 Testando API do ZLMediaKit...');
    
    try {
        // 1. Testar conexão básica
        const response = await axios.get(`${ZLM_BASE_URL}/index/api/getServerConfig?secret=${ZLM_SECRET}`);
        console.log('✅ Conexão com ZLMediaKit OK');
        
        // 2. Listar streams ativos
        const streamsResponse = await axios.get(`${ZLM_BASE_URL}/index/api/getMediaList?secret=${ZLM_SECRET}`);
        console.log('📡 Streams ativos:', JSON.stringify(streamsResponse.data, null, 2));
        
        // 3. Verificar configuração de gravação
        const recordConfig = response.data.data.find(item => item[0] === 'record.enable_mp4');
        console.log('📼 Gravação MP4 habilitada:', recordConfig ? recordConfig[1] : 'Não encontrado');
        
        // 4. Verificar diretório de gravação
        const recordPath = response.data.data.find(item => item[0] === 'record.filePath');
        console.log('📁 Diretório de gravação:', recordPath ? recordPath[1] : 'Não encontrado');
        
        // 5. Verificar duração das gravações
        const recordDuration = response.data.data.find(item => item[0] === 'record.fileSecond');
        console.log('⏱️  Duração das gravações:', recordDuration ? `${recordDuration[1]} segundos (${Math.round(recordDuration[1]/60)} minutos)` : 'Não encontrado');
        
        // 6. Tentar iniciar gravação para streams ativos
        if (streamsResponse.data.data && streamsResponse.data.data.length > 0) {
            for (const stream of streamsResponse.data.data) {
                const { app, stream: streamName, vhost } = stream;
                console.log(`\n🎬 Tentando iniciar gravação para: ${app}/${streamName}`);
                
                try {
                    const startRecordResponse = await axios.get(
                        `${ZLM_BASE_URL}/index/api/startRecord?secret=${ZLM_SECRET}&type=1&vhost=${vhost}&app=${app}&stream=${streamName}`
                    );
                    console.log('📹 Resultado:', startRecordResponse.data);
                } catch (recordError) {
                    console.log('❌ Erro ao iniciar gravação:', recordError.response?.data || recordError.message);
                }
            }
        } else {
            console.log('⚠️  Nenhum stream ativo encontrado');
        }
        
        // 7. Verificar gravações no banco de dados
        console.log('\n🗄️  Verificando gravações no banco de dados...');
        const { data: recordings, error } = await supabase
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) {
            console.log('❌ Erro ao consultar banco:', error.message);
        } else {
            console.log(`📊 Total de gravações no banco: ${recordings.length}`);
            if (recordings.length > 0) {
                console.log('📋 Últimas gravações:');
                recordings.forEach((rec, index) => {
                    console.log(`   ${index + 1}. ${rec.filename} - ${rec.status} - ${new Date(rec.created_at).toLocaleString()}`);
                });
            }
        }
        
    } catch (error) {
        console.log('❌ Erro na API:', error.response?.data || error.message);
    }
}

// Executar teste
testZLMAPI().then(() => {
    console.log('\n✅ Teste concluído!');
}).catch(error => {
    console.error('💥 Erro fatal:', error);
});