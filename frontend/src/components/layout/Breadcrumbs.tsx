import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  name: string;
  href?: string;
}

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  
  // Generate breadcrumbs from current path
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const pathnames = location.pathname.split('/').filter(x => x);
    
    const breadcrumbs: BreadcrumbItem[] = [
      { name: 'Início', href: '/dashboard' }
    ];

    // Map path segments to readable names
    const pathMap: Record<string, string> = {
      dashboard: 'Dashboard',
      cameras: 'Câmeras',
      monitoring: 'Monitoramento',
      recordings: 'Gravações',
      archive: 'Arquivo',
      users: 'Usuários',
      reports: 'Relatórios',
      security: 'Segurança',
      settings: 'Configurações',
      profile: 'Meu Perfil',
      admin: 'Administração',
      integrator: 'Integrador',
      client: 'Cliente',
      new: 'Novo',
      edit: 'Editar',
      view: 'Visualizar'
    };

    let currentPath = '';
    
    pathnames.forEach((pathname, index) => {
      currentPath += `/${pathname}`;
      
      const name = pathMap[pathname] || pathname.charAt(0).toUpperCase() + pathname.slice(1);
      
      // Don't add href for the last item (current page)
      const isLast = index === pathnames.length - 1;
      
      breadcrumbs.push({
        name,
        href: isLast ? undefined : currentPath
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  // Don't show breadcrumbs on dashboard
  if (location.pathname === '/dashboard') {
    return null;
  }

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {breadcrumbs.map((breadcrumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          
          return (
            <li key={breadcrumb.name} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-gray-400 mx-2" />
              )}
              
              {breadcrumb.href ? (
                <Link
                  to={breadcrumb.href}
                  className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {index === 0 && <Home className="h-4 w-4 mr-1" />}
                  {breadcrumb.name}
                </Link>
              ) : (
                <span className="flex items-center text-sm font-medium text-gray-900">
                  {index === 0 && <Home className="h-4 w-4 mr-1" />}
                  {breadcrumb.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;