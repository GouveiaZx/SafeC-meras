#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

// Arquivo de teste HEVC que encontramos
const inputFile = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\live\\b533e650-4035-45fa-aa61-2425704f5376\\2025-07-29\\2025-07-29-20-35-26-0.mp4';
const outputFile = 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage\\www\\record\\converted\\test_h264.mp4';

console.log('🎬 Teste de conversão HEVC para H.264');
console.log(`📥 Entrada: ${inputFile}`);
console.log(`📤 Saída: ${outputFile}`);

// Verificar se arquivo de entrada existe
try {
  await fs.access(inputFile);
  console.log('✅ Arquivo de entrada encontrado');
} catch (error) {
  console.error('❌ Arquivo de entrada não encontrado:', error.message);
  process.exit(1);
}

// Criar diretório de saída
const outputDir = path.dirname(outputFile);
try {
  await fs.mkdir(outputDir, { recursive: true });
  console.log('📁 Diretório de saída criado');
} catch (error) {
  console.error('❌ Erro ao criar diretório de saída:', error.message);
  process.exit(1);
}

// Verificar codec do arquivo de entrada
console.log('🔍 Verificando codec do arquivo...');
const zlmprobe = spawn('zlmprobe', [
  '-v', 'error',
  '-select_streams', 'v:0',
  '-show_entries', 'stream=codec_name',
  '-of', 'csv=p=0',
  inputFile
]);

let codecOutput = '';
zlmprobe.stdout.on('data', (data) => {
  codecOutput += data.toString();
});

zlmprobe.on('close', (code) => {
  if (code === 0) {
    const codec = codecOutput.trim();
    console.log(`📹 Codec detectado: ${codec}`);
    
    if (codec === 'hevc') {
      console.log('🔄 Iniciando conversão HEVC para H.264...');
      convertVideo();
    } else {
      console.log(`⏭️  Arquivo já está em ${codec}, não precisa converter`);
    }
  } else {
    console.error('❌ Erro ao verificar codec');
    process.exit(1);
  }
});

zlmprobe.on('error', (error) => {
  console.error('❌ Erro ao executar zlmprobe:', error.message);
  process.exit(1);
});

function convertVideo() {
  const startTime = Date.now();
  
  const zlmediakit = spawn('zlmediakit', [
    '-i', inputFile,
    '-c:v', 'libx264',           // Codec de vídeo H.264
    '-preset', 'medium',         // Preset de velocidade/qualidade
    '-crf', '23',               // Qualidade (18-28, menor = melhor qualidade)
    '-c:a', 'aac',              // Codec de áudio AAC
    '-b:a', '128k',             // Bitrate do áudio
    '-movflags', '+faststart',   // Otimizar para streaming web
    '-y',                       // Sobrescrever arquivo de saída
    outputFile
  ]);

  let errorOutput = '';
  let progressOutput = '';
  
  zlmediakit.stderr.on('data', (data) => {
    const output = data.toString();
    errorOutput += output;
    progressOutput += output;
    
    // Mostrar progresso
    if (output.includes('time=')) {
      const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch) {
        process.stdout.write(`\r⏱️  Progresso: ${timeMatch[1]}`);
      }
    }
  });

  zlmediakit.on('close', (code) => {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n');
    
    if (code === 0) {
      console.log('✅ Conversão concluída com sucesso!');
      console.log(`⏱️  Tempo total: ${duration}s`);
      
      // Verificar arquivo de saída
      fs.stat(outputFile).then(stats => {
        console.log(`📊 Tamanho do arquivo convertido: ${Math.round(stats.size / 1024 / 1024)}MB`);
        console.log(`📁 Arquivo salvo em: ${outputFile}`);
        
        // Verificar codec do arquivo convertido
        console.log('🔍 Verificando codec do arquivo convertido...');
        const verifyProbe = spawn('zlmprobe', [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=codec_name',
          '-of', 'csv=p=0',
          outputFile
        ]);
        
        let verifyOutput = '';
        verifyProbe.stdout.on('data', (data) => {
          verifyOutput += data.toString();
        });
        
        verifyProbe.on('close', (verifyCode) => {
          if (verifyCode === 0) {
            console.log(`✅ Codec do arquivo convertido: ${verifyOutput.trim()}`);
            console.log('🎉 Teste de conversão bem-sucedido!');
          }
        });
        
      }).catch(err => {
        console.error('❌ Erro ao verificar arquivo de saída:', err.message);
      });
      
    } else {
      console.error('❌ Erro na conversão!');
      console.error('📋 Log de erro:');
      console.error(errorOutput);
      process.exit(1);
    }
  });

  zlmediakit.on('error', (error) => {
    console.error('❌ Erro ao executar ZLMediaKit:', error.message);
    process.exit(1);
  });
}