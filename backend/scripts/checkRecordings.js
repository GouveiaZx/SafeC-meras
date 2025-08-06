import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecordings() {
    try {
        console.log('🔍 Verificando gravações no banco de dados...');
        
        // Buscar todas as gravações
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
        
        // Estatísticas
        const stats = {
            total: recordings.length,
            byStatus: {},
            byUploadStatus: {},
            byCodec: {},
            filesExist: 0,
            filesMissing: 0,
            withS3Url: 0,
            withoutS3Url: 0
        };
        
        console.log('\n📋 Verificando arquivos no sistema...');
        
        for (const recording of recordings) {
            // Contar por status
            stats.byStatus[recording.status] = (stats.byStatus[recording.status] || 0) + 1;
            stats.byUploadStatus[recording.upload_status] = (stats.byUploadStatus[recording.upload_status] || 0) + 1;
            stats.byCodec[recording.codec] = (stats.byCodec[recording.codec] || 0) + 1;
            
            // Verificar se tem S3 URL
            if (recording.s3_url) {
                stats.withS3Url++;
            } else {
                stats.withoutS3Url++;
            }
            
            // Verificar se arquivo existe
            if (recording.file_path) {
                const fullPath = path.resolve(recording.file_path);
                if (fs.existsSync(fullPath)) {
                    stats.filesExist++;
                } else {
                    stats.filesMissing++;
                    console.log(`❌ Arquivo não encontrado: ${fullPath}`);
                }
            }
        }
        
        console.log('\n📊 Estatísticas:');
        console.log(`Total: ${stats.total}`);
        console.log(`\n📁 Arquivos:`);
        console.log(`  ✅ Existem: ${stats.filesExist}`);
        console.log(`  ❌ Não encontrados: ${stats.filesMissing}`);
        
        console.log(`\n☁️  Upload para S3:`);
        console.log(`  ✅ Com URL S3: ${stats.withS3Url}`);
        console.log(`  ❌ Sem URL S3: ${stats.withoutS3Url}`);
        
        console.log(`\n📊 Por Status:`);
        Object.entries(stats.byStatus).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });
        
        console.log(`\n📤 Por Status de Upload:`);
        Object.entries(stats.byUploadStatus).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });
        
        console.log(`\n🎥 Por Codec:`);
        Object.entries(stats.byCodec).forEach(([codec, count]) => {
            console.log(`  ${codec}: ${count}`);
        });
        
        // Mostrar alguns exemplos de caminhos
        console.log('\n📂 Exemplos de caminhos de arquivo:');
        recordings.slice(0, 5).forEach((recording, index) => {
            console.log(`  ${index + 1}. ${recording.file_path}`);
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

checkRecordings();