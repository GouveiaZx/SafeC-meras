/**
 * Script para testar gravações no banco de dados
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRecordings() {
  try {
    console.log('🔍 Buscando gravações no banco de dados...');
    
    const { data: recordings, error } = await supabase
      .from('recordings')
      .select('id, filename, file_path, camera_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ Erro ao buscar gravações:', error);
      return;
    }
    
    console.log(`✅ Encontradas ${recordings.length} gravações:`);
    recordings.forEach((rec, index) => {
      console.log(`${index + 1}. ID: ${rec.id}`);
      console.log(`   Filename: ${rec.filename}`);
      console.log(`   File Path: ${rec.file_path}`);
      console.log(`   Camera ID: ${rec.camera_id}`);
      console.log(`   Created: ${rec.created_at}`);
      console.log('---');
    });
    
    if (recordings.length > 0) {
      const firstRecording = recordings[0];
      console.log(`\n🎬 URL de teste para primeira gravação:`);
      console.log(`http://localhost:3002/api/recordings/${firstRecording.id}/video`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

testRecordings();