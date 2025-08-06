import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Limpar gravações corrompidas (sem arquivo físico)
 */
async function cleanupCorruptedRecordings() {
    try {
        console.log('🧹 Iniciando limpeza de gravações corrompidas...');
        
        // 1. Buscar todas as gravações
        const { data: recordings, error } = await supabase
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro ao buscar gravações:', error);
            return;
        }
        
        console.log(`📊 Total de gravações encontradas: ${recordings.length}`);
        
        if (recordings.length === 0) {
            console.log('ℹ️  Nenhuma gravação encontrada no banco de dados.');
            return;
        }
        
        let corruptedCount = 0;
        let validCount = 0;
        const corruptedRecordings = [];
        
        // 2. Verificar cada gravação
        for (const recording of recordings) {
            const filePath = recording.file_path;
            
            if (!filePath) {
                console.log(`⚠️  Gravação ${recording.id} sem file_path`);
                corruptedRecordings.push(recording);
                corruptedCount++;
                continue;
            }
            
            // Construir caminho completo
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(__dirname, '..', filePath);
            
            // Verificar se arquivo existe
            if (!fs.existsSync(fullPath)) {
                console.log(`❌ Arquivo não encontrado: ${fullPath}`);
                corruptedRecordings.push(recording);
                corruptedCount++;
            } else {
                console.log(`✅ Arquivo válido: ${fullPath}`);
                validCount++;
            }
        }
        
        console.log(`\n📊 Resultado da verificação:`);
        console.log(`  ✅ Gravações válidas: ${validCount}`);
        console.log(`  ❌ Gravações corrompidas: ${corruptedCount}`);
        
        if (corruptedCount === 0) {
            console.log('🎉 Nenhuma gravação corrompida encontrada!');
            return;
        }
        
        // 3. Confirmar limpeza
        console.log(`\n🗑️  Gravações que serão removidas:`);
        corruptedRecordings.forEach((recording, index) => {
            console.log(`  ${index + 1}. ID: ${recording.id}`);
            console.log(`     Arquivo: ${recording.file_path}`);
            console.log(`     Criado em: ${recording.created_at}`);
            console.log(`     Status: ${recording.status}`);
            console.log('');
        });
        
        // Para automação, vamos prosseguir com a limpeza
        console.log('🚀 Iniciando remoção das gravações corrompidas...');
        
        // 4. Remover gravações corrompidas
        const recordingIds = corruptedRecordings.map(r => r.id);
        
        const { error: deleteError } = await supabase
            .from('recordings')
            .delete()
            .in('id', recordingIds);
        
        if (deleteError) {
            console.error('❌ Erro ao deletar gravações:', deleteError);
            return;
        }
        
        console.log(`✅ ${corruptedCount} gravações corrompidas removidas com sucesso!`);
        
        // 5. Verificar resultado final
        const { data: remainingRecordings, error: checkError } = await supabase
            .from('recordings')
            .select('id')
            .order('created_at', { ascending: false });
        
        if (checkError) {
            console.error('❌ Erro ao verificar gravações restantes:', checkError);
            return;
        }
        
        console.log(`\n📊 Resultado final:`);
        console.log(`  📁 Gravações restantes no banco: ${remainingRecordings.length}`);
        console.log(`  🗑️  Gravações removidas: ${corruptedCount}`);
        
        console.log('\n🎉 Limpeza concluída com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error);
    }
}

// Executar limpeza
cleanupCorruptedRecordings()
    .then(() => {
        console.log('✅ Script de limpeza finalizado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Erro no script de limpeza:', error);
        process.exit(1);
    });

export { cleanupCorruptedRecordings };