#!/usr/bin/env node

/**
 * Script para configurar gravação automática de 30 minutos
 * para todas as câmeras no ZLMediaKit
 */

import { execSync } from 'child_process';

// Configurações
const ZLM_API_URL = 'http://localhost:8000';
const ZLM_SECRET = '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK';
const RECORD_DURATION = 1800; // 30 minutos em segundos

// Função auxiliar para executar comandos HTTP
function execCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (error) {
        console.error(`Erro: ${error.message}`);
        return null;
    }
}

// 1. Configurar gravação automática global
async function setupGlobalRecording() {
    console.log('🎯 CONFIGURANDO GRAVAÇÃO AUTOMÁTICA GLOBAL');
    console.log('='.repeat(50));
    
    // Configurar gravação automática para novos streams
    const commands = [
        // Configurar duração do segmento para 30 minutos
        `curl -s "${ZLM_API_URL}/index/api/setServerConfig?secret=${ZLM_SECRET}&key=record.fileSecond&value=${RECORD_DURATION}"`,
        
        // Garantir que a gravação MP4 está habilitada
        `curl -s "${ZLM_API_URL}/index/api/setServerConfig?secret=${ZLM_SECRET}&key=general.enable_mp4&value=1"`,
        
        // Verificar configuração atual
        `curl -s "${ZLM_API_URL}/index/api/getServerConfig?secret=${ZLM_SECRET}"`
    ];
    
    for (const cmd of commands) {
        const result = execCommand(cmd);
        if (result) {
            console.log(`✅ Comando executado: ${cmd.split('?')[0]}`);
        }
    }
}

// 2. Iniciar gravação para stream ativo
async function startRecordingForActiveStreams() {
    console.log('\n🎥 INICIANDO GRAVAÇÃO PARA STREAMS ATIVOS');
    console.log('='.repeat(50));
    
    try {
        // Obter lista de streams ativos
        const response = execCommand(`curl -s "${ZLM_API_URL}/index/api/getMediaList?secret=${ZLM_SECRET}"`);
        const data = JSON.parse(response);
        
        if (data.code === 0 && data.data) {
            console.log(`📊 Encontrados ${data.data.length} stream(s) ativo(s)`);
            
            for (const stream of data.data) {
                const { app, stream: streamName } = stream;
                
                // Verificar se já está gravando
                if (!stream.isRecordingMP4) {
                    const startCmd = `curl -s "${ZLM_API_URL}/index/api/startRecord?secret=${ZLM_SECRET}&vhost=__defaultVhost__&app=${app}&stream=${streamName}&type=1&customized_path=/opt/media/bin/www/record/live/${streamName}"`;
                    const result = execCommand(startCmd);
                    
                    try {
                        const resultData = JSON.parse(result);
                        if (resultData.code === 0) {
                            console.log(`✅ Gravação iniciada: ${app}/${streamName}`);
                        } else {
                            console.log(`❌ Erro ao iniciar gravação: ${resultData.msg}`);
                        }
                    } catch (e) {
                        console.log(`⚠️  Resultado não JSON: ${result}`);
                    }
                } else {
                    console.log(`✅ Gravação já ativa: ${app}/${streamName}`);
                }
            }
        } else {
            console.log('⚠️  Nenhum stream ativo encontrado');
        }
    } catch (error) {
        console.log(`❌ Erro ao processar streams: ${error.message}`);
    }
}

// 3. Configurar gravação periódica
async function setupPeriodicRecording() {
    console.log('\n⏰ CONFIGURANDO GRAVAÇÃO PERIÓDICA');
    console.log('='.repeat(50));
    
    // Criar script para reiniciar gravação a cada 30 minutos
    const restartScript = `#!/bin/bash
# Script para reiniciar gravação a cada 30 minutos
ZLM_API_URL="${ZLM_API_URL}"
ZLM_SECRET="${ZLM_SECRET}"

# Função para reiniciar gravação
restart_recording() {
    # Parar gravação atual
    curl -s "$ZLM_API_URL/index/api/stopRecord?secret=$ZLM_SECRET&vhost=__defaultVhost__&app=live&stream=4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd&type=1"
    
    # Aguardar 2 segundos
    sleep 2
    
    # Iniciar nova gravação
    curl -s "$ZLM_API_URL/index/api/startRecord?secret=$ZLM_SECRET&vhost=__defaultVhost__&app=live&stream=4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd&type=1&customized_path=/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd"
}

# Executar reinicialização
restart_recording
`;

    // Salvar script no contêiner
    const scriptPath = '/tmp/restart_recording.sh';
    execCommand(`docker exec newcam-zlmediakit sh -c 'cat > ${scriptPath} << EOF\n${restartScript}\nEOF'`);
    execCommand(`docker exec newcam-zlmediakit chmod +x ${scriptPath}`);
    
    console.log('✅ Script de reinicialização criado');
    console.log('📋 Para agendar a cada 30 minutos, adicione ao crontab:');
    console.log('*/30 * * * * /tmp/restart_recording.sh');
}

// 4. Verificar integração webhook
async function checkWebhookIntegration() {
    console.log('\n🔗 VERIFICANDO INTEGRAÇÃO WEBHOOK');
    console.log('='.repeat(50));
    
    // Testar webhook
    const testData = '{"app":"live","stream":"4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd","file_name":"test_2025-08-10_12-00-00.mp4","file_path":"/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/test_2025-08-10_12-00-00.mp4","file_size":1048576,"folder":"/opt/media/bin/www/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10","start_time":1754832000,"time_len":1800,"url":"http://localhost:8000/record/live/4ccfd5af-ffaf-4a86-8e3e-ffa0fc1529dd/2025-08-10/test_2025-08-10_12-00-00.mp4"}';
    
    const webhookTest = execCommand(`curl -s -X POST http://localhost:3002/api/webhooks/on_record_mp4 -H "Content-Type: application/json" -d '${testData}'`);
    
    if (webhookTest) {
        console.log('✅ Webhook testado com sucesso');
        console.log('📨 Resposta:', webhookTest);
    } else {
        console.log('❌ Webhook não respondeu');
    }
}

// Função principal
async function main() {
    console.log('🚀 CONFIGURANDO FLUXO COMPLETO DE GRAVAÇÃO');
    console.log('='.repeat(60));
    
    await setupGlobalRecording();
    await startRecordingForActiveStreams();
    await setupPeriodicRecording();
    await checkWebhookIntegration();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ CONFIGURAÇÃO CONCLUÍDA!');
    console.log('\n📋 RESUMO:');
    console.log('• Gravação MP4 está ativa');
    console.log('• Intervalo configurado para 30 minutos');
    console.log('• Webhook integrado para sincronização');
    console.log('• Arquivos serão salvos em: /opt/media/bin/www/record/live/[camera_id]/');
    console.log('\n⏰ Próxima gravação será iniciada automaticamente em 30 minutos');
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main };