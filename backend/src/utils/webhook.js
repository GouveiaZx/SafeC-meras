import axios from 'axios';

/**
 * Enviar webhook para URL externa
 * @param {string} url - URL do webhook
 * @param {Object} data - Dados a serem enviados
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Object>} Resultado do envio
 */
export const sendWebhook = async (url, data, options = {}) => {
  try {
    const config = {
      method: 'POST',
      url,
      data,
      timeout: options.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NewCAM-System/1.0',
        ...options.headers
      }
    };

    if (options.auth) {
      config.headers.Authorization = options.auth;
    }

    const response = await axios(config);
    
    return {
      success: true,
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    console.error('Erro ao enviar webhook:', error.message);
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
  }
};

/**
 * Enviar webhook com retry automático
 * @param {string} url - URL do webhook
 * @param {Object} data - Dados a serem enviados
 * @param {Object} options - Opções adicionais
 * @returns {Promise<Object>} Resultado do envio
 */
export const sendWebhookWithRetry = async (url, data, options = {}) => {
  const maxRetries = options.maxRetries || 3;
  const retryDelay = options.retryDelay || 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendWebhook(url, data, options);
    
    if (result.success) {
      return result;
    }
    
    if (attempt < maxRetries) {
      console.log(`Tentativa ${attempt} falhou, tentando novamente em ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
  
  return {
    success: false,
    error: `Falha após ${maxRetries} tentativas`
  };
};

/**
 * Validar URL de webhook
 * @param {string} url - URL a ser validada
 * @returns {boolean} True se a URL é válida
 */
export const validateWebhookUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

/**
 * Gerar assinatura HMAC para webhook
 * @param {Object} data - Dados do webhook
 * @param {string} secret - Chave secreta
 * @returns {string} Assinatura HMAC
 */
export const generateWebhookSignature = (data, secret) => {
  const crypto = require('crypto');
  const payload = JSON.stringify(data);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

/**
 * Verificar assinatura HMAC de webhook
 * @param {Object} data - Dados do webhook
 * @param {string} signature - Assinatura recebida
 * @param {string} secret - Chave secreta
 * @returns {boolean} True se a assinatura é válida
 */
export const verifyWebhookSignature = (data, signature, secret) => {
  const expectedSignature = generateWebhookSignature(data, secret);
  return signature === expectedSignature;
};

/**
 * Enviar notificação de alerta via webhook
 * @param {Object} alert - Dados do alerta
 * @param {Array} webhookUrls - URLs dos webhooks
 * @returns {Promise<Array>} Resultados dos envios
 */
export const sendAlertWebhooks = async (alert, webhookUrls) => {
  const results = [];
  
  for (const webhookUrl of webhookUrls) {
    if (!validateWebhookUrl(webhookUrl)) {
      results.push({
        url: webhookUrl,
        success: false,
        error: 'URL inválida'
      });
      continue;
    }
    
    const webhookData = {
      type: 'alert',
      timestamp: new Date().toISOString(),
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        source: alert.source,
        timestamp: alert.timestamp
      },
      system: {
        name: 'NewCAM',
        version: '1.0.0'
      }
    };
    
    const result = await sendWebhookWithRetry(webhookUrl, webhookData, {
      timeout: 5000,
      maxRetries: 2
    });
    
    results.push({
      url: webhookUrl,
      ...result
    });
  }
  
  return results;
};

/**
 * Enviar notificação de evento via webhook
 * @param {Object} event - Dados do evento
 * @param {Array} webhookUrls - URLs dos webhooks
 * @returns {Promise<Array>} Resultados dos envios
 */
export const sendEventWebhooks = async (event, webhookUrls) => {
  const results = [];
  
  for (const webhookUrl of webhookUrls) {
    if (!validateWebhookUrl(webhookUrl)) {
      results.push({
        url: webhookUrl,
        success: false,
        error: 'URL inválida'
      });
      continue;
    }
    
    const webhookData = {
      type: 'event',
      timestamp: new Date().toISOString(),
      event: {
        id: event.id,
        type: event.type,
        action: event.action,
        data: event.data,
        timestamp: event.timestamp
      },
      system: {
        name: 'NewCAM',
        version: '1.0.0'
      }
    };
    
    const result = await sendWebhookWithRetry(webhookUrl, webhookData, {
      timeout: 5000,
      maxRetries: 2
    });
    
    results.push({
      url: webhookUrl,
      ...result
    });
  }
  
  return results;
};

/**
 * Testar conectividade de webhook
 * @param {string} url - URL do webhook
 * @returns {Promise<Object>} Resultado do teste
 */
export const testWebhook = async (url) => {
  const testData = {
    type: 'test',
    timestamp: new Date().toISOString(),
    message: 'Teste de conectividade do webhook NewCAM',
    system: {
      name: 'NewCAM',
      version: '1.0.0'
    }
  };
  
  return await sendWebhook(url, testData, {
    timeout: 5000
  });
};

export default {
  sendWebhook,
  sendWebhookWithRetry,
  validateWebhookUrl,
  generateWebhookSignature,
  verifyWebhookSignature,
  sendAlertWebhooks,
  sendEventWebhooks,
  testWebhook
};