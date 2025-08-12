import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRealWebhook() {
  console.log('🧪 Testando webhook com dados reais...\n');

  // Dados reais simulando uma gravação do ZLMediaKit
  const realWebhookData = {
    start_time: Math.floor(Date.now() / 1000) - 1800, // 30 minutos atrás
    file_size: 52428800, // ~50MB
    time_len: 1800, // 30 minutos exatos
    file_path: 'live/e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36/2025-08-10/2025-08-10-12-00-00-0.mp4',
    file_name: '2025-08-10-12-00-00-0.mp4',
    folder: 'live/e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36/2025-08-10',
    url: 'record/live/e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36/2025-08-10/2025-08-10-12-00-00-0.mp4',
    app: 'live',
    stream: 'e4c3adb3-bc1a-4ed6-a92d-cb5f23a27e36'
  };

  console.log('📤 Enviando webhook com dados:');
  console.log(JSON.stringify(realWebhookData, null, 2));

  try {
    const response = await fetch('http://localhost:3002/api/webhooks/on_record_mp4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(realWebhookData)
    });

    const result = await response.json();
    console.log('\n✅ Resposta do webhook:', result);

    // Aguardar e verificar se a gravação foi criada no banco
    console.log('\n⏳ Aguardando 3 segundos para verificar no banco...');
    setTimeout(async () => {
      try {
        const { data: recordings, error } = await supabase
          .from('recordings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) {
          console.error('❌ Erro ao verificar gravações:', error);
          return;
        }

        console.log('\n📊 Gravações no banco:');
        recordings.forEach(rec => {
          console.log(`   📹 ${rec.camera_id} - ${rec.filename} - ${new Date(rec.created_at).toLocaleString()}`);
        });

      } catch (err) {
        console.error('❌ Erro na verificação:', err);
      }
    }, 3000);

  } catch (error) {
    console.error('❌ Erro ao testar webhook:', error);
  }
}

testRealWebhook();