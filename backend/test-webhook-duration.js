// Test script to verify webhook duration extraction
import fetch from 'node-fetch';

const webhookUrl = 'http://localhost:3002/api/hook/on_record_mp4';

// Sample payload with duration field (as ZLMediaKit might send)
const testPayload = {
  act: 'on_record_mp4',
  start_time: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
  file_size: 5242880, // 5MB
  duration: 60.5, // 60.5 seconds - this is what ZLMediaKit sends
  file_name: 'test-2025-08-24-05-40-00-0.mp4', // Required field!
  file_path: '/opt/media/bin/www/record/live/test-camera/2025-08-24/test-2025-08-24-05-40-00-0.mp4',
  folder: '/opt/media/bin/www/record',
  url: 'record/live/test-camera/2025-08-24/test-2025-08-24-05-40-00-0.mp4',
  vhost: '__defaultVhost__',
  app: 'live',
  stream: 'test-camera'
};

console.log('📤 Sending test webhook with duration field...');
console.log('Payload:', JSON.stringify(testPayload, null, 2));

try {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testPayload)
  });

  const responseText = await response.text();
  console.log(`\n📨 Response Status: ${response.status}`);
  console.log('Response Body:', responseText);

  if (response.ok) {
    console.log('\n✅ Webhook processed successfully!');
    console.log('Check the backend logs to verify duration was extracted.');
  } else {
    console.log('\n❌ Webhook failed');
  }
} catch (error) {
  console.error('❌ Error sending webhook:', error.message);
}