import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração do Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function simulateRecordingWebhook() {
    console.log('🎬 Simulando webhook de gravação...');
    
    // Dados da gravação que encontramos
    const recordingData = {
        mediaServerId: 'zlmediakit-server',
        app: 'live',
        stream: '15d899b1-2a41-4d9d-8bfc-1497d534143f',
        vhost: '__defaultVhost__',
        file_name: '2025-08-11-11-45-24-0.mp4',
        file_path: '/opt/media/bin/www/record/live/15d899b1-2a41-4d9d-8bfc-1497d534143f/2025-08-11/2025-08-11-11-45-24-0.mp4',
        file_size: 1048576,
        folder: '/opt/media/bin/www/record/live/15d899b1-2a41-4d9d-8bfc-1497d534143f/2025-08-11/',
        start_time: Math.floor(Date.now() / 1000) - 300, // 5 minutos atrás
        time_len: 300, // 5 minutos de duração
        url: 'rtmp://localhost:1935/live/15d899b1-2a41-4d9d-8bfc-1497d534143f'
    };
    
    try {
        // 1. Verificar se a câmera existe
        const { data: camera, error: cameraError } = await supabase
            .from('cameras')
            .select('*')
            .eq('id', recordingData.stream)
            .single();
            
        if (cameraError) {
            console.log('❌ Erro ao buscar câmera:', cameraError.message);
            return;
        }
        
        if (!camera) {
            console.log('⚠️  Câmera não encontrada:', recordingData.stream);
            return;
        }
        
        console.log('📹 Câmera encontrada:', camera.name);
        
        // 2. Calcular path local do arquivo
        const localPath = path.join(
            'c:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live',
            recordingData.stream,
            '2025-08-11',
            recordingData.file_name
        );
        
        // 3. Verificar se o arquivo existe
        if (!fs.existsSync(localPath)) {
            console.log('❌ Arquivo não encontrado:', localPath);
            return;
        }
        
        const stats = fs.statSync(localPath);
        console.log('📁 Arquivo encontrado:', {
            path: localPath,
            size: stats.size,
            created: stats.birthtime
        });
        
        // 4. Inserir gravação no banco
        const recording = {
            id: randomUUID(),
            camera_id: camera.id,
            filename: recordingData.file_name,
            file_path: recordingData.file_path,
            file_size: stats.size,
            duration: recordingData.time_len,
            start_time: new Date(recordingData.start_time * 1000).toISOString(),
            status: 'completed',
            metadata: {
                app: recordingData.app,
                vhost: recordingData.vhost,
                mediaServerId: recordingData.mediaServerId,
                folder: recordingData.folder,
                local_path: localPath,
                end_time: new Date((recordingData.start_time + recordingData.time_len) * 1000).toISOString(),
                stream_url: recordingData.url
            }
        };
        
        const { data: insertedRecording, error: insertError } = await supabase
            .from('recordings')
            .insert(recording)
            .select()
            .single();
            
        if (insertError) {
            console.log('❌ Erro ao inserir gravação:', insertError.message);
            return;
        }
        
        console.log('✅ Gravação registrada com sucesso!');
        console.log('📊 Dados da gravação:', {
            id: insertedRecording.id,
            filename: insertedRecording.filename,
            duration: insertedRecording.duration,
            size: insertedRecording.file_size,
            status: insertedRecording.status
        });
        
        // 5. Verificar total de gravações no banco
        const { count, error: countError } = await supabase
            .from('recordings')
            .select('*', { count: 'exact', head: true });
            
        if (!countError) {
            console.log(`📈 Total de gravações no banco: ${count}`);
        }
        
    } catch (error) {
        console.log('💥 Erro:', error.message);
    }
}

// Executar simulação
simulateRecordingWebhook().then(() => {
    console.log('\n✅ Simulação concluída!');
}).catch(error => {
    console.error('💥 Erro fatal:', error);
});