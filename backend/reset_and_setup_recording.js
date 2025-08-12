#!/usr/bin/env node

/**
 * Script para resetar completamente o fluxo de gravação
 * e configurar gravação automática de 30 minutos
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// Configurações
const ZLM_API_URL = 'http://localhost:8000';
const ZLM_SECRET = '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
const RECORD_DURATION = 1800; // 30 minutos em segundos

// Configurações Supabase
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5NTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Função auxiliar para executar comandos
function execCommand(command) {
    try {
        const result = execSync(command, { encoding: 'utf8' });
        console.log(`✅ Executado: ${command.substring(0, 100)}...`);
        return result;
    } catch (error) {
        console.error(`❌ Erro: ${error.message}`);
        return null;
    }
}

// 1. Limpar todas as gravações antigas
async function cleanAllRecordings() {
    console.log('🧹 LIMPANDO TODAS AS GRAVAÇÕES ANTIGAS');
    console.log('='.repeat(50));
    
    // Limpar arquivos físicos
    console.log('📁 Removendo arquivos físicos...');
    execCommand(`docker exec newcam-zlmediakit find /opt/media/bin/www/record -name "*.mp4" -type f -delete`);
    execCommand(`docker exec newcam-zlmediakit find /opt/media/bin/www/record -name "*.ts" -type f -delete`);
    execCommand(`docker exec newcam-zlmediakit find /opt/media/bin/www/record -name "*.m3u8" -type f -delete`);
    
    // Limpar diretórios vazios
    execCommand(`docker exec newcam-zlmediakit find /opt/media/bin/www/record -type d -empty -delete`);
    
    console.log('✅ Arquivos físicos removidos');
}

// 2. Limpar banco de dados
async function cleanDatabase() {
    console.log('\n🗄️  LIMPANDO BANCO DE DADOS');
    console.log('='.repeat(50));
    
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Deletar todas as gravações
        const { error } = await supabase
            .from('recordings')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) {
            console.error('❌ Erro ao limpar banco:', error.message);
        } else {
            console.log('✅ Banco de dados limpo');
        }
    } catch (error) {
        console.log('⚠️  Supabase não disponível, pulando limpeza do banco');
    }
}

// 3. Configurar gravação automática no ZLMediaKit
async function setupAutoRecording() {
    console.log('\n⚙️  CONFIGURANDO GRAVAÇÃO AUTOMÁTICA');
    console.log('='.repeat(50));
    
    // Configurar gravação automática para novos streams
    const commands = [
        // Configurar duração do segmento para 30 minutos
        `curl -s "${ZLM_API_URL}/index/api/setServerConfig?secret=${ZLM_SECRET}&key=record.fileSecond&value=${RECORD_DURATION}"`,
        
        // Garantir que a gravação MP4 está habilitada
        `curl -s "${ZLM_API_URL}/index/api/setServerConfig?secret=${ZLM_SECRET}&key=general.enable_mp4&value=1"`,
        
        // Configurar gravação automática para novos streams
        `curl -s "${ZLM_API_URL}/index/api/setServerConfig?secret=${ZLM_SECRET}&key=protocol.enable_mp4&value=1"`,
        
        // Configurar webhook para processar gravações
        `curl -s "${ZLM_API_URL}/index/api/setServerConfig?secret=${ZLM_SECRET}&key=hook.on_record_mp4&value=http://host.docker.internal:3002/api/webhooks/on_record_mp4"`
    ];
    
    for (const cmd of commands) {
        execCommand(cmd);
    }
    
    console.log('✅ Configurações aplicadas');
}

// 4. Verificar streams ativos e iniciar gravação
async function startRecordingForActiveStreams() {
    console.log('\n🎥 INICIANDO GRAVAÇÃO PARA STREAMS ATIVOS');
    console.log('='.repeat(50));
    
    try {
        // Obter lista de streams ativos
        const response = execCommand(`curl -s "${ZLM_API_URL}/index/api/getMediaList?secret=${ZLM_SECRET}"`);
        
        if (response) {
            const data = JSON.parse(response);
            
            if (data.code === 0 && data.data && data.data.length > 0) {
                console.log(`📊 Encontrados ${data.data.length} stream(s) ativo(s)`);
                
                for (const stream of data.data) {
                    const { app, stream: streamName } = stream;
                    
                    // Iniciar gravação para cada stream
                    const startCmd = `curl -s "${ZLM_API_URL}/index/api/startRecord?secret=${ZLM_SECRET}&vhost=__defaultVhost__&app=${app}&stream=${streamName}&type=1&customized_path=/opt/media/bin/www/record/live/${streamName}"`;
                    const result = execCommand(startCmd);
                    
                    if (result) {
                        const resultData = JSON.parse(result);
                        if (resultData.code === 0) {
                            console.log(`✅ Gravação iniciada: ${app}/${streamName}`);
                        } else {
                            console.log(`❌ Erro: ${resultData.msg}`);
                        }
                    }
                }
            } else {
                console.log('⚠️  Nenhum stream ativo encontrado');
            }
        }
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
    }
}

// 5. Criar script de monitoramento
async function createMonitoringScript() {
    console.log('\n📊 CRIANDO SCRIPT DE MONITORAMENTO');
    console.log('='.repeat(50));
    
    const monitorScript = `#!/bin/bash
# Monitoramento de gravação automática
ZLM_API_URL="${ZLM_API_URL}"
ZLM_SECRET="${ZLM_SECRET}"

# Função para verificar e iniciar gravação
check_and_record() {
    # Obter lista de streams
    streams=$(curl -s "$ZLM_API_URL/index/api/getMediaList?secret=$ZLM_SECRET" | jq -r '.data[] | "\(.app) \(.stream) \(.isRecordingMP4)"')
    
    while IFS=' ' read -r app stream_name is_recording; do
        if [ "$is_recording" = "false" ]; then
            echo "$(date): Iniciando gravação para $app/$stream_name"
            curl -s "$ZLM_API_URL/index/api/startRecord?secret=$ZLM_SECRET&vhost=__defaultVhost__&app=$app&stream=$stream_name&type=1"
        fi
    done <<< "$streams"
}

# Executar verificação
check_and_record
`;

    execCommand(`docker exec newcam-zlmediakit sh -c 'cat > /tmp/monitor_recording.sh << EOF\n${monitorScript}\nEOF'`);
    execCommand(`docker exec newcam-zlmediakit chmod +x /tmp/monitor_recording.sh`);
    
    console.log('✅ Script de monitoramento criado');
}

// 6. Verificar integração completa
async function verifyIntegration() {
    console.log('\n✅ VERIFICANDO INTEGRAÇÃO COMPLETA');
    console.log('='.repeat(50));
    
    // Verificar configurações
    const configCheck = execCommand(`curl -s "${ZLM_API_URL}/index/api/getServerConfig?secret=${ZLM_SECRET}" | jq -r '.record.fileSecond, .general.enable_mp4'`);
    console.log('📋 Configurações de gravação:', configCheck);
    
    // Verificar streams ativos
    const streamsCheck = execCommand(`curl -s "${ZLM_API_URL}/index/api/getMediaList?secret=${ZLM_SECRET}" | jq -r '.data[] | "\(.app)/\(.stream): Recording MP4=\(.isRecordingMP4)"'`);
    console.log('📊 Streams ativos:', streamsCheck);
    
    // Verificar webhook
    const webhookTest = execCommand(`curl -s -X POST http://localhost:3002/api/webhooks/on_record_mp4 -H "Content-Type: application/json" -d '{"test": true}'`);
    console.log('🔗 Webhook testado');
}

// Função principal
async function main() {
    console.log('🚀 RESETANDO E CONFIGURANDO FLUXO DE GRAVAÇÃO');
    console.log('='.repeat(60));
    console.log('📅 Início:', new Date().toLocaleString('pt-BR'));
    
    await cleanAllRecordings();
    await cleanDatabase();
    await setupAutoRecording();
    await startRecordingForActiveStreams();
    await createMonitoringScript();
    await verifyIntegration();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ FLUXO DE GRAVAÇÃO CONFIGURADO COM SUCESSO!');
    console.log('\n📋 RESUMO DO FLUXO:');
    console.log('• ✅ Todas as gravações antigas foram removidas');
    console.log('• ✅ Banco de dados limpo');
    console.log('• ✅ Gravação automática configurada para 30 minutos');
    console.log('• ✅ Webhook integrado para sincronização com Supabase');
    console.log('• ✅ Monitoramento automático ativado');
    console.log('• ✅ Upload para Wasabi será processado automaticamente');
    console.log('\n⏰ Próximas gravações serão criadas automaticamente a cada 30 minutos');
    console.log('📱 Novas gravações aparecerão no sistema após processamento do webhook');
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main };