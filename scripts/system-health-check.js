#!/usr/bin/env node
/**
 * Script de Verificação de Saúde do Sistema NewCAM
 * Verifica se todos os serviços estão funcionando corretamente
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';

const config = {
  backend: 'http://localhost:3002',
  frontend: 'http://localhost:5173',
  zlmediakit: 'http://localhost:8000',
  supabase: {
    url: process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE'
  }
};

async function checkService(name, url, timeout = 5000) {
  try {
    const response = await axios.get(url, { timeout });
    console.log(chalk.green(`✅ ${name}: OK (${response.status})`));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ ${name}: FALHOU (${error.message})`));
    return false;
  }
}

async function checkSupabase() {
  try {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey);
    const { data, error } = await supabase.from('cameras').select('count').limit(1);
    
    if (error) {
      console.log(chalk.red(`❌ Supabase: FALHOU (${error.message})`));
      return false;
    }
    
    console.log(chalk.green('✅ Supabase: OK (conexão estabelecida)'));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ Supabase: FALHOU (${error.message})`));
    return false;
  }
}

async function checkZLMediaKit() {
  try {
    const response = await axios.post(`${config.zlmediakit}/index/api/getServerConfig`, {
      secret: '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK'
    }, { timeout: 5000 });
    
    console.log(chalk.green(`✅ ZLMediaKit: OK (${response.status})`));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ ZLMediaKit: FALHOU (${error.message})`));
    return false;
  }
}

async function main() {
  console.log(chalk.bold.blue('\n🔍 NewCAM - Verificação de Saúde do Sistema\n'));
  
  const results = [];
  
  // Verificar serviços básicos
  results.push(await checkService('Backend API', `${config.backend}/health`));
  results.push(await checkService('Frontend', config.frontend));
  
  // Verificar serviços especializados
  results.push(await checkZLMediaKit());
  results.push(await checkSupabase());
  
  // Resumo
  const successCount = results.filter(r => r).length;
  const totalCount = results.length;
  
  console.log('\n' + '='.repeat(50));
  
  if (successCount === totalCount) {
    console.log(chalk.green.bold(`🎉 Todos os serviços estão funcionando! (${successCount}/${totalCount})`));
    console.log(chalk.green('\n✅ Sistema NewCAM operacional'));
    console.log(chalk.blue('\n🌐 URLs de Acesso:'));
    console.log(chalk.blue(`   • Frontend: ${config.frontend}`));
    console.log(chalk.blue(`   • Backend API: ${config.backend}/api`));
    console.log(chalk.blue(`   • ZLMediaKit: ${config.zlmediakit}`));
  } else {
    console.log(chalk.red.bold(`⚠️  Alguns serviços falharam (${successCount}/${totalCount})`));
    console.log(chalk.yellow('\n📋 Verificar:'));
    console.log(chalk.yellow('   1. Docker containers estão rodando'));
    console.log(chalk.yellow('   2. Variáveis de ambiente configuradas'));
    console.log(chalk.yellow('   3. Portas não estão em uso'));
  }
  
  process.exit(successCount === totalCount ? 0 : 1);
}

main().catch(error => {
  console.error(chalk.red('❌ Erro crítico:', error.message));
  process.exit(1);
});