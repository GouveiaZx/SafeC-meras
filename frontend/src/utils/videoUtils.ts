export interface AuthUrlOptions {
  token?: string;
  timestamp?: number;
  includeTokenInQuery?: boolean;
}

export const buildAuthenticatedVideoUrl = (
  baseUrl: string,
  options: AuthUrlOptions = {}
): string => {
  try {
    // Detectar URLs S3 presigned - NÃO adicionar tokens nessas URLs
    const isS3PresignedUrl = baseUrl.includes('X-Amz-Signature') || 
                           baseUrl.includes('s3.wasabisys.com') || 
                           baseUrl.includes('s3.amazonaws.com') ||
                           baseUrl.includes('X-Amz-Algorithm');
                           
    if (isS3PresignedUrl) {
      console.log('🔒 URL S3 presigned detectada, não adicionando token');
      return baseUrl;
    }
    
    // Se for uma URL relativa, assumir que é relativa ao host atual
    let url: URL;
    if (baseUrl.startsWith('/')) {
      url = new URL(baseUrl, window.location.origin);
    } else {
      url = new URL(baseUrl);
    }
    
    // Verificar se o token já existe na URL para evitar duplicação
    const existingToken = url.searchParams.get('token');
    if (options.token && !existingToken) {
      url.searchParams.set('token', options.token);
    } else if (existingToken) {
      console.log('🔍 Token já presente na URL, evitando duplicação');
    }
    
    if (options.timestamp) {
      url.searchParams.set('t', options.timestamp.toString());
    }
    
    return url.toString();
  } catch (error) {
    console.error('Erro ao construir URL autenticada:', error, 'baseUrl:', baseUrl);
    // Fallback: retornar URL original se falhar
    return baseUrl;
  }
};

export default {
  buildAuthenticatedVideoUrl
};