import React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  message: string;
  timestamp: string;
  category: string;
  details?: string;
}

interface AlertCardProps {
  alert: Alert;
  onDismiss?: (alertId: string) => void;
  className?: string;
}

const alertConfig = {
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    iconColor: 'text-yellow-600',
    textColor: 'text-yellow-800',
    titleColor: 'text-yellow-900'
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    textColor: 'text-red-800',
    titleColor: 'text-red-900'
  },
  info: {
    icon: Info,
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-200',
    iconColor: 'text-primary-600',
    textColor: 'text-primary-800',
    titleColor: 'text-primary-900'
  },
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    iconColor: 'text-green-600',
    textColor: 'text-green-800',
    titleColor: 'text-green-900'
  }
};

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onDismiss,
  className = ''
}) => {
  const config = alertConfig[alert.type];
  const Icon = config.icon;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return 'Agora mesmo';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} min atrás`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours}h atrás`;
    } else {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getCategoryLabel = (category: string) => {
    const categoryLabels: Record<string, string> = {
      system: 'Sistema',
      camera: 'Câmera',
      recording: 'Gravação',
      storage: 'Armazenamento',
      network: 'Rede',
      auth: 'Autenticação',
      security: 'Segurança'
    };
    
    return categoryLabels[category] || category;
  };

  return (
    <div className={`
      ${config.bgColor} ${config.borderColor} border rounded-lg p-4 
      ${className}
    `}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <Icon className={`w-5 h-5 ${config.iconColor}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className={`text-sm font-medium ${config.titleColor}`}>
              {getCategoryLabel(alert.category)}
            </p>
            
            <div className="flex items-center space-x-2">
              <span className={`text-xs ${config.textColor} opacity-75`}>
                {formatTimestamp(alert.timestamp)}
              </span>
              
              {onDismiss && (
                <button
                  onClick={() => onDismiss(alert.id)}
                  className={`
                    ${config.iconColor} hover:opacity-75 transition-opacity
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent
                  `}
                  aria-label="Dispensar alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <p className={`text-sm ${config.textColor} mb-2`}>
            {alert.message}
          </p>
          
          {alert.details && (
            <details className="mt-2">
              <summary className={`text-xs ${config.textColor} cursor-pointer hover:underline`}>
                Ver detalhes
              </summary>
              <p className={`text-xs ${config.textColor} mt-1 opacity-75`}>
                {alert.details}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertCard;