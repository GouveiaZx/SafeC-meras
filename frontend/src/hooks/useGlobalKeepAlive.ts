/**
 * Hook para inicializar e gerenciar o serviço global de keep-alive
 */

import { useEffect } from 'react';
import { globalKeepAlive } from '../services/globalKeepAlive';

export const useGlobalKeepAlive = () => {
  useEffect(() => {
    // O serviço será iniciado automaticamente quando a primeira stream for registrada
    console.log('🚀 useGlobalKeepAlive: Hook inicializado');
    
    // Cleanup quando o componente principal for desmontado
    return () => {
      globalKeepAlive.destroy();
      console.log('🛑 useGlobalKeepAlive: Serviço destruído no cleanup');
    };
  }, []);

  // Retorna funções úteis para debug e controle
  return {
    getStats: () => globalKeepAlive.getStats(),
    forceHealthCheck: () => globalKeepAlive.forceHealthCheck(),
    destroy: () => globalKeepAlive.destroy()
  };
};

export default useGlobalKeepAlive;