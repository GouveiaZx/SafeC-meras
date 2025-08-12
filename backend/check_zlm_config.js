import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config();

class ZLMConfigChecker {
  constructor() {
    this.configPaths = [
      path.join(process.cwd(), 'zlmediakit', 'ZLMediaKit', 'conf', 'config.ini'),
      path.join(process.cwd(), 'zlmediakit', 'conf', 'config.ini'),
      path.join(process.cwd(), 'config.ini')
    ];
  }

  async checkConfig() {
    console.log('🔧 Verificando configuração do ZLMediaKit para corte de 30 minutos...\n');

    // 1. Procurar arquivo de configuração
    const configPath = await this.findConfigFile();
    if (!configPath) {
      console.log('❌ Arquivo config.ini não encontrado');
      await this.createConfigTemplate();
      return;
    }

    // 2. Ler e analisar configuração
    await this.analyzeConfig(configPath);

    // 3. Verificar webhook URL
    await this.checkWebhookConfig();

    // 4. Testar conectividade
    await this.testZLMConnection();
  }

  async findConfigFile() {
    for (const configPath of this.configPaths) {
      try {
        await fs.access(configPath);
        console.log(`✅ Configuração encontrada: ${configPath}`);
        return configPath;
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  async analyzeConfig(configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf8');
      console.log('\n📋 Analisando configuração...');

      // Verificar configurações de gravação
      const recordingConfig = this.parseRecordingConfig(content);
      this.validateRecordingConfig(recordingConfig);

      // Verificar webhook
      const webhookConfig = this.parseWebhookConfig(content);
      this.validateWebhookConfig(webhookConfig);

    } catch (error) {
      console.error('❌ Erro ao analisar configuração:', error.message);
    }
  }

  parseRecordingConfig(content) {
    const lines = content.split('\n');
    const config = {};
    let inRecordingSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '[record]') {
        inRecordingSection = true;
        continue;
      }
      
      if (inRecordingSection) {
        if (trimmed.startsWith('[')) {
          break; // Nova seção
        }
        
        const [key, value] = trimmed.split('=').map(s => s.trim());
        if (key && value) {
          config[key] = value;
        }
      }
    }

    return config;
  }

  parseWebhookConfig(content) {
    const lines = content.split('\n');
    const webhooks = [];
    let inHookSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '[hook]') {
        inHookSection = true;
        continue;
      }
      
      if (inHookSection) {
        if (trimmed.startsWith('[')) {
          break; // Nova seção
        }
        
        const [key, value] = trimmed.split('=').map(s => s.trim());
        if (key && value && key.includes('on_record')) {
          webhooks.push({ event: key, url: value });
        }
      }
    }

    return webhooks;
  }

  validateRecordingConfig(config) {
    console.log('\n⚙️  Configurações de gravação:');

    // Verificar segmentação
    const segDur = config['segDur'] || '1800';
    if (segDur === '1800') {
      console.log('✅ Segmentação configurada para 30 minutos (segDur=1800)');
    } else {
      console.log(`⚠️  Segmentação: ${segDur}s (recomendado: 1800s para 30min)`);
    }

    // Verificar formato
    const fileFormat = config['fileFormat'] || 'mp4';
    if (fileFormat === 'mp4') {
      console.log('✅ Formato configurado para MP4');
    } else {
      console.log(`⚠️  Formato: ${fileFormat} (recomendado: mp4)`);
    }

    // Verificar pasta de gravação
    const filePath = config['filePath'] || './www/record';
    console.log(`📁 Pasta de gravação: ${filePath}`);

    // Verificar se gravação está ativada
    const enable = config['enable'] || '1';
    if (enable === '1') {
      console.log('✅ Gravação ativada');
    } else {
      console.log('❌ Gravação desativada');
    }
  }

  validateWebhookConfig(webhooks) {
    console.log('\n🔗 Configurações de webhook:');
    
    const recordWebhook = webhooks.find(w => w.event === 'on_record_mp4');
    if (recordWebhook) {
      if (recordWebhook.url.includes('localhost:3002/api/webhooks/on_record_mp4')) {
        console.log('✅ Webhook on_record_mp4 configurado corretamente');
      } else {
        console.log(`⚠️  Webhook on_record_mp4: ${recordWebhook.url}`);
      }
    } else {
      console.log('❌ Webhook on_record_mp4 não configurado');
    }
  }

  async createConfigTemplate() {
    const template = `[general]
# Porta do servidor HTTP
port=8080

[record]
# Habilitar gravação
enable=1

# Formato dos arquivos (mp4, flv, ts)
fileFormat=mp4

# Duração dos segmentos em segundos (1800 = 30 minutos)
segDur=1800

# Pasta onde os arquivos serão salvos
filePath=./www/record

# Habilitar gravação automática para todas as streams
autoRecord=1

[hook]
# Webhook para quando uma gravação MP4 é concluída
on_record_mp4=http://localhost:3002/api/webhooks/on_record_mp4

# Webhook para quando uma stream é publicada
on_publish=http://localhost:3002/api/webhooks/on_publish

# Webhook para quando uma stream é reproduzida
on_play=http://localhost:3002/api/webhooks/on_play

# Habilitar webhooks
enable=1
`;

    const configPath = path.join(process.cwd(), 'zlmediakit', 'ZLMediaKit', 'conf', 'config.ini');
    
    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, template);
      console.log('\n✅ Template de configuração criado:');
      console.log(`   ${configPath}`);
    } catch (error) {
      console.log('\n📋 Template de configuração (salve como config.ini):');
      console.log(template);
    }
  }

  async checkWebhookConfig() {
    console.log('\n🔗 Verificando webhook configuration...');
    
    const expectedUrl = 'http://localhost:3002/api/webhooks/on_record_mp4';
    
    try {
      const response = await fetch(expectedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });

      if (response.status === 400) {
        console.log('✅ Webhook endpoint acessível (400 esperado para dados inválidos)');
      } else {
        console.log(`⚠️  Webhook respondeu com status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ Webhook não acessível:', error.message);
      console.log('💡 Verifique se o servidor NewCAM está rodando: npm run dev');
    }
  }

  async testZLMConnection() {
    console.log('\n🌐 Testando conexão com ZLMediaKit...');
    
    const zlmUrl = 'http://localhost:8080/index/api/getServerConfig';
    
    try {
      const response = await fetch(zlmUrl);
      
      if (response.ok) {
        console.log('✅ ZLMediaKit está rodando na porta 8080');
      } else {
        console.log(`⚠️  ZLMediaKit respondeu com status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ ZLMediaKit não está acessível na porta 8080');
      console.log('💡 Verifique se o ZLMediaKit está rodando');
    }
  }
}

// Função auxiliar para criar arquivo de teste
async function createTestRecording() {
  try {
    const recordingsPath = './recordings';
    await fs.mkdir(recordingsPath, { recursive: true });

    const testFile = path.join(recordingsPath, 'test-30min-recording.mp4');
    const testContent = Buffer.alloc(1024 * 1024 * 10); // 10MB de teste
    
    await fs.writeFile(testFile, testContent);
    console.log('\n🧪 Arquivo de teste criado:', testFile);

    return testFile;
  } catch (error) {
    console.error('❌ Erro ao criar arquivo de teste:', error.message);
  }
}

// Executar verificação
async function main() {
  const checker = new ZLMConfigChecker();
  await checker.checkConfig();
  
  // Criar arquivo de teste
  await createTestRecording();
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default ZLMConfigChecker;