/**
 * Classe personalizada para erros da API
 */

export class ApiError extends Error {
  constructor(message, statusCode = 500, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Erro de validação (400)
   */
  static badRequest(message = 'Requisição inválida') {
    return new ApiError(message, 400);
  }

  /**
   * Erro de autenticação (401)
   */
  static unauthorized(message = 'Não autorizado') {
    return new ApiError(message, 401);
  }

  /**
   * Erro de permissão (403)
   */
  static forbidden(message = 'Acesso proibido') {
    return new ApiError(message, 403);
  }

  /**
   * Erro de recurso não encontrado (404)
   */
  static notFound(message = 'Recurso não encontrado') {
    return new ApiError(message, 404);
  }

  /**
   * Erro de conflito (409)
   */
  static conflict(message = 'Conflito de dados') {
    return new ApiError(message, 409);
  }

  /**
   * Erro de validação com detalhes (422)
   */
  static validation(message = 'Dados inválidos', details = null) {
    const error = new ApiError(message, 422);
    error.details = details;
    return error;
  }

  /**
   * Erro interno do servidor (500)
   */
  static internal(message = 'Erro interno do servidor') {
    return new ApiError(message, 500);
  }

  /**
   * Erro de serviço indisponível (503)
   */
  static serviceUnavailable(message = 'Serviço indisponível') {
    return new ApiError(message, 503);
  }

  /**
   * Converte o erro para objeto JSON
   */
  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      ...(this.details && { details: this.details })
    };
  }
}

export default ApiError;