import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupOrphanedRecordings() {
    console.log('🧹 Iniciando limpeza de gravações órfãs...');
    
    try {
        // 1. Buscar todas as gravações
        console.log('\n1️⃣ Buscando todas as gravações no banco...');
        const { data: recordings, error: fetchError } = await supabase
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (fetchError) {
            console.error('❌ Erro ao buscar gravações:', fetchError);
            return;
        }
        
        console.log(`📊 Total de gravações encontradas: ${recordings.length}`);
        
        // 2. Verificar quais gravações são órfãs
        console.log('\n2️⃣ Verificando arquivos físicos...');
        const orphanedRecordings = [];
        const validRecordings = [];
        
        for (const recording of recordings) {
            let isOrphaned = true;
            
            // Verificar se o arquivo existe no caminho especificado
            if (recording.file_path) {
                if (fs.existsSync(recording.file_path)) {
                    isOrphaned = false;
                } else {
                    // Tentar caminhos alternativos
                    const alternativePaths = [
                        path.join(process.cwd(), 'recordings', recording.filename || ''),
                        path.join(process.cwd(), 'backend', 'recordings', recording.filename || ''),
                        path.join(process.cwd(), recording.file_path.replace(/^.*[\\\/]/, '')),
                        recording.local_path
                    ].filter(Boolean);
                    
                    for (const altPath of alternativePaths) {
                        if (fs.existsSync(altPath)) {
                            isOrphaned = false;
                            console.log(`✅ Arquivo encontrado em caminho alternativo: ${altPath}`);
                            break;
                        }
                    }
                }
            }
            
            if (isOrphaned) {
                orphanedRecordings.push(recording);
                console.log(`❌ Órfã: ${recording.filename} (ID: ${recording.id})`);
            } else {
                validRecordings.push(recording);
                console.log(`✅ Válida: ${recording.filename} (ID: ${recording.id})`);
            }
        }
        
        console.log(`\n📊 Resumo:`);
        console.log(`   Gravações válidas: ${validRecordings.length}`);
        console.log(`   Gravações órfãs: ${orphanedRecordings.length}`);
        
        // 3. Remover gravações órfãs
        if (orphanedRecordings.length > 0) {
            console.log('\n3️⃣ Removendo gravações órfãs do banco...');
            
            const orphanedIds = orphanedRecordings.map(r => r.id);
            
            const { error: deleteError } = await supabase
                .from('recordings')
                .delete()
                .in('id', orphanedIds);
                
            if (deleteError) {
                console.error('❌ Erro ao remover gravações órfãs:', deleteError);
            } else {
                console.log(`✅ ${orphanedRecordings.length} gravações órfãs removidas com sucesso!`);
                
                // Listar as gravações removidas
                console.log('\n📋 Gravações removidas:');
                orphanedRecordings.forEach((recording, index) => {
                    console.log(`   ${index + 1}. ${recording.filename} (${recording.camera_id})`);
                });
            }
        } else {
            console.log('\n✅ Nenhuma gravação órfã encontrada!');
        }
        
        // 4. Verificar estado final
        console.log('\n4️⃣ Verificando estado final...');
        const { data: finalRecordings, error: finalError } = await supabase
            .from('recordings')
            .select('count(*)', { count: 'exact' });
            
        if (finalError) {
            console.error('❌ Erro ao verificar estado final:', finalError);
        } else {
            console.log(`📊 Total de gravações restantes: ${finalRecordings[0].count}`);
        }
        
        console.log('\n🎉 Limpeza de gravações órfãs concluída!');
        
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error);
    }
}

// Executar limpeza
cleanupOrphanedRecordings();