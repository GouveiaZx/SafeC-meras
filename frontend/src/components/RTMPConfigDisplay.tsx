/**
 * RTMP Configuration Display Component
 *
 * Displays dynamically generated RTMP URL with copy functionality.
 * Provides visual instructions for camera configuration.
 */

import React, { useState } from 'react';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface RTMPStreamConfig {
  id: string;
  sequentialNumber: number;
  streamKey: string;
  rtmpUrl: string;
  fullUrl: string;
  status: string;
  serverHost: string;
  rtmpPort: string | number;
  streamApp: string;
  copyPasteUrl: string;
}

interface RTMPConfigDisplayProps {
  streamConfig: RTMPStreamConfig | null;
  loading: boolean;
}

export default function RTMPConfigDisplay({ streamConfig, loading }: RTMPConfigDisplayProps) {
  const [showKey, setShowKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${field} copiado!`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
          <p className="text-sm text-blue-800">Gerando URL RTMP...</p>
        </div>
      </div>
    );
  }

  if (!streamConfig) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Success Banner */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start">
          <Check className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-green-900">URL RTMP Gerada com Sucesso!</h4>
            <p className="text-xs text-green-700 mt-1">
              Stream #{streamConfig.sequentialNumber} pronto para uso
            </p>
          </div>
        </div>
      </div>

      {/* Server URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Servidor RTMP
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={streamConfig.rtmpUrl}
            readOnly
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => handleCopy(streamConfig.rtmpUrl, 'Servidor')}
            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
          >
            {copiedField === 'Servidor' ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* Stream Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Stream Key
        </label>
        <div className="flex items-center gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={streamConfig.streamKey}
            readOnly
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
          >
            {showKey ? (
              <EyeOff className="h-4 w-4 text-gray-600" />
            ) : (
              <Eye className="h-4 w-4 text-gray-600" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleCopy(streamConfig.streamKey, 'Stream Key')}
            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
          >
            {copiedField === 'Stream Key' ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* Full URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          URL Completa (Copiar/Colar na Câmera)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={streamConfig.fullUrl}
            readOnly
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => handleCopy(streamConfig.fullUrl, 'URL Completa')}
            className="px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            {copiedField === 'URL Completa' ? (
              <>
                <Check className="h-4 w-4" />
                <span className="text-sm">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="text-sm">Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Como Configurar na Câmera:</h4>
        <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
          <li>Acesse o painel de configuração da sua câmera IP</li>
          <li>Procure por "Streaming RTMP" ou "Publicação RTMP"</li>
          <li>Cole a <strong>URL Completa</strong> no campo "URL RTMP"</li>
          <li>Ou cole <strong>Servidor</strong> e <strong>Stream Key</strong> separadamente</li>
          <li>Salve as configurações e aguarde a câmera iniciar transmissão</li>
        </ol>
      </div>
    </div>
  );
}
