const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://yfnqzjcqtqjqzjcqtqjq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmbnF6amNxdHFqcXpqY3F0cWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTU5NzQsImV4cCI6MjA3MDMzMTk3NH0.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8'
);

async function checkRecordings() {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Erro ao buscar gravações:', error);
      return;
    }

    console.log('\n=== GRAVAÇÕES RECENTES ===');
    if (data && data.length > 0) {
      data.forEach((recording, index) => {
        console.log(`${index + 1}. ${recording.filename || 'N/A'}`);
        console.log(`   Camera: ${recording.camera_id}`);
        console.log(`   Status: ${recording.status}`);
        console.log(`   Criado: ${new Date(recording.created_at).toLocaleString('pt-BR')}`);
        console.log(`   Caminho: ${recording.file_path || 'N/A'}`);
        console.log('---');
      });
    } else {
      console.log('Nenhuma gravação encontrada.');
    }
  } catch (err) {
    console.error('Erro:', err.message);
  }
}

checkRecordings();