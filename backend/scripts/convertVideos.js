#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Configurar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configurações
const RECORDINGS_PATH = process.env.RECORDINGS_PATH || 'C:\\Users\\GouveiaRx\\Downloads\\NewCAM\\storage';
const CONVERTED_PATH = path.join(RECORDINGS_PATH, '..', 'converted');
const BATCH_SIZE = 5; // Processar 5 vídeos por vez

class VideoConverter {
  constructor() {
    this.processedCount = 0;
    this.errorCount = 0;
    this.skippedCount = 0;
  }

  /**
   * Verificar se ZLMediaKit está disponível
   */
  async checkZLMediaKit() {
    return new Promise((resolve) => {
      const zlmediakit = spawn('zlmediakit', ['-version']);
      zlmediakit.on('close', (code) => {
        resolve(code === 0);
      });
      zlmediakit.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Verificar codec do vídeo
   */
  async getVideoCodec(filePath) {
    return new Promise((resolve, reject) => {
      const zlmprobe = spawn('zlmprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'csv=p=0',
        filePath
      ]);

      let output = '';
      zlmprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      zlmprobe.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`zlmprobe failed with code ${code}`));
        }
      });

      zlmprobe.on('error', reject);
    });
  }

  /**
   * Converter vídeo HEVC para H.264
   */
  async convertVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      console.log(`🔄 Convertendo: ${path.basename(inputPath)}`);
      
      const zlmediakit = spawn('zlmediakit', [
        '-i', inputPath,
        '-c:v', 'libx264',           // Codec de vídeo H.264
        '-preset', 'medium',         // Preset de velocidade/qualidade
        '-crf', '23',               // Qualidade (18-28, menor = melhor qualidade)
        '-c:a', 'aac',              // Codec de áudio AAC
        '-b:a', '128k',             // Bitrate do áudio
        '-movflags', '+faststart',   // Otimizar para streaming web
        '-y',                       // Sobrescrever arquivo de saída
        outputPath
      ]);

      let errorOutput = '';
      zlmediakit.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      zlmediakit.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Convertido: ${path.basename(outputPath)}`);
          resolve();
        } else {
          console.error(`❌ Erro na conversão: ${path.basename(inputPath)}`);
          console.error(errorOutput);
          reject(new Error(`ZLMediaKit failed with code ${code}`));
        }
      });

      zlmediakit.on('error', (error) => {
        console.error(`❌ Erro ao executar ZLMediaKit: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Atualizar caminho do arquivo no banco de dados
   */
  async updateRecordingPath(originalPath, convertedPath) {
    try {
      const relativePath = path.relative(RECORDINGS_PATH, convertedPath);
      
      const { error } = await supabase
        .from('recordings')
        .update({
          file_path: relativePath,
          localPath: convertedPath,
          codec: 'h264',
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .or(`file_path.eq.${path.relative(RECORDINGS_PATH, originalPath)},localPath.eq.${originalPath}`);

      if (error) {
        console.error(`❌ Erro ao atualizar banco de dados:`, error);
        throw error;
      }

      console.log(`📝 Banco atualizado para: ${path.basename(convertedPath)}`);
    } catch (error) {
      console.error(`❌ Erro ao atualizar registro no banco:`, error);
      throw error;
    }
  }

  /**
   * Processar um arquivo de vídeo
   */
  async processVideo(filePath) {
    try {
      // Verificar se arquivo existe
      await fs.access(filePath);
      
      // Verificar codec
      const codec = await this.getVideoCodec(filePath);
      
      if (codec !== 'hevc') {
        console.log(`⏭️  Pulando ${path.basename(filePath)} - já é ${codec}`);
        this.skippedCount++;
        return;
      }

      // Criar diretório de saída se não existir
      const outputDir = path.join(CONVERTED_PATH, path.relative(RECORDINGS_PATH, path.dirname(filePath)));
      await fs.mkdir(outputDir, { recursive: true });
      
      // Definir caminho de saída
      const fileName = path.basename(filePath, '.mp4');
      const outputPath = path.join(outputDir, `${fileName}_h264.mp4`);
      
      // Verificar se já foi convertido
      try {
        await fs.access(outputPath);
        console.log(`⏭️  Já convertido: ${path.basename(outputPath)}`);
        this.skippedCount++;
        return;
      } catch {
        // Arquivo não existe, prosseguir com conversão
      }
      
      // Converter vídeo
      await this.convertVideo(filePath, outputPath);
      
      // Atualizar banco de dados
      await this.updateRecordingPath(filePath, outputPath);
      
      this.processedCount++;
      
    } catch (error) {
      console.error(`❌ Erro ao processar ${path.basename(filePath)}:`, error.message);
      this.errorCount++;
    }
  }

  /**
   * Encontrar todos os arquivos MP4
   */
  async findMP4Files(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findMP4Files(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao ler diretório ${dir}:`, error.message);
    }
    
    return files;
  }

  /**
   * Processar arquivos em lotes
   */
  async processBatch(files) {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      console.log(`\n📦 Processando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)}`);
      
      await Promise.all(batch.map(file => this.processVideo(file)));
      
      // Pequena pausa entre lotes
      if (i + BATCH_SIZE < files.length) {
        console.log('⏸️  Pausa de 2 segundos...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Executar conversão
   */
  async run() {
    console.log('🎬 Iniciando conversão de vídeos HEVC para H.264\n');
    
    // Verificar ZLMediaKit
    const hasZLMediaKit = await this.checkZLMediaKit();
    if (!hasZLMediaKit) {
      console.error('❌ ZLMediaKit não encontrado. Instale o ZLMediaKit para continuar.');
      process.exit(1);
    }
    console.log('✅ ZLMediaKit encontrado');
    
    // Criar diretório de conversão
    await fs.mkdir(CONVERTED_PATH, { recursive: true });
    console.log(`📁 Diretório de conversão: ${CONVERTED_PATH}`);
    
    // Encontrar arquivos MP4
    const absolutePath = path.resolve(RECORDINGS_PATH);
    console.log(`🔍 Buscando arquivos MP4 em: ${absolutePath}`);
    console.log(`📂 Caminho relativo: ${RECORDINGS_PATH}`);
    const mp4Files = await this.findMP4Files(RECORDINGS_PATH);
    
    if (mp4Files.length === 0) {
      console.log('📭 Nenhum arquivo MP4 encontrado.');
      return;
    }
    
    console.log(`📹 Encontrados ${mp4Files.length} arquivos MP4\n`);
    
    // Processar arquivos
    const startTime = Date.now();
    await this.processBatch(mp4Files);
    const endTime = Date.now();
    
    // Relatório final
    console.log('\n📊 Relatório de Conversão:');
    console.log(`✅ Convertidos: ${this.processedCount}`);
    console.log(`⏭️  Pulados: ${this.skippedCount}`);
    console.log(`❌ Erros: ${this.errorCount}`);
    console.log(`⏱️  Tempo total: ${Math.round((endTime - startTime) / 1000)}s`);
    
    if (this.processedCount > 0) {
      console.log('\n🎉 Conversão concluída! Os vídeos agora devem ser compatíveis com navegadores web.');
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url.startsWith('file:')) {
  const converter = new VideoConverter();
  converter.run().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

export default VideoConverter;