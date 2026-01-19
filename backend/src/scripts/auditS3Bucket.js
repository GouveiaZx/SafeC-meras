#!/usr/bin/env node
/**
 * Script de Auditoria do Bucket S3 (Wasabi)
 *
 * Identifica:
 * - Arquivos órfãos (no S3 mas sem registro no banco)
 * - Registros fantasmas (no banco mas sem arquivo no S3)
 * - Espaço total real vs registrado
 *
 * Uso:
 *   DRY_RUN=true node backend/src/scripts/auditS3Bucket.js  # Apenas análise
 *   node backend/src/scripts/auditS3Bucket.js --delete-orphans  # Deleta órfãos
 */

import AWS from 'aws-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Configurações
const DRY_RUN = process.env.DRY_RUN === 'true';
const DELETE_ORPHANS = process.argv.includes('--delete-orphans');
const BATCH_SIZE = 1000;

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

class S3Auditor {
  constructor() {
    // Inicializar cliente S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
      endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
      region: process.env.WASABI_REGION || 'us-east-1',
      s3ForcePathStyle: true,
      signatureVersion: 'v4'
    });

    this.bucketName = process.env.WASABI_BUCKET || 'safe-cameras-03';

    // Inicializar Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Estatísticas
    this.stats = {
      s3Files: 0,
      s3TotalSize: 0,
      dbRecords: 0,
      dbTotalSize: 0,
      orphanFiles: [],
      orphanTotalSize: 0,
      phantomRecords: [],
      matchedRecords: 0
    };
  }

  /**
   * Lista TODOS os objetos no bucket (com paginação)
   */
  async listAllS3Objects(prefix = 'recordings/') {
    log(`\n📦 Listando objetos no bucket ${this.bucketName}...`, 'cyan');

    const allObjects = [];
    let continuationToken = null;
    let pageCount = 0;

    do {
      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: BATCH_SIZE
      };

      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const response = await this.s3.listObjectsV2(params).promise();

      if (response.Contents) {
        allObjects.push(...response.Contents);
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
      pageCount++;

      process.stdout.write(`\r   Página ${pageCount}, ${allObjects.length} objetos encontrados...`);

    } while (continuationToken);

    console.log(''); // Nova linha

    this.stats.s3Files = allObjects.length;
    this.stats.s3TotalSize = allObjects.reduce((sum, obj) => sum + obj.Size, 0);

    log(`   ✅ Total: ${allObjects.length} arquivos (${formatBytes(this.stats.s3TotalSize)})`, 'green');

    return allObjects;
  }

  /**
   * Busca TODOS os registros de gravações no banco
   */
  async listAllDbRecordings() {
    log(`\n📊 Buscando registros no banco de dados...`, 'cyan');

    const allRecordings = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: recordings, error } = await this.supabase
        .from('recordings')
        .select('id, camera_id, filename, s3_key, s3_url, file_size, upload_status, created_at')
        .range(offset, offset + BATCH_SIZE - 1)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Erro ao buscar registros: ${error.message}`);
      }

      if (recordings && recordings.length > 0) {
        allRecordings.push(...recordings);
        offset += recordings.length;
        process.stdout.write(`\r   ${allRecordings.length} registros carregados...`);
      }

      hasMore = recordings && recordings.length === BATCH_SIZE;
    }

    console.log(''); // Nova linha

    this.stats.dbRecords = allRecordings.length;
    this.stats.dbTotalSize = allRecordings.reduce((sum, rec) => sum + (rec.file_size || 0), 0);

    log(`   ✅ Total: ${allRecordings.length} registros (${formatBytes(this.stats.dbTotalSize)})`, 'green');

    return allRecordings;
  }

  /**
   * Compara S3 com banco de dados
   */
  async compareS3WithDb(s3Objects, dbRecordings) {
    log(`\n🔍 Comparando S3 com banco de dados...`, 'cyan');

    // Criar mapa de s3_keys do banco
    const dbS3Keys = new Set();
    const dbByS3Key = new Map();

    for (const rec of dbRecordings) {
      if (rec.s3_key) {
        dbS3Keys.add(rec.s3_key);
        dbByS3Key.set(rec.s3_key, rec);
      }
    }

    // Criar mapa de keys do S3
    const s3Keys = new Set();
    const s3ByKey = new Map();

    for (const obj of s3Objects) {
      s3Keys.add(obj.Key);
      s3ByKey.set(obj.Key, obj);
    }

    // Encontrar órfãos (no S3 mas não no DB)
    log(`\n   Procurando arquivos órfãos no S3...`, 'yellow');

    for (const obj of s3Objects) {
      if (!dbS3Keys.has(obj.Key)) {
        this.stats.orphanFiles.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified
        });
        this.stats.orphanTotalSize += obj.Size;
      } else {
        this.stats.matchedRecords++;
      }
    }

    // Encontrar fantasmas (no DB mas não no S3)
    log(`   Procurando registros fantasmas no DB...`, 'yellow');

    for (const rec of dbRecordings) {
      if (rec.s3_key && rec.upload_status === 'uploaded' && !s3Keys.has(rec.s3_key)) {
        this.stats.phantomRecords.push({
          id: rec.id,
          s3_key: rec.s3_key,
          filename: rec.filename,
          camera_id: rec.camera_id,
          created_at: rec.created_at
        });
      }
    }

    log(`   ✅ Comparação concluída`, 'green');
  }

  /**
   * Exibe relatório detalhado
   */
  printReport() {
    log(`\n${'='.repeat(60)}`, 'bright');
    log(`   RELATÓRIO DE AUDITORIA S3`, 'bright');
    log(`${'='.repeat(60)}`, 'bright');

    log(`\n📦 BUCKET S3 (${this.bucketName})`, 'cyan');
    log(`   Arquivos:     ${this.stats.s3Files.toLocaleString()}`);
    log(`   Tamanho:      ${formatBytes(this.stats.s3TotalSize)}`);

    log(`\n📊 BANCO DE DADOS`, 'cyan');
    log(`   Registros:    ${this.stats.dbRecords.toLocaleString()}`);
    log(`   Tamanho:      ${formatBytes(this.stats.dbTotalSize)}`);

    log(`\n🔗 CORRESPONDÊNCIA`, 'cyan');
    log(`   Arquivos com registro:  ${this.stats.matchedRecords.toLocaleString()}`);

    log(`\n⚠️  ARQUIVOS ÓRFÃOS (S3 sem registro no DB)`, 'yellow');
    log(`   Quantidade:   ${this.stats.orphanFiles.length.toLocaleString()}`);
    log(`   Tamanho:      ${formatBytes(this.stats.orphanTotalSize)}`);

    if (this.stats.orphanFiles.length > 0 && this.stats.orphanFiles.length <= 20) {
      log(`\n   Primeiros arquivos órfãos:`, 'yellow');
      this.stats.orphanFiles.slice(0, 20).forEach(f => {
        log(`   - ${f.key} (${formatBytes(f.size)})`);
      });
    } else if (this.stats.orphanFiles.length > 20) {
      log(`\n   Primeiros 20 arquivos órfãos:`, 'yellow');
      this.stats.orphanFiles.slice(0, 20).forEach(f => {
        log(`   - ${f.key} (${formatBytes(f.size)})`);
      });
      log(`   ... e mais ${this.stats.orphanFiles.length - 20} arquivos`);
    }

    log(`\n👻 REGISTROS FANTASMAS (DB sem arquivo no S3)`, 'red');
    log(`   Quantidade:   ${this.stats.phantomRecords.length.toLocaleString()}`);

    if (this.stats.phantomRecords.length > 0 && this.stats.phantomRecords.length <= 10) {
      log(`\n   Registros fantasmas:`, 'red');
      this.stats.phantomRecords.forEach(r => {
        log(`   - ${r.id}: ${r.filename}`);
      });
    } else if (this.stats.phantomRecords.length > 10) {
      log(`\n   Primeiros 10 registros fantasmas:`, 'red');
      this.stats.phantomRecords.slice(0, 10).forEach(r => {
        log(`   - ${r.id}: ${r.filename}`);
      });
    }

    // Calcular diferença
    const sizeDifference = this.stats.s3TotalSize - this.stats.dbTotalSize;
    log(`\n📈 DIFERENÇA`, 'bright');
    log(`   S3 - DB:      ${formatBytes(sizeDifference)} (${sizeDifference > 0 ? '+' : ''}${((sizeDifference / this.stats.s3TotalSize) * 100).toFixed(1)}%)`);
    log(`   Esperado:     ~${formatBytes(this.stats.orphanTotalSize)} em órfãos`);

    log(`\n${'='.repeat(60)}`, 'bright');
  }

  /**
   * Deleta arquivos órfãos do S3
   */
  async deleteOrphanFiles() {
    if (this.stats.orphanFiles.length === 0) {
      log(`\n✅ Nenhum arquivo órfão para deletar`, 'green');
      return;
    }

    if (DRY_RUN) {
      log(`\n🔒 DRY_RUN ativo - nenhum arquivo será deletado`, 'yellow');
      log(`   Para deletar, execute sem DRY_RUN=true`, 'yellow');
      return;
    }

    log(`\n🗑️  Deletando ${this.stats.orphanFiles.length} arquivos órfãos...`, 'red');

    const batchSize = 1000; // S3 permite deletar até 1000 por vez
    let deleted = 0;
    let errors = 0;

    for (let i = 0; i < this.stats.orphanFiles.length; i += batchSize) {
      const batch = this.stats.orphanFiles.slice(i, i + batchSize);
      const keys = batch.map(f => ({ Key: f.key }));

      try {
        const result = await this.s3.deleteObjects({
          Bucket: this.bucketName,
          Delete: {
            Objects: keys,
            Quiet: true
          }
        }).promise();

        deleted += batch.length - (result.Errors?.length || 0);
        errors += result.Errors?.length || 0;

        process.stdout.write(`\r   Deletados: ${deleted}/${this.stats.orphanFiles.length}`);

      } catch (error) {
        log(`\n   ❌ Erro ao deletar batch: ${error.message}`, 'red');
        errors += batch.length;
      }
    }

    console.log(''); // Nova linha
    log(`\n   ✅ Deletados: ${deleted} arquivos`, 'green');
    if (errors > 0) {
      log(`   ❌ Erros: ${errors} arquivos`, 'red');
    }
    log(`   💾 Espaço liberado: ${formatBytes(this.stats.orphanTotalSize)}`, 'green');
  }

  /**
   * Executa a auditoria completa
   */
  async run() {
    log(`\n${'='.repeat(60)}`, 'bright');
    log(`   AUDITORIA DO BUCKET S3 - ${new Date().toLocaleString('pt-BR')}`, 'bright');
    log(`${'='.repeat(60)}`, 'bright');

    if (DRY_RUN) {
      log(`\n🔒 Modo DRY_RUN ativo - nenhuma alteração será feita`, 'yellow');
    }

    try {
      // 1. Listar todos os objetos do S3
      const s3Objects = await this.listAllS3Objects();

      // 2. Buscar todos os registros do banco
      const dbRecordings = await this.listAllDbRecordings();

      // 3. Comparar
      await this.compareS3WithDb(s3Objects, dbRecordings);

      // 4. Exibir relatório
      this.printReport();

      // 5. Deletar órfãos se solicitado
      if (DELETE_ORPHANS) {
        await this.deleteOrphanFiles();
      }

      log(`\n✅ Auditoria concluída com sucesso!`, 'green');

    } catch (error) {
      log(`\n❌ Erro na auditoria: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    }
  }
}

// Executar
const auditor = new S3Auditor();
auditor.run();
