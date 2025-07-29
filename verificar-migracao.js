#!/usr/bin/env node

/**
 * Script de verificação para migração do servidor cliente
 * Executa todos os testes necessários antes da migração
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Cores para output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

class MigrationChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.success = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        switch (type) {
            case 'error':
                console.log(`${colors.red}[ERRO]${colors.reset} ${message}`);
                this.errors.push(message);
                break;
            case 'warning':
                console.log(`${colors.yellow}[AVISO]${colors.reset} ${message}`);
                this.warnings.push(message);
                break;
            case 'success':
                console.log(`${colors.green}[OK]${colors.reset} ${message}`);
                this.success.push(message);
                break;
            default:
                console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
        }
    }

    async checkEnvironmentFiles() {
        this.log('Verificando arquivos de ambiente...');
        
        const backendEnv = path.join(__dirname, 'backend', '.env');
        const frontendEnv = path.join(__dirname, 'frontend', '.env');
        
        if (!fs.existsSync(backendEnv)) {
            this.log('Arquivo .env do backend não encontrado', 'error');
            return false;
        }
        
        if (!fs.existsSync(frontendEnv)) {
            this.log('Arquivo .env do frontend não encontrado', 'error');
            return false;
        }
        
        // Verificar conteúdo dos arquivos
        const backendContent = fs.readFileSync(backendEnv, 'utf8');
        const requiredVars = [
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY',
            'SUPABASE_SERVICE_ROLE_KEY',
            'JWT_SECRET'
        ];
        
        for (const varName of requiredVars) {
            if (!backendContent.includes(varName)) {
                this.log(`Variável ${varName} não encontrada no .env do backend`, 'error');
            }
        }
        
        this.log('Arquivos de ambiente verificados', 'success');
        return true;
    }

    async checkDatabaseStructure() {
        this.log('Verificando estrutura do banco de dados...');
        
        try {
            // Verificar se pode conectar ao Supabase
            const { createClient } = require('@supabase/supabase-js');
            require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
            
            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );
            
            // Verificar estrutura da tabela cameras
            const { data, error } = await supabase
                .from('cameras')
                .select('*')
                .limit(1);
            
            if (error) {
                this.log(`Erro ao verificar banco: ${error.message}`, 'error');
                return false;
            }
            
            // Verificar se tem coluna stream_type
            const { data: columns } = await supabase
                .rpc('get_table_columns', { table_name: 'cameras' });
            
            if (columns && !columns.some(col => col.column_name === 'stream_type')) {
                this.log('Coluna stream_type não encontrada na tabela cameras', 'error');
                return false;
            }
            
            this.log('Estrutura do banco de dados verificada', 'success');
            return true;
            
        } catch (error) {
            this.log(`Erro ao verificar banco: ${error.message}`, 'error');
            return false;
        }
    }

    async checkDependencies() {
        this.log('Verificando dependências...');
        
        const backendPackage = path.join(__dirname, 'backend', 'package.json');
        const frontendPackage = path.join(__dirname, 'frontend', 'package.json');
        
        if (!fs.existsSync(backendPackage)) {
            this.log('package.json do backend não encontrado', 'error');
            return false;
        }
        
        if (!fs.existsSync(frontendPackage)) {
            this.log('package.json do frontend não encontrado', 'error');
            return false;
        }
        
        // Verificar se node_modules existe
        const backendModules = path.join(__dirname, 'backend', 'node_modules');
        const frontendModules = path.join(__dirname, 'frontend', 'node_modules');
        
        if (!fs.existsSync(backendModules)) {
            this.log('node_modules do backend não encontrado - execute npm install', 'warning');
        }
        
        if (!fs.existsSync(frontendModules)) {
            this.log('node_modules do frontend não encontrado - execute npm install', 'warning');
        }
        
        this.log('Dependências verificadas', 'success');
        return true;
    }

    async checkZLMediaKit() {
        this.log('Verificando ZLMediaKit...');
        
        const zlmConfig = path.join(__dirname, 'zlmediakit', 'config.ini');
        
        if (!fs.existsSync(zlmConfig)) {
            this.log('Arquivo config.ini do ZLMediaKit não encontrado', 'error');
            return false;
        }
        
        // Verificar se ZLMediaKit está instalado
        try {
            execSync('which MediaServer || where MediaServer', { stdio: 'pipe' });
            this.log('ZLMediaKit instalado', 'success');
        } catch (error) {
            this.log('ZLMediaKit não encontrado no PATH', 'warning');
        }
        
        return true;
    }

    async checkPorts() {
        this.log('Verificando portas...');
        
        const ports = [3002, 8080, 1935, 5173];
        
        for (const port of ports) {
            try {
                const result = execSync(`netstat -ano | findstr :${port} || lsof -i :${port}`, { stdio: 'pipe' });
                if (result.toString().trim()) {
                    this.log(`Porta ${port} está em uso`, 'warning');
                } else {
                    this.log(`Porta ${port} disponível`, 'success');
                }
            } catch (error) {
                // Porta disponível ou comando não encontrado
                this.log(`Porta ${port} parece estar disponível`, 'success');
            }
        }
        
        return true;
    }

    async checkStorage() {
        this.log('Verificando estrutura de armazenamento...');
        
        const directories = [
            'storage',
            'storage/recordings',
            'storage/streams',
            'logs',
            'uploads'
        ];
        
        for (const dir of directories) {
            const fullPath = path.join(__dirname, 'backend', dir);
            if (!fs.existsSync(fullPath)) {
                this.log(`Diretório ${dir} não encontrado`, 'warning');
            } else {
                this.log(`Diretório ${dir} OK`, 'success');
            }
        }
        
        return true;
    }

    async checkAPIEndpoints() {
        this.log('Verificando endpoints da API...');
        
        try {
            // Verificar se o backend está rodando
            const response = await fetch('http://localhost:3002/api/health');
            if (response.ok) {
                this.log('API backend respondendo', 'success');
            } else {
                this.log('API backend não está respondendo corretamente', 'error');
            }
        } catch (error) {
            this.log('API backend não está acessível - verifique se está rodando', 'warning');
        }
        
        return true;
    }

    async runChecks() {
        console.log(`${colors.blue}╔═══════════════════════════════════════╗${colors.reset}`);
        console.log(`${colors.blue}║    VERIFICAÇÃO DE MIGRAÇÃO NewCAM     ║${colors.reset}`);
        console.log(`${colors.blue}╚═══════════════════════════════════════╝${colors.reset}`);
        console.log('');

        const checks = [
            this.checkEnvironmentFiles,
            this.checkDependencies,
            this.checkDatabaseStructure,
            this.checkZLMediaKit,
            this.checkPorts,
            this.checkStorage,
            this.checkAPIEndpoints
        ];

        for (const check of checks) {
            try {
                await check.call(this);
            } catch (error) {
                this.log(`Erro durante verificação: ${error.message}`, 'error');
            }
            console.log('');
        }

        // Resumo
        console.log(`${colors.blue}╔═══════════════════════════════════════╗${colors.reset}`);
        console.log(`${colors.blue}║              RESUMO                   ║${colors.reset}`);
        console.log(`${colors.blue}╚═══════════════════════════════════════╝${colors.reset}`);
        
        console.log(`✅ Sucesso: ${this.success.length}`);
        console.log(`⚠️  Avisos: ${this.warnings.length}`);
        console.log(`❌ Erros: ${this.errors.length}`);
        
        if (this.errors.length > 0) {
            console.log('');
            console.log(`${colors.red}Erros encontrados:${colors.reset}`);
            this.errors.forEach(error => console.log(`  - ${error}`));
            process.exit(1);
        }
        
        if (this.warnings.length > 0) {
            console.log('');
            console.log(`${colors.yellow}Avisos:${colors.reset}`);
            this.warnings.forEach(warning => console.log(`  - ${warning}`));
        }
        
        console.log('');
        console.log(`${colors.green}✅ Verificação concluída! Sistema pronto para migração.${colors.reset}`);
    }
}

// Executar verificação
if (require.main === module) {
    const checker = new MigrationChecker();
    checker.runChecks().catch(console.error);
}

module.exports = MigrationChecker;