import RecordingService from './src/services/RecordingService.js';
import { supabaseAdmin } from './src/config/database.js';

async function testPrepareDownload() {
    try {
        console.log('🔍 Testando método prepareDownload diretamente...');
        
        // Usar o serviço singleton
        const recordingService = RecordingService;
        
        // Buscar uma gravação existente
        const { data: recordings, error } = await supabaseAdmin
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (error) {
            console.error('❌ Erro ao buscar gravações:', error);
            return;
        }
        
        console.log(`✅ Encontradas ${recordings.length} gravações no banco`);
        
        if (recordings.length === 0) {
            console.log('❌ Nenhuma gravação encontrada no banco');
            return;
        }
        
        // Testar com as primeiras gravações
        for (let i = 0; i < Math.min(3, recordings.length); i++) {
            const recording = recordings[i];
            console.log(`\n📹 Testando gravação ${i + 1}:`);
            console.log(`   ID: ${recording.id}`);
            console.log(`   Nome: ${recording.filename}`);
            console.log(`   Caminho: ${recording.file_path}`);
            console.log(`   Status: ${recording.status}`);
            console.log(`   Tamanho: ${recording.file_size}`);
            
            try {
                console.log('\n🔍 Chamando prepareDownload...');
                const downloadInfo = await recordingService.prepareDownload(recording.id);
                
                console.log('✅ Resultado do prepareDownload:');
                console.log('   exists:', downloadInfo.exists);
                console.log('   isS3:', downloadInfo.isS3);
                console.log('   filePath:', downloadInfo.filePath);
                console.log('   filename:', downloadInfo.filename);
                console.log('   fileSize:', downloadInfo.fileSize);
                
                if (downloadInfo.exists) {
                    console.log('✅ Arquivo encontrado!');
                    break;
                } else {
                    console.log('❌ Arquivo não encontrado');
                }
                
            } catch (error) {
                console.error('❌ Erro ao chamar prepareDownload:', error.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error.message);
        console.error('📋 Stack:', error.stack);
    }
}

testPrepareDownload();