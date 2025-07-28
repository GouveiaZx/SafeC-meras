/**
 * Classe utilitária para padronizar respostas da API
 */

export class ApiResponse {
  /**
   * Resposta de sucesso
   */
  static success(data = null, message = 'Operação realizada com sucesso', statusCode = 200) {
    return {
      success: true,
      message,
      data,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resposta de erro
   */
  static error(message = 'Erro interno do servidor', statusCode = 500, details = null) {
    return {
      success: false,
      message,
      error: details,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resposta de validação
   */
  static validation(errors, message = 'Dados inválidos') {
    return {
      success: false,
      message,
      errors,
      statusCode: 400,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resposta não encontrado
   */
  static notFound(message = 'Recurso não encontrado') {
    return {
      success: false,
      message,
      statusCode: 404,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resposta não autorizado
   */
  static unauthorized(message = 'Acesso não autorizado') {
    return {
      success: false,
      message,
      statusCode: 401,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resposta proibido
   */
  static forbidden(message = 'Acesso proibido') {
    return {
      success: false,
      message,
      statusCode: 403,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resposta com paginação
   */
  static paginated(data, pagination, message = 'Dados recuperados com sucesso') {
    return {
      success: true,
      message,
      data,
      pagination,
      statusCode: 200,
      timestamp: new Date().toISOString()
    };
  }
}

export default ApiResponse;