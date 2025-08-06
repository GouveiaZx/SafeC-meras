import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { glob } from 'glob';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';
const supabase = createClient(supabaseUrl, supabaseKey);

// Função para verificar se ZLMediaKit está disponível
function checkZLMediaKit() {
    return new Promise((resolve) => {
        const zlmediakit = spawn('zlmediakit', ['-version']);
        zlmediakit.on('close', (code) => {
            resolve(code === 0);
        });
        zlmediakit.on('error', () => {
            resolve(false);
        });
    });
}

// Função para detectar codec do vídeo usando ZLMediaKit
function detectCodec(filePath) {
    return new Promise((resolve, reject) => {
        const zlmprobe = spawn('zlmprobe', [
            '-v', 'quiet',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'csv=p=0',
            filePath
        ]);
        
        let output = '';
        zlmprobe.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        zlmprobe.on('close', (code) => {
            if (code === 0) {
                const codec = output.trim();
                resolve(codec);
            } else {
                reject(new Error(`zlmprobe failed with code ${code}`));
            }
        });
        
        zlmprobe.on('error', (error) => {
            reject(error);
        });
    });
}

// Função para converter vídeo HEVC para H.264 usando ZLMediaKit
function convertVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`🔄 Convertendo: ${path.basename(inputPath)}`);
        
        const zlmediakit = spawn('zlmediakit', [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y', // Sobrescrever arquivo de saída
            outputPath
        ]);
        
        let progress = '';
        zlmediakit.stderr.on('data', (data) => {
            progress += data.toString();
            // Mostrar progresso básico
            if (progress.includes('time=')) {
                const timeMatch = progress.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                if (timeMatch) {
                    process.stdout.write(`\r⏱️  Tempo processado: ${timeMatch[1]}`);
                }
            }
        });
        
        zlmediakit.on('close', (code) => {
            process.stdout.write('\n');
            if (code === 0) {
                console.log(`✅ Conversão concluída: ${path.basename(outputPath)}`);
                resolve();
            } else {
                reject(new Error(`ZLMediaKit failed with code ${code}`));
            }
        });
        
        zlmediakit.on('error', (error) => {
            reject(error);
        });
    });
}

// Função para buscar todos os arquivos MP4
async function findAllMP4Files() {
    console.log('🔍 Buscando todos os arquivos MP4...');
    
    const searchPaths = [
        'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\**\\*.mp4'
    ];
    
    const allFiles = [];
    
    for (const searchPath of searchPaths) {
        try {
            const files = await glob(searchPath, { 
                ignore: ['**/node_modules/**', '**/converted/**', '**/.git/**'],
                windowsPathsNoEscape: true
            });
            
            for (const file of files) {
                if (fs.existsSync(file)) {
                    allFiles.push(file);
                }
            }
        } catch (error) {
            console.log(`⚠️  Erro ao buscar em ${searchPath}:`, error.message);
        }
    }
    
    console.log(`📹 Encontrados ${allFiles.length} arquivos MP4`);
    return allFiles;
}

// Função para atualizar codec no banco de dados
async function updateCodecInDB(filePath, newCodec) {
    try {
        const { error } = await supabase
            .from('recordings')
            .update({ 
                codec: newCodec,
                updated_at: new Date().toISOString()
            })
            .eq('file_path', filePath);
        
        if (error) {
            console.error(`❌ Erro ao atualizar codec no BD para ${filePath}:`, error);
        }
    } catch (error) {
        console.error(`❌ Erro ao atualizar codec no BD:`, error);
    }
}

async function main() {
    try {
        console.log('🎬 Iniciando conversão de vídeos HEVC para H.264\n');
        
        // Verificar se ZLMediaKit está disponível
        const zlmediakitAvailable = await checkZLMediaKit();
        if (!zlmediakitAvailable) {
            console.error('❌ ZLMediaKit não encontrado! Instale o ZLMediaKit primeiro.');
            return;
        }
        console.log('✅ ZLMediaKit encontrado');
        
        // Buscar todos os arquivos MP4
        const files = await findAllMP4Files();
        
        if (files.length === 0) {
            console.log('❌ Nenhum arquivo MP4 encontrado!');
            return;
        }
        
        // Criar diretório de conversão
        const convertedDir = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\converted';
        if (!fs.existsSync(convertedDir)) {
            fs.mkdirSync(convertedDir, { recursive: true });
        }
        
        console.log(`📁 Diretório de conversão: ${convertedDir}\n`);
        
        let totalFiles = 0;
        let hevcFiles = 0;
        let converted = 0;
        let errors = 0;
        let skipped = 0;
        
        for (const file of files) {
            totalFiles++;
            console.log(`\n📦 Processando ${totalFiles}/${files.length}: ${path.basename(file)}`);
            
            try {
                // Detectar codec
                const codec = await detectCodec(file);
                console.log(`🎥 Codec detectado: ${codec}`);
                
                if (codec === 'hevc' || codec === 'h265') {
                    hevcFiles++;
                    
                    // Gerar nome do arquivo convertido
                    const fileName = path.basename(file, '.mp4');
                    const outputPath = path.join(convertedDir, `${fileName}_h264.mp4`);
                    
                    // Verificar se já foi convertido
                    if (fs.existsSync(outputPath)) {
                        console.log(`⏭️  Já convertido: ${path.basename(outputPath)}`);
                        skipped++;
                        continue;
                    }
                    
                    // Converter vídeo
                    await convertVideo(file, outputPath);
                    
                    // Verificar se a conversão foi bem-sucedida
                    if (fs.existsSync(outputPath)) {
                        const outputCodec = await detectCodec(outputPath);
                        console.log(`✅ Codec do arquivo convertido: ${outputCodec}`);
                        
                        // Atualizar codec no banco de dados
                        await updateCodecInDB(file, 'h264');
                        
                        converted++;
                    } else {
                        console.error(`❌ Arquivo convertido não foi criado: ${outputPath}`);
                        errors++;
                    }
                } else {
                    console.log(`✅ Já é H.264, não precisa converter`);
                }
                
            } catch (error) {
                console.error(`❌ Erro ao processar ${path.basename(file)}:`, error.message);
                errors++;
            }
        }
        
        // Relatório final
        console.log('\n📊 Relatório de Conversão:');
        console.log(`📁 Total de arquivos analisados: ${totalFiles}`);
        console.log(`🎥 Arquivos HEVC encontrados: ${hevcFiles}`);
        console.log(`✅ Convertidos: ${converted}`);
        console.log(`⏭️  Pulados (já convertidos): ${skipped}`);
        console.log(`❌ Erros: ${errors}`);
        
        if (converted > 0) {
            console.log(`\n🎉 Conversão concluída! ${converted} vídeos convertidos para H.264`);
            console.log(`📁 Arquivos convertidos salvos em: ${convertedDir}`);
        }
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

main();