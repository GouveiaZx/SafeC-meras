import { Link } from "react-router-dom";
import { Camera, Shield, Monitor, Users } from "lucide-react";
import Logo from "@/components/ui/Logo";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <Logo size="sm" variant="light" showText={true} />
            <div className="flex space-x-4">
              <Link
                to="/auth/login"
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Entrar
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h2 className="text-5xl font-bold text-white mb-6">
            Sistema de Monitoramento
            <span className="block text-primary-400">Inteligente</span>
          </h2>
          <p className="text-xl text-primary-100 mb-12 max-w-3xl mx-auto">
            Gerencie suas câmeras de segurança com tecnologia avançada. 
            Monitoramento em tempo real, gravações automáticas e relatórios detalhados.
          </p>
          
          <div className="flex justify-center">
            <Link
              to="/auth/login"
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-colors shadow-lg"
            >
              Começar Agora
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <Camera className="h-12 w-12 text-primary-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Câmeras IP</h3>
            <p className="text-primary-100">
              Suporte completo para câmeras IP com streaming em tempo real
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <Monitor className="h-12 w-12 text-primary-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Monitoramento</h3>
            <p className="text-primary-100">
               Dashboard completo com métricas e alertas em tempo real
             </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <Shield className="h-12 w-12 text-primary-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Segurança</h3>
            <p className="text-primary-100">
               Autenticação robusta e controle de acesso por níveis
             </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <Users className="h-12 w-12 text-primary-400 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Multi-usuário</h3>
            <p className="text-primary-100">
               Gerenciamento de usuários com diferentes níveis de permissão
             </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-sm border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-primary-200">
            <p>&copy; 2025 Safe Câmeras. Sistema de Monitoramento Inteligente.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}