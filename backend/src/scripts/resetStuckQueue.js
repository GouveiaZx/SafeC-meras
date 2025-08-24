import { createClient } from '@supabase/supabase-js';

// Use environment variables or hardcoded values
const SUPABASE_URL = 'https://grkvfzuadctextnbpajb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyNDIzOCwiZXhwIjoyMDY4ODAwMDIzOH0.XJoPu5InA_s3pfryZfSChBqZnu7zBV3vwH7ZM4jf04M';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function resetStuckQueue() {
  console.log('🔧 Resetting stuck queue items...\n');

  try {
    // 1. Find all stuck items
    const { data: stuckItems, error: fetchError } = await supabase
      .from('upload_queue')
      .select('*')
      .in('status', ['processing', 'pending', 'retrying'])
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Error fetching stuck items:', fetchError);
      process.exit(1);
    }

    console.log(`📊 Found ${stuckItems?.length || 0} stuck items in queue\n`);

    if (!stuckItems || stuckItems.length === 0) {
      console.log('✅ No stuck items found. Queue is clean!');
      process.exit(0);
    }

    // 2. Reset each item to pending with retry count = 0
    for (const item of stuckItems) {
      console.log(`Resetting item ${item.id}:`);
      console.log(`  Recording ID: ${item.recording_id}`);
      console.log(`  Current Status: ${item.status}`);
      console.log(`  Current Retry Count: ${item.retry_count}`);
      
      const { error: updateError } = await supabase
        .from('upload_queue')
        .update({
          status: 'pending',
          retry_count: 0,
          started_at: null,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (updateError) {
        console.error(`  ❌ Failed to reset: ${updateError.message}`);
      } else {
        console.log(`  ✅ Reset to pending status`);
      }
      console.log('');
    }

    // 3. Also reset recordings upload_status
    console.log('📋 Resetting recording upload statuses...');
    const recordingIds = stuckItems.map(item => item.recording_id);
    
    const { error: recordingError } = await supabase
      .from('recordings')
      .update({
        upload_status: 'pending',
        upload_attempts: 0,
        updated_at: new Date().toISOString()
      })
      .in('id', recordingIds);

    if (recordingError) {
      console.error('❌ Failed to reset recording statuses:', recordingError);
    } else {
      console.log(`✅ Reset ${recordingIds.length} recording statuses to pending`);
    }

    // 4. Verify the reset
    const { data: verifyQueue, error: verifyError } = await supabase
      .from('upload_queue')
      .select('status')
      .eq('status', 'pending');

    if (verifyError) {
      console.error('❌ Error verifying reset:', verifyError);
    } else {
      console.log(`\n✅ Queue reset complete! ${verifyQueue.length} items ready for processing`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

resetStuckQueue();