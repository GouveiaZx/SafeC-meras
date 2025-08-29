/**
 * Utilitários para URLs de streaming via proxy do backend
 * 
 * Formato correto via proxy do backend:
 * - HLS: http://domain/api/streams/streamId/hls/stream.m3u8
 * - Suporte a RTSP, RTMP, HLS, HTTP-FLV, WebRTC via proxy
 */

import { getAPIBaseURL } from '@/lib/api';

export interface StreamingUrls {
  hls: string;
  fmp4?: string;
  rtsp?: string;
  rtmp?: string;
  flv?: string;
}

/**
 * Gera URLs de streaming usando APENAS o proxy do backend
 * @param streamId - ID do stream
 * @param baseUrl - URL base (opcional, usa configuração padrão)
 * @returns Objeto com URLs para diferentes protocolos via proxy
 */
export function generateStreamingUrls(streamId: string, baseUrl?: string): StreamingUrls {
  if (!streamId) {
    throw new Error('Stream ID é obrigatório');
  }

  // Determinar base do proxy do backend (respeita VITE_API_URL)
  const proxyBaseUrl = (baseUrl || getAPIBaseURL()).replace(/\/$/, '');
  
  return {
    // HLS via proxy do backend - Formato correto do ZLMediaKit
    hls: `${proxyBaseUrl}/streams/${streamId}/hls/stream.m3u8`,
    // FMP4 via proxy - Melhor suporte para H.265
    fmp4: `${proxyBaseUrl}/streams/${streamId}/fmp4/stream.live.mp4`,
    // RTSP via proxy (se implementado no futuro)
    rtsp: `${proxyBaseUrl}/streams/${streamId}/rtsp`,
    // RTMP via proxy (se implementado no futuro)
    rtmp: `${proxyBaseUrl}/streams/${streamId}/rtmp`,
    // FLV via proxy (se implementado no futuro)
    flv: `${proxyBaseUrl}/streams/${streamId}/flv`
  };
}

/**
 * Valida se uma URL é uma URL HLS válida do proxy do backend
 * @param url - URL para validar
 * @returns true se for uma URL HLS válida do proxy
 */
export function isValidHlsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Verificar se termina com .m3u8
  if (!url.endsWith('.m3u8')) {
    return false;
  }

  // Aceitar URLs do proxy do backend (absolutas ou relativas) que contenham '/streams/'
  if (!url.includes('/streams/')) {
    console.warn('URL HLS deve usar o proxy do backend com caminho /streams/:', url);
    return false;
  }

  // Verificar se é uma URL válida
  try {
    new URL(url, window.location.origin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Corrige URLs de streaming para usar APENAS o proxy do backend
 * @param url - URL original (possivelmente incorreta)
 * @returns URL corrigida para usar o proxy do backend
 */
export function fixStreamingUrl(url: string): string {
  if (!url) return '';
  
  const apiBase = getAPIBaseURL().replace(/\/$/, '');
  
  // Se a URL já é do backend (proxy), garantir que está no formato correto
  if (url.includes('/streams/')) {
    // Garantir que termina com /hls/stream.m3u8 (formato correto do ZLMediaKit)
    if (!url.includes('/hls/stream.m3u8')) {
      // Remover duplicações como /hls/hls.m3u8
      url = url.replace(/\/hls\/hls\.m3u8$/, '/hls/stream.m3u8');
      
      const streamIdMatch = url.match(/\/streams\/([^/]+)/);
      if (streamIdMatch) {
        const streamId = streamIdMatch[1];
        return `${apiBase}/streams/${streamId}/hls/stream.m3u8`;
      }
    }
    // Se já contém api base, retornar como está; caso relativo, normalizar para absoluto
    try {
      // Tentativa de criar URL absoluta; se já for absoluta, apenas retorna url
      const abs = new URL(url, window.location.origin).toString();
      // Se url já começa com apiBase, retorna abs; caso contrário, se for relativa, prefixa apiBase
      if (url.startsWith('http')) return abs;
      return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
    } catch {
      // Se falhar, retornar url original
      return url;
    }
  }
  
  // Extrair streamId da URL (apenas formatos válidos)
  let streamId = '';
  
  // Formato direto: apenas o ID (UUID)
  if (url.match(/^[a-f0-9-]+$/)) {
    streamId = url;
  }
  
  // Formato com path: extrair último segmento que seja um UUID
  if (!streamId) {
    const pathSegments = url.split('/');
    for (let i = pathSegments.length - 1; i >= 0; i--) {
      if (pathSegments[i].match(/^[a-f0-9-]+$/)) {
        streamId = pathSegments[i];
        break;
      }
    }
  }
  
  // Se não conseguiu extrair streamId, retornar URL original
  if (!streamId) {
    console.warn('Não foi possível extrair streamId da URL:', url);
    return url;
  }
  
  // SEMPRE retornar URL absoluta do proxy do backend no formato correto
  return `${apiBase}/streams/${streamId}/hls/stream.m3u8`;
}

/**
 * Adiciona token de autenticação à URL se necessário
 * @param url - URL base
 * @param token - Token de autenticação
 * @returns URL com token adicionado
 */
export function addTokenToUrl(url: string, token?: string): string {
  if (!token || !url) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${token}`;
}

/**
 * Logs para debug de streaming
 */
export function logStreamingInfo(event: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`🎥 [StreamingUtils] ${event}:`, {
    timestamp,
    ...data
  });
}