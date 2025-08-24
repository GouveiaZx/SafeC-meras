import S3Service from './src/services/S3Service.js';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { promises as fs } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🚀 Testing S3 upload for recording...');

const recordingId = '92d6995f-337e-492c-9826-258deb99a95f';

// Get recording from database
const { data: recording, error } = await supabase
  .from('recordings')
  .select('*')
  .eq('id', recordingId)
  .single();

if (error || !recording) {
  console.error('❌ Recording not found:', error);
  process.exit(1);
}

console.log('📊 Recording found:', recording.filename);

// Build file path
const filePath = path.resolve('../storage/www/record/live/49da82bc-3e32-4d1c-86f1-0e505813312c/2025-08-24/2025-08-24-05-04-45-0.mp4');
console.log('📁 File path:', filePath);

// Check if file exists
try {
  const stats = await fs.stat(filePath);
  console.log('✅ File exists, size:', stats.size, 'bytes');
} catch (err) {
  console.error('❌ File not found:', err.message);
  process.exit(1);
}

// Generate S3 key
const date = new Date();
const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, '0');
const day = String(date.getDate()).padStart(2, '0');
const s3Key = `recordings/${year}/${month}/${day}/${recording.camera_id}/${recording.filename}`;
console.log('🔑 S3 Key:', s3Key);

// Upload to S3
try {
  console.log('📤 Uploading to S3...');
  const result = await S3Service.uploadFile(filePath, s3Key, {
    recordingId: recordingId,
    cameraId: recording.camera_id,
    uploadedAt: new Date().toISOString()
  });
  
  console.log('✅ Upload successful!');
  console.log('📦 S3 Result:', result);
  
  // Generate S3 URL
  const s3Url = `https://${process.env.WASABI_BUCKET}.s3.${process.env.WASABI_REGION}.wasabisys.com/${s3Key}`;
  
  // Update database
  const { error: updateError } = await supabase
    .from('recordings')
    .update({
      upload_status: 'uploaded',
      s3_key: s3Key,
      s3_url: s3Url,
      uploaded_at: new Date().toISOString()
    })
    .eq('id', recordingId);
  
  if (updateError) {
    console.error('⚠️ Failed to update database:', updateError);
  } else {
    console.log('✅ Database updated successfully');
    console.log('🔗 S3 URL:', s3Url);
  }
  
  // Also update upload_queue
  const { error: queueError } = await supabase
    .from('upload_queue')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('recording_id', recordingId);
    
  if (!queueError) {
    console.log('✅ Upload queue updated');
  }
  
  console.log('\n🎉 S3 Upload Pipeline Test Complete!');
  console.log('Recording successfully uploaded to Wasabi S3');
  
} catch (uploadError) {
  console.error('❌ Upload failed:', uploadError.message);
  console.error('Stack:', uploadError.stack);
}