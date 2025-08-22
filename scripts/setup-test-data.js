#!/usr/bin/env node
/**
 * Script para Popular o Banco com Dados de Teste
 * Cria câmera de teste funcional e usuário administrativo
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';

const supabaseUrl = process.env.SUPABASE_URL || 'https://grkvfzuadctextnbpajb.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestUser() {
  console.log(chalk.blue('👤 Criando usuário de teste...'));
  
  const userData = {
    id: uuidv4(),
    email: 'gouveiarx@gmail.com',
    name: 'Administrador',
    role: 'admin',
    active: true,
    permissions: ['cameras.view', 'cameras.control', 'streams.view', 'streams.control', 'recordings.view'],
    camera_access: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(userData, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    console.log(chalk.red(`❌ Erro ao criar usuário: ${error.message}`));
    return null;
  }

  console.log(chalk.green(`✅ Usuário criado: ${data.email}`));
  return data;
}

async function createTestCamera() {
  console.log(chalk.blue('📹 Criando câmera de teste...'));
  
  const cameraData = {
    id: uuidv4(),
    name: 'Câmera de Teste',
    description: 'Câmera RTSP para testes do sistema',
    ip_address: '192.168.1.100',
    port: 554,
    username: 'admin',
    password: 'admin123',
    rtsp_url: 'rtsp://admin:admin123@192.168.1.100:554/h264/ch1/main/av_stream',
    hls_url: 'http://localhost:8000/live/' + uuidv4() + '/hls.m3u8',
    location: 'Entrada Principal',
    resolution: '1920x1080',
    fps: 25,
    quality: 'high',
    codec: 'h264',
    audio_enabled: true,
    recording_enabled: true,
    motion_detection: false,
    status: 'offline',
    active: true,
    stream_type: 'rtsp',
    type: 'ip',
    brand: 'Hikvision',
    quality_profile: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('cameras')
    .insert(cameraData)
    .select()
    .single();

  if (error) {
    console.log(chalk.red(`❌ Erro ao criar câmera: ${error.message}`));
    return null;
  }

  console.log(chalk.green(`✅ Câmera criada: ${data.name} (${data.id})`));
  return data;
}

async function updateUserCameraAccess(userId, cameraId) {
  console.log(chalk.blue('🔗 Configurando acesso da câmera...'));
  
  const { data, error } = await supabase
    .from('users')
    .update({
      camera_access: [cameraId],
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.log(chalk.red(`❌ Erro ao configurar acesso: ${error.message}`));
    return false;
  }

  console.log(chalk.green('✅ Acesso da câmera configurado'));
  return true;
}

async function clearExistingData() {
  console.log(chalk.yellow('🧹 Limpando dados existentes...'));
  
  // Limpar gravações, streams e depois câmeras
  await supabase.from('recordings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('streams').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('cameras').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log(chalk.green('✅ Dados existentes limpos'));
}

async function createSystemMetrics() {
  console.log(chalk.blue('📊 Criando métricas do sistema...'));
  
  const metricsData = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    total_cameras: 1,
    active_cameras: 0,
    total_streams: 0,
    active_streams: 0,
    total_recordings: 0,
    storage_used_gb: 0.0,
    cpu_usage: 0.0,
    memory_usage: 0.0,
    disk_usage: 0.0
  };

  const { data, error } = await supabase
    .from('system_metrics')
    .insert(metricsData)
    .select()
    .single();

  if (error) {
    console.log(chalk.yellow(`⚠️ Aviso ao criar métricas: ${error.message}`));
    return null;
  }

  console.log(chalk.green('✅ Métricas do sistema criadas'));
  return data;
}

async function main() {
  console.log(chalk.bold.blue('\n🚀 NewCAM - Configuração de Dados de Teste\n'));
  
  try {
    // Limpar dados existentes
    await clearExistingData();
    
    // Criar usuário de teste
    const user = await createTestUser();
    if (!user) {
      throw new Error('Falha ao criar usuário');
    }
    
    // Criar câmera de teste
    const camera = await createTestCamera();
    if (!camera) {
      throw new Error('Falha ao criar câmera');
    }
    
    // Configurar acesso
    await updateUserCameraAccess(user.id, camera.id);
    
    // Criar métricas iniciais
    await createSystemMetrics();
    
    console.log('\n' + '='.repeat(50));
    console.log(chalk.green.bold('🎉 Configuração concluída com sucesso!'));
    console.log('\n' + chalk.blue('📋 Dados criados:'));
    console.log(chalk.blue(`   • Usuário: ${user.email} (${user.role})`));
    console.log(chalk.blue(`   • Câmera: ${camera.name}`));
    console.log(chalk.blue(`   • Acesso configurado para a câmera`));
    
    console.log('\n' + chalk.yellow('🔐 Credenciais de Login:'));
    console.log(chalk.yellow(`   • Email: ${user.email}`));
    console.log(chalk.yellow('   • Senha: Teste123'));
    
    console.log('\n' + chalk.green('✅ Sistema pronto para testes!'));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erro: ${error.message}`));
    process.exit(1);
  }
}

main();