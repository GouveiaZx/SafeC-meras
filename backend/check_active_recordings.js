/**
 * Script para verificar gravações ativas
 */

import { supabaseAdmin } from './src/config/database.js';
import { config } from 'dotenv';

config();

async function checkActiveRecordings() {
  try {
    console.log('🎥 Verificando gravações ativas...');
    
    const { data: activeRecordings, error } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .eq('status', 'recording');
    
    if (error) {
      throw error;
    }
    
    console.log(`\n📊 Gravações ativas: ${activeRecordings.length}`);
    
    if (activeRecordings.length > 0) {
      activeRecordings.forEach((recording, index) => {
        console.log(`\n${index + 1}. ID: ${recording.id}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Iniciada: ${recording.created_at}`);
        console.log(`   Arquivo: ${recording.file_path || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️ Nenhuma gravação ativa encontrada');
      console.log('\n💡 Isso pode indicar que:');
      console.log('   1. As câmeras não estão gerando gravações automáticas');
      console.log('   2. O hook on_stream_changed não está sendo chamado');
      console.log('   3. Há algum erro no processo de gravação automática');
    }
    
    // Verificar também gravações recentes
    console.log('\n🕐 Verificando gravações das últimas 2 horas...');
    
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: recentRecordings, error: recentError } = await supabaseAdmin
      .from('recordings')
      .select('*')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false });
    
    if (recentError) {
      throw recentError;
    }
    
    console.log(`\n📈 Gravações das últimas 2 horas: ${recentRecordings.length}`);
    
    if (recentRecordings.length > 0) {
      recentRecordings.forEach((recording, index) => {
        console.log(`\n${index + 1}. ID: ${recording.id}`);
        console.log(`   Câmera: ${recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Criada: ${recording.created_at}`);
        console.log(`   Duração: ${recording.duration || 0}s`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar gravações:', error);
  }
}

checkActiveRecordings();