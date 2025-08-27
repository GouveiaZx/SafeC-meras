import { supabaseAdmin } from './backend/src/config/database.js';

async function enqueuePendingRecordings() {
    console.log('🔄 Enfileirando gravações pendentes...');
    
    try {
        // Buscar gravações pendentes
        const { data: pendingRecordings, error: fetchError } = await supabaseAdmin
            .from('recordings')
            .select('id, local_path, file_size, created_at')
            .eq('upload_status', 'pending');
            
        if (fetchError) {
            console.error('❌ Erro ao buscar gravações pendentes:', fetchError);
            return;
        }
        
        console.log(`📦 Encontradas ${pendingRecordings.length} gravações pendentes`);
        
        for (const recording of pendingRecordings) {
            console.log(`📤 Enfileirando: ${recording.id} - ${recording.local_path}`);
            
            const { error: enqueueError } = await supabaseAdmin
                .from('upload_queue')
                .insert({
                    recording_id: recording.id,
                    file_path: recording.local_path,
                    file_size: recording.file_size || null,
                    status: 'pending',
                    priority: 1,
                    retry_count: 0,
                    max_retries: 3,
                    created_at: new Date().toISOString()
                });
                
            if (enqueueError) {
                console.error(`❌ Erro ao enfileirar ${recording.id}:`, enqueueError);
            } else {
                console.log(`✅ Enfileirado: ${recording.id}`);
            }
        }
        
        console.log('🎯 Processo concluído!');
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

enqueuePendingRecordings();