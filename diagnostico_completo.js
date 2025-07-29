#!/usr/bin/env node

/**
 * Diagnóstico Completo - NewCAM
 * Verificações abrangentes para migração
 * 
 * Uso: node diagnostico_completo.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

class DiagnosticoCompletoNewCAM {
    constructor() {
        this.resultados = [];
        this.passou = 0;
        this.falhou = 0;
    }

    async executar() {
        console.log('🔍 Diagnóstico Completo - NewCAM');
        console.log('==================================');
        console.log();

        await this.verificarEstrutura();
        await this.verificarArquivosEnv();
        await this.verificarPortas();
        await this.verificarDependencias();
        await this.verificarConexoes();
        await this.verificarBancoDados();

        this.mostrarResultado();
    }

    async verificarEstrutura() {
        console.log('📁 Verificando estrutura do projeto...');
        
        const estrutura = [
            'backend/package.json',
            'frontend/package.json',
            'backend/.env.example',
            'frontend/.env.example',
            'MIGRACAO_SERVIDOR_CLIENTE.md',
            'README_SERVIDOR_CLIENTE.md',
            'CHECKLIST_MIGRACAO_CLIENTE.md',
            'RESUMO_CORRECOES.md',
            'CONFIG_SERVIDOR_CLIENTE.env'
        ];

        for (const arquivo of estrutura) {
            const existe = fs.existsSync(arquivo);
            this.registrar(arquivo, existe, 'Arquivo existe');
        }
    }

    async verificarArquivosEnv() {
        console.log('⚙️  Verificando arquivos de ambiente...');
        
        const envs = ['backend/.env', 'frontend/.env'];
        
        for (const env of envs) {
            const existe = fs.existsSync(env);
            this.registrar(env, existe, 'Arquivo .env configurado');
            
            if (existe) {
                const conteudo = fs.readFileSync(env, 'utf8');
                const temSupabase = conteudo.includes('SUPABASE') || conteudo.includes('NEXT_PUBLIC_SUPABASE');
                const temPorta = conteudo.includes('PORT=') || conteudo.includes('VITE_API_URL');
                
                this.registrar(`${env} - Configurações Supabase`, temSupabase, 'Configurações presentes');
                this.registrar(`${env} - Portas configuradas`, temPorta, 'Portas configuradas');
            }
        }
    }

    async verificarPortas() {
        console.log('🔌 Verificando disponibilidade de portas...');
        
        const portas = [3000, 3002, 8080, 1935, 554];
        
        for (const porta of portas) {
            try {
                const comando = process.platform === 'win32' 
                    ? `netstat -ano | findstr :${porta}` 
                    : `lsof -i :${porta} 2>/dev/null || echo "Livre"`;
                
                const resultado = execSync(comando, { encoding: 'utf8', stdio: 'pipe' });
                const livre = resultado.trim() === '' || resultado.includes('Livre');
                
                this.registrar(`Porta ${porta}`, livre, 'Disponível para uso');
            } catch (error) {
                this.registrar(`Porta ${porta}`, true, 'Disponível para uso');
            }
        }
    }

    async verificarDependencias() {
        console.log('📦 Verificando dependências...');
        
        const diretorios = ['backend', 'frontend'];
        
        for (const dir of diretorios) {
            const packagePath = path.join(dir, 'package.json');
            
            if (fs.existsSync(packagePath)) {
                const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                const temScripts = packageJson.scripts && packageJson.scripts.dev;
                const temBuild = packageJson.scripts && packageJson.scripts.build;
                
                this.registrar(`${dir}/package.json - script dev`, temScripts, 'Script dev configurado');
                this.registrar(`${dir}/package.json - script build`, temBuild, 'Script build configurado');
                
                const nodeModules = fs.existsSync(path.join(dir, 'node_modules'));
                this.registrar(`${dir}/node_modules`, nodeModules, 'Dependências instaladas');
            }
        }
    }

    async verificarConexoes() {
        console.log('🔗 Verificando conexões de rede...');
        
        const endpoints = [
            { name: 'Backend Health', url: 'http://localhost:3002/api/health' },
            { name: 'Backend API', url: 'http://localhost:3002/api/cameras' },
            { name: 'Frontend', url: 'http://localhost:5173' },
            { name: 'ZLMediaKit', url: 'http://localhost:8080/index/api/getServerConfig' }
        ];

        for (const endpoint of endpoints) {
            const conectado = await this.testarConexao(endpoint.url);
            this.registrar(endpoint.name, conectado, 'Conexão funcionando');
        }
    }

    async testarConexao(url) {
        return new Promise((resolve) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                timeout: 3000
            };

            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const req = protocol.request(options, (res) => {
                resolve(res.statusCode < 500);
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => resolve(false));
            req.setTimeout(3000);
            req.end();
        });
    }

    async verificarBancoDados() {
        console.log('🗄️  Verificando configuração do banco...');
        
        // Verifica estrutura de banco
        const configFiles = [
            'backend/src/config/database.js',
            'backend/prisma/schema.prisma',
            'backend/src/lib/supabase.js',
            'backend/src/services/database.js'
        ];
        
        for (const file of configFiles) {
            if (fs.existsSync(file)) {
                this.registrar(file, true, 'Configuração de banco encontrada');
            }
        }

        // Verifica se tem migration para stream_type
        const migrationFiles = [
            'backend/migrations',
            'backend/src/migrations',
            'prisma/migrations'
        ];

        let temMigration = false;
        for (const dir of migrationFiles) {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                if (files.some(f => f.includes('stream_type'))) {
                    temMigration = true;
                }
            }
        }
        this.registrar('Migration stream_type', temMigration, 'Migration criada');
    }

    registrar(descricao, passou, mensagem) {
        const status = passou ? '✅' : '❌';
        this.resultados.push({ descricao, passou, mensagem });
        
        if (passou) {
            this.passou++;
            console.log(`  ${status} ${descricao}`);
        } else {
            this.falhou++;
            console.log(`  ${status} ${descricao} - ${mensagem}`);
        }
    }

    mostrarResultado() {
        console.log();
        console.log('📊 Resultado Final do Diagnóstico');
        console.log('==================================');
        console.log(`✅ Testes Passados: ${this.passou}`);
        console.log(`❌ Testes Falhados: ${this.falhou}`);
        console.log(`📈 Total de Testes: ${this.passou + this.falhou}`);
        console.log();
        
        if (this.falhou === 0) {
            console.log('🎉 Sistema pronto para migração!');
            console.log('   ✅ Todos os testes passaram');
            console.log('   ✅ Documentação completa');
            console.log('   ✅ Pronto para deploy no servidor do cliente');
        } else {
            console.log('⚠️  Corrija os problemas antes de prosseguir:');
            console.log();
            
            const falhas = this.resultados.filter(r => !r.passou);
            falhas.forEach(falha => {
                console.log(`   ❌ ${falha.descricao}: ${falha.mensagem}`);
            });
            
            console.log();
            console.log('📋 Próximos passos:');
            console.log('1. Consulte MIGRACAO_SERVIDOR_CLIENTE.md');
            console.log('2. Use CHECKLIST_MIGRACAO_CLIENTE.md');
            console.log('3. Execute verificar-migracao.js para validação completa');
        }
        
        console.log();
        console.log('📚 Documentação disponível:');
        console.log('   - MIGRACAO_SERVIDOR_CLIENTE.md');
        console.log('   - README_SERVIDOR_CLIENTE.md');
        console.log('   - CHECKLIST_MIGRACAO_CLIENTE.md');
        console.log('   - RESUMO_CORRECOES.md');
    }
}

// Executar diagnóstico
if (require.main === module) {
    const diagnostico = new DiagnosticoCompletoNewCAM();
    diagnostico.executar().catch(console.error);
}

module.exports = DiagnosticoCompletoNewCAM;