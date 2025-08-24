import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://grkvfzuadctextnbpajb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMjM4fQ.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M'
);

async function checkQueue() {
  // Check stuck queue items
  const { data: stuckItems, error: queueError } = await supabase
    .from('upload_queue')
    .select('*')
    .in('status', ['processing', 'pending', 'retrying'])
    .order('created_at', { ascending: false });

  console.log('📊 Upload Queue Status:');
  console.log('Total stuck items:', stuckItems?.length || 0);

  if (stuckItems && stuckItems.length > 0) {
    stuckItems.forEach(item => {
      const age = Date.now() - new Date(item.updated_at).getTime();
      const ageMinutes = Math.floor(age / 60000);
      console.log('---');
      console.log('ID:', item.id);
      console.log('Recording ID:', item.recording_id);
      console.log('Status:', item.status);
      console.log('Retry Count:', item.retry_count);
      console.log('Age:', ageMinutes, 'minutes');
      console.log('Started At:', item.started_at || 'Never');
    });
  }

  // Check recordings with pending upload
  const { data: pendingRecordings } = await supabase
    .from('recordings')
    .select('id, filename, upload_status, duration, created_at')
    .in('upload_status', ['pending', 'queued', 'uploading'])
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n📹 Pending Recordings:');
  pendingRecordings?.forEach(rec => {
    console.log(`- ${rec.filename} | Status: ${rec.upload_status} | Duration: ${rec.duration || '--'}`);
  });

  process.exit(0);
}

checkQueue();
