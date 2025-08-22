import streamingService from '../services/StreamingService.js';
import cameraMonitoringService from '../services/CameraMonitoringService.js';
import MetricsService from '../services/MetricsService.js';
import SegmentationService from '../services/SegmentationService.js';
import { injectSegmentationService } from '../routes/segmentation.js';
import schedulerService from './scheduler.js';
import recordingJobs from '../jobs/recordingJobs.js';
import systemJobs from '../jobs/systemJobs.js';
import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('coreServices');

let globalSegmentationService = null;

/**
 * Inicializa todos os serviços principais do sistema
 */
export async function initializeCoreServices() {
  try {
    logger.info('Iniciando inicialização dos serviços principais...');
    
    // Inicializar SchedulerService
    logger.info('Inicializando SchedulerService...');
    await schedulerService.initialize();
    logger.info('SchedulerService inicializado com sucesso');
    
    // Inicializar StreamingService
    logger.info('Inicializando StreamingService...');
    await streamingService.initialize();
    logger.info('StreamingService inicializado com sucesso');
    
    // Inicializar CameraMonitoringService
    logger.info('Inicializando CameraMonitoringService...');
    await cameraMonitoringService.initialize();
    logger.info('CameraMonitoringService inicializado com sucesso');
    
    // Inicializar MetricsService
    logger.info('Inicializando MetricsService...');
    await MetricsService.initialize();
    logger.info('MetricsService inicializado com sucesso');
    
    // Inicializar SegmentationService
    logger.info('Inicializando SegmentationService...');
    globalSegmentationService = new SegmentationService();
    await globalSegmentationService.initialize();
    
    // Injetar SegmentationService nas rotas
    injectSegmentationService(globalSegmentationService);
    logger.info('SegmentationService inicializado e injetado com sucesso');
    
    // Inicializar jobs de gravação
    logger.info('Inicializando jobs de gravação...');
    await recordingJobs.initialize();
    logger.info('Jobs de gravação inicializados com sucesso');
    
    // Inicializar jobs do sistema
    logger.info('Inicializando jobs do sistema...');
    await systemJobs.initialize();
    logger.info('Jobs do sistema inicializados com sucesso');
    
    logger.info('Todos os serviços principais foram inicializados com sucesso');
    
  } catch (error) {
    logger.error('Erro durante a inicialização dos serviços principais:', error);
    throw error;
  }
}

/**
 * Finaliza todos os serviços principais graciosamente
 */
export async function shutdownCoreServices() {
  try {
    logger.info('Iniciando finalização dos serviços principais...');
    
    // Finalizar jobs de gravação
    logger.info('Finalizando jobs de gravação...');
    await recordingJobs.shutdown();
    logger.info('Jobs de gravação finalizados');
    
    // Finalizar jobs do sistema
    logger.info('Finalizando jobs do sistema...');
    await systemJobs.shutdown();
    logger.info('Jobs do sistema finalizados');
    
    // Finalizar SegmentationService
    if (globalSegmentationService) {
      logger.info('Finalizando SegmentationService...');
      await globalSegmentationService.shutdown();
      globalSegmentationService = null;
      logger.info('SegmentationService finalizado');
    }
    
    // Finalizar MetricsService
    logger.info('Finalizando MetricsService...');
    await MetricsService.shutdown();
    logger.info('MetricsService finalizado');
    
    // Finalizar CameraMonitoringService
    logger.info('Finalizando CameraMonitoringService...');
    await cameraMonitoringService.shutdown();
    logger.info('CameraMonitoringService finalizado');
    
    // Finalizar StreamingService
    logger.info('Finalizando StreamingService...');
    await streamingService.shutdown();
    logger.info('StreamingService finalizado');
    
    // Finalizar SchedulerService por último
    logger.info('Finalizando SchedulerService...');
    await schedulerService.shutdown();
    logger.info('SchedulerService finalizado');
    
    logger.info('Todos os serviços principais foram finalizados com sucesso');
    
  } catch (error) {
    logger.error('Erro durante a finalização dos serviços principais:', error);
    throw error;
  }
}

/**
 * Retorna o SegmentationService global
 */
export function getSegmentationService() {
  return globalSegmentationService;
}