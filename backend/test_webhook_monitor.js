import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Log de webhooks recebidos
const logFile = path.join(process.cwd(), 'webhook_logs.txt');

function logWebhook(hookName, data) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${hookName}: ${JSON.stringify(data, null, 2)}\n\n`;
  fs.appendFileSync(logFile, logEntry);
  console.log(`📡 Webhook ${hookName} recebido:`, data);
}

// Monitor de webhook on_record_mp4
app.post('/api/webhooks/on_record_mp4', (req, res) => {
  logWebhook('on_record_mp4', req.body);
  res.json({ code: 0, msg: 'success' });
});

// Monitor de webhook on_record_ts
app.post('/api/webhooks/on_record_ts', (req, res) => {
  logWebhook('on_record_ts', req.body);
  res.json({ code: 0, msg: 'success' });
});

// Monitor de webhook on_stream_changed
app.post('/api/webhooks/on_stream_changed', (req, res) => {
  logWebhook('on_stream_changed', req.body);
  res.json({ code: 0, msg: 'success' });
});

// Monitor de todos os outros webhooks
app.post('/api/webhooks/*', (req, res) => {
  const hookName = req.path.split('/').pop();
  logWebhook(hookName, req.body);
  res.json({ code: 0, msg: 'success' });
});

const PORT = 3003; // Porta diferente para não conflitar
app.listen(PORT, () => {
  console.log(`🔍 Monitor de webhooks rodando na porta ${PORT}`);
  console.log(`📝 Logs salvos em: ${logFile}`);
  console.log('\n🎯 Para testar, configure o ZLMediaKit para usar:');
  console.log(`   on_record_mp4=http://localhost:${PORT}/api/webhooks/on_record_mp4`);
  console.log(`   on_record_ts=http://localhost:${PORT}/api/webhooks/on_record_ts`);
  console.log(`   on_stream_changed=http://localhost:${PORT}/api/webhooks/on_stream_changed`);
});