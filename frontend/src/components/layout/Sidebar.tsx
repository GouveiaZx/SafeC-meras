import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Camera, 
  Users, 
  Settings, 
  Monitor, 
 
  Shield, 
  BarChart3,
  X,
  Video,
  FileText,
  TrendingUp,
  UserCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  userTypes: ('ADMIN' | 'INTEGRATOR' | 'CLIENT')[];
}

const navigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    userTypes: ['ADMIN', 'INTEGRATOR', 'CLIENT']
  },
  {
    name: 'Câmeras',
    href: '/cameras',
    icon: Camera,
    userTypes: ['ADMIN', 'INTEGRATOR', 'CLIENT']
  },
  {
    name: 'Gravações',
    href: '/recordings',
    icon: Video,
    userTypes: ['ADMIN', 'INTEGRATOR', 'CLIENT']
  },
  {
    name: 'Usuários',
    href: '/users',
    icon: Users,
    userTypes: ['ADMIN']
  }
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useAuth();

  // Filter navigation items based on user type
  const filteredNavigation = navigation.filter(item => 
    user && item.userTypes.includes(user.userType)
  );

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden" 
          onClick={onClose}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
        </div>
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:fixed lg:inset-y-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-full flex-col">
          {/* Logo - Sistema automático FUNCIONANDO perfeitamente! */}
          <div className="flex h-16 items-center justify-center px-6 border-b border-gray-200">
            <div className="flex items-center justify-center">
              <img 
                src="/images/safecameras.png" 
                alt="SafeCameras" 
                className="h-10 w-auto"
                onError={(e) => {
                  console.error('Erro ao carregar logo local:', e);
                  // Fallback para uma logo padrão se necessário
                }}
              />
            </div>
            
            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {filteredNavigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={onClose}
                  className={`
                    group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                    ${active 
                      ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-700' 
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon className={`
                    mr-3 h-5 w-5 flex-shrink-0
                    ${active ? 'text-primary-700' : 'text-gray-400 group-hover:text-gray-500'}
                  `} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="h-10 w-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center ring-2 ring-primary-100 shadow-lg">
                  <UserCircle className="h-6 w-6 text-white" />
                </div>
                {user?.userType === 'ADMIN' && (
                  <div className="absolute -top-1 -right-1 h-4 w-4 bg-yellow-400 rounded-full flex items-center justify-center shadow-sm">
                    <Shield className="h-2.5 w-2.5 text-yellow-800" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 capitalize flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    user?.userType === 'ADMIN' ? 'bg-yellow-400' :
                    user?.userType === 'INTEGRATOR' ? 'bg-blue-400' :
                    'bg-green-400'
                  }`}></span>
                  {user?.userType?.toLowerCase()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;