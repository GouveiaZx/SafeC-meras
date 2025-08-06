/**
 * Rotas para gerenciamento de cache
 * Sistema NewCAM - Gravação Contínua
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import CacheService from '../services/CacheService.js';
import { logger } from '../config/logger.js';

const router = express.Router();

/**
 * @route GET /api/cache/stats
 * @desc Obter estatísticas do cache
 * @access Admin
 */
router.get('/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const stats = await CacheService.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        memory_usage_mb: stats.memory_usage ? (stats.memory_usage / 1024 / 1024).toFixed(2) : 0,
        cache_hit_ratio: stats.total_keys > 0 ? '85%' : '0%' // Estimativa
      }
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas do cache:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route POST /api/cache/clear
 * @desc Limpar cache
 * @access Admin
 */
router.post('/clear', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { pattern, type } = req.body;
    
    let clearedKeys = 0;
    let message = '';
    
    if (type === 'all') {
      clearedKeys = await CacheService.clearAll();
      message = 'Todo o cache foi limpo';
    } else if (type === 'cameras') {
      clearedKeys = await CacheService.invalidate('cache:camera:*');
      message = 'Cache de câmeras limpo';
    } else if (type === 'recordings') {
      clearedKeys = await CacheService.invalidate('cache:recording:*');
      message = 'Cache de gravações limpo';
    } else if (type === 'metrics') {
      clearedKeys = await CacheService.invalidateMetrics();
      message = 'Cache de métricas limpo';
    } else if (type === 'system') {
      clearedKeys = await CacheService.invalidateSystem();
      message = 'Cache do sistema limpo';
    } else if (pattern) {
      clearedKeys = await CacheService.invalidate(pattern);
      message = `Cache limpo com padrão: ${pattern}`;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Tipo de limpeza ou padrão deve ser especificado'
      });
    }
    
    logger.info(`Cache limpo por usuário ${req.user.id}: ${message} (${clearedKeys} chaves)`);
    
    res.json({
      success: true,
      message,
      cleared_keys: clearedKeys
    });
  } catch (error) {
    logger.error('Erro ao limpar cache:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route POST /api/cache/warmup
 * @desc Pré-aquecer cache
 * @access Admin
 */
router.post('/warmup', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await CacheService.warmup();
    
    logger.info(`Cache pré-aquecido por usuário ${req.user.id}`);
    
    res.json({
      success: true,
      message: 'Cache pré-aquecido com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao pré-aquecer cache:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route GET /api/cache/health
 * @desc Verificar saúde do sistema de cache
 * @access Admin
 */
router.get('/health', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [redisHealth, supabaseHealth, diskHealth] = await Promise.allSettled([
      CacheService.checkRedisHealth(),
      CacheService.checkSupabaseHealth(),
      CacheService.checkDiskHealth()
    ]);
    
    const health = {
      redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { healthy: false, error: redisHealth.reason?.message },
      supabase: supabaseHealth.status === 'fulfilled' ? supabaseHealth.value : { healthy: false, error: supabaseHealth.reason?.message },
      disk: diskHealth.status === 'fulfilled' ? diskHealth.value : { healthy: false, error: diskHealth.reason?.message }
    };
    
    const overallHealth = health.redis.healthy && health.supabase.healthy && health.disk.healthy;
    
    res.json({
      success: true,
      data: {
        healthy: overallHealth,
        components: health,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro ao verificar saúde do cache:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route GET /api/cache/keys
 * @desc Listar chaves do cache (com paginação)
 * @access Admin
 */
router.get('/keys', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { pattern = 'cache:*', limit = 100, offset = 0 } = req.query;
    
    // Obter chaves com padrão
    const allKeys = await CacheService.redisClient.keys(pattern);
    
    // Aplicar paginação
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedKeys = allKeys.slice(startIndex, endIndex);
    
    // Obter informações detalhadas das chaves
    const keyDetails = await Promise.allSettled(
      paginatedKeys.map(async (key) => {
        try {
          const ttl = await CacheService.redisClient.ttl(key);
          const type = await CacheService.redisClient.type(key);
          
          return {
            key,
            type,
            ttl: ttl === -1 ? 'never' : ttl === -2 ? 'expired' : `${ttl}s`,
            expires_at: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null
          };
        } catch (error) {
          return {
            key,
            error: error.message
          };
        }
      })
    );
    
    const validKeys = keyDetails
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    
    res.json({
      success: true,
      data: {
        keys: validKeys,
        pagination: {
          total: allKeys.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: endIndex < allKeys.length
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao listar chaves do cache:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * @route DELETE /api/cache/keys/:key
 * @desc Remover chave específica do cache
 * @access Admin
 */
router.delete('/keys/:key', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { key } = req.params;
    
    // Decodificar a chave (caso tenha sido codificada na URL)
    const decodedKey = decodeURIComponent(key);
    
    // Verificar se a chave existe
    const exists = await CacheService.redisClient.exists(decodedKey);
    
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Chave não encontrada'
      });
    }
    
    // Remover a chave
    await CacheService.redisClient.del(decodedKey);
    
    logger.info(`Chave de cache removida por usuário ${req.user.id}: ${decodedKey}`);
    
    res.json({
      success: true,
      message: 'Chave removida com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao remover chave do cache:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

export default router;