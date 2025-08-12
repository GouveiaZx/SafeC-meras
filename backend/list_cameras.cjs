const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ixqjqfkpqjqjqjqjqjqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4cWpxZmtwcWpxanFqcWpxanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTYyMDcsImV4cCI6MjA3MDMzMjIwN30.QfHwZ6e5CIv6tZNr4i_3jXzTtHj_yc89J0m7qZhMg54';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listCameras() {
  try {
    const { data: cameras, error } = await supabase
      .from('cameras')
      .select('*');
    
    if (error) {
      console.error('❌ Erro ao buscar câmeras:', error);
      return;
    }
    
    console.log('📹 Câmeras encontradas:');
    cameras.forEach(cam => {
      console.log(`- ${cam.name} (${cam.id}): ${cam.rtsp_url}`);
    });
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

listCameras();