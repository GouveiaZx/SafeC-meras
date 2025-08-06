import React, { useState } from 'react';
import { Play, AlertCircle } from 'lucide-react';
import UnifiedVideoPlayer from '../components/UnifiedVideoPlayer';

const TestStreamPlayer: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const testUrls = [
    'http://localhost:3002/api/streams/29a3c06f-ec30-4ae1-823a-7d9dc69eaab5/hls/stream.m3u8',
    'http://localhost:3002/api/streams/123e4567-e89b-12d3-a456-426614174000/hls/stream.m3u8',
    'http://localhost:8080/live/camera1/index.m3u8',
    'http://localhost:8080/recordings/2024/01/01/camera1/14-30-00.mp4',
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  ];

  const handleTest = (url: string) => {
    setTestUrl(url);
    setError(null);
  };

  const handleCustomTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (streamUrl.trim()) {
      setTestUrl(streamUrl.trim());
      setError(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Testar Stream</h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">URLs de Teste</h2>
              <div className="space-y-2">
                {testUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => handleTest(url)}
                    className="w-full text-left p-3 bg-gray-100 hover:bg-gray-200 rounded-md text-sm break-all transition-colors"
                  >
                    {url}
                  </button>
                ))}
              </div>
              
              <form onSubmit={handleCustomTest} className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL Personalizada
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder="http://exemplo.com/stream.m3u8"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Testar
                  </button>
                </div>
              </form>
            </div>
            
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Visualização</h2>
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {testUrl ? (
                  <UnifiedVideoPlayer
                    src={testUrl}
                    autoPlay={true}
                    muted={false}
                    controls={true}
                    className="w-full h-full"
                    mode="simple"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Selecione ou insira uma URL para testar</p>
                    </div>
                  </div>
                )}
              </div>
              
              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}
              
              <div className="mt-4 text-sm text-gray-600">
                <h3 className="font-medium text-gray-800 mb-2">Dicas para teste:</h3>
                <ul className="space-y-1 text-xs">
                  <li>• URLs HLS (.m3u8) são suportadas nativamente</li>
                  <li>• URLs MP4 são reproduzidas diretamente</li>
                  <li>• Para testes locais, use http://localhost:8080</li>
                  <li>• URLs externas precisam permitir CORS</li>
                  <li>• Verifique se o ZLMediaKit está rodando</li>
                  <li>• Confirme se a câmera está online</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestStreamPlayer;