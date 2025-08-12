#!/usr/bin/env node

/**
 * Script para debugar o fluxo completo de gravação
 * Verifica:
 * 1. Status do ZLMediaKit
 * 2. Streams ativos
 * 3. Configuração de gravação
 * 4. Webhooks
 * 5. Sincronização com banco
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configurações
const ZLM_API_URL = 'http://localhost:8000';
const ZLM_SECRET = '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';

// Função auxiliar para executar comandos
function execCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (error) {
        return `Erro: ${error.message}`;
    }
}

// Função para fazer chamadas HTTP
async function fetchZLM(api) {
    try {
        const response = await fetch(`${ZLM_API_URL}${api}?secret=${ZLM_SECRET}`);
        return await response.json();
    } catch (error) {
        return { error: error.message };
    }
}

// 1. Verificar status do ZLMediaKit
async function checkZLMStatus() {
    console.log('=== STATUS DO ZLMEDIAKIT ===');
    
    try {
        const response = await fetch(`${ZLM_API_URL}/index/api/getServerConfig?secret=${ZLM_SECRET}`);
        const data = await response.json();
        
        if (data.code === 0) {
            console.log('✅ ZLMediaKit está rodando');
            console.log(`📊 Versão: ${data.data.version || 'N/A'}`);
            console.log(`⏰ Uptime: ${data.data.uptime || 'N/A'}`);
        } else {
            console.log('❌ Erro ao verificar ZLMediaKit:', data.msg);
        }
    } catch (error) {
        console.log('❌ ZLMediaKit não está acessível:', error.message);
    }
}

// 2. Verificar streams ativos
async function checkActiveStreams() {
    console.log('\n=== STREAMS ATIVOS ===');
    
    try {
        const response = await fetch(`${ZLM_API_URL}/index/api/getMediaList?secret=${ZLM_SECRET}`);
        const data = await response.json();
        
        if (data.code === 0 && data.data && data.data.length > 0) {
            console.log(`✅ ${data.data.length} stream(s) ativo(s) encontrado(s):`);
            
            data.data.forEach((stream, index) => {
                console.log(`\n${index + 1}. Stream: ${stream.app}/${stream.stream}`);
                console.log(`   📹 Vídeo: ${stream.video.codec_name || 'N/A'} ${stream.video.width}x${stream.video.height}`);
                console.log(`   🔊 Áudio: ${stream.audio.codec_name || 'N/A'}`);
                console.log(`   👥 Viewers: ${stream.totalReaderCount}`);
                console.log(`   📦 Bytes: ${stream.totalBytes}`);
                console.log(`   ⏱️  Duração: ${Math.round(stream.duration / 1000)}s`);
            });
        } else {
            console.log('⚠️  Nenhum stream ativo encontrado');
        }
    } catch (error) {
        console.log('❌ Erro ao verificar streams:', error.message);
    }
}

// 3. Verificar configuração de gravação
function checkRecordingConfig() {
    console.log('\n=== CONFIGURAÇÃO DE GRAVAÇÃO ===');
    
    // Verificar se o diretório de gravação existe
    const recordingDir = '/opt/media/bin/www/record';
    const command = `docker exec newcam-zlmediakit ls -la ${recordingDir}`;
    const result = execCommand(command);
    
    if (!result.includes('Erro')) {
        console.log('✅ Diretório de gravação existe');
        
        // Listar arquivos de gravação
        const filesCommand = `docker exec newcam-zlmediakit find ${recordingDir} -name "*.mp4" -type f | wc -l`;
        const filesCount = execCommand(filesCommand);
        console.log(`📁 Total de arquivos MP4: ${filesCount}`);
        
        // Últimos arquivos
        const latestFiles = execCommand(`docker exec newcam-zlmediakit find ${recordingDir} -name "*.mp4" -type f -printf "%T@ %p\n" | sort -n | tail -5`);
        if (latestFiles && !latestFiles.includes('Erro')) {
            console.log('📅 Últimos arquivos:');
            latestFiles.split('\n').forEach(file => {
                if (file.trim()) {
                    const [timestamp, path] = file.split(' ');
                    const date = new Date(parseFloat(timestamp) * 1000);
                    console.log(`   ${date.toLocaleString()} - ${path.split('/').pop()}`);
                }
            });
        }
    } else {
        console.log('❌ Diretório de gravação não encontrado');
    }
}

// 4. Verificar webhooks
function checkWebhooks() {
    console.log('\n=== WEBHOOKS ===');
    
    // Verificar se o backend está respondendo
    const webhookUrl = 'http://localhost:3002/api/webhooks/on_record_mp4';
    const testData = JSON.stringify({
        app: 'live',
        stream: 'test',
        file_name: 'test.mp4',
        file_path: '/record/test.mp4',
        file_size: 1024
    });
    
    try {
        const response = execCommand(`curl -s -X POST http://localhost:3002/api/webhooks/on_record_mp4 -H "Content-Type: application/json" -d '${testData}'`);
        console.log('✅ Webhook está acessível');
        console.log('📨 Resposta:', response);
    } catch (error) {
        console.log('❌ Webhook não está acessível:', error.message);
    }
}

// 5. Verificar banco de dados
async function checkDatabase() {
    console.log('\n=== BANCO DE DADOS ===');
    
    try {
        const { createClient } = await import('../src/lib/supabase.js');
        const supabase = createClient();
        
        const { data, error } = await supabase
            .from('recordings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) {
            console.log('❌ Erro ao consultar banco:', error.message);
        } else {
            console.log(`✅ ${data.length} gravação(ões) no banco`);
            
            if (data.length > 0) {
                data.forEach((recording, index) => {
                    console.log(`\n${index + 1}. ${recording.filename}`);
                    console.log(`   📹 Câmera: ${recording.camera_id}`);
                    console.log(`   📦 Tamanho: ${recording.file_size}`);
                    console.log(`   📅 Criado: ${new Date(recording.created_at).toLocaleString()}`);
                    console.log(`   📊 Status: ${recording.status}`);
                });
            }
        }
    } catch (error) {
        console.log('❌ Erro ao conectar ao banco:', error.message);
    }
}

// 6. Verificar configuração de gravação automática
function checkAutoRecording() {
    console.log('\n=== CONFIGURAÇÃO DE GRAVAÇÃO AUTOMÁTICA ===');
    
    // Verificar config do ZLMediaKit
    const config = execCommand('docker exec newcam-zlmediakit cat /opt/media/conf/config.ini');
    
    if (config.includes('enable_mp4=1')) {
        console.log('✅ Gravação MP4 está habilitada');
    } else {
        console.log('❌ Gravação MP4 está desabilitada');
    }
    
    if (config.includes('fileSecond=1800')) {
        console.log('✅ Gravação a cada 30 minutos está configurada');
    } else {
        console.log('❌ Configuração de intervalo de gravação não encontrada');
    }
    
    if (config.includes('on_record_mp4=http://host.docker.internal:3002')) {
        console.log('✅ Webhook de gravação está configurado');
    } else {
        console.log('❌ Webhook de gravação não está configurado');
    }
}

// Função principal
async function main() {
    console.log('🔍 DEBUG DO FLUXO DE GRAVAÇÃO');
    console.log('='.repeat(50));
    
    await checkZLMStatus();
    await checkActiveStreams();
    checkRecordingConfig();
    checkWebhooks();
    checkAutoRecording();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Verificação concluída!');
    
    // Recomendações
    console.log('\n📋 RECOMENDAÇÕES:');
    console.log('1. Verifique se a câmera está enviando RTSP para o ZLMediaKit');
    console.log('2. Confirme se o webhook está recebendo as notificações de gravação');
    console.log('3. Verifique os logs do ZLMediaKit para erros de gravação');
    console.log('4. Teste manualmente a gravação com a API do ZLMediaKit');
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main };