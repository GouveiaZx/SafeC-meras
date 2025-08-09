import React from 'react';
import { Shield, Camera } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark';
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ 
  size = 'md', 
  variant = 'light', 
  showText = true 
}) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
  };

  const textSizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  const iconSizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  const textColor = variant === 'light' ? 'text-white' : 'text-gray-900';
  const bgColor = variant === 'light' ? 'bg-primary-600' : 'bg-primary-600';

  return (
    <div className="flex items-center space-x-3">
      <div className={`${sizeClasses[size]} ${bgColor} rounded-xl flex items-center justify-center relative overflow-hidden shadow-lg`}>
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-700"></div>
        
        {/* Shield background */}
        <Shield className={`${iconSizeClasses[size]} text-white/20 absolute`} />
        
        {/* Camera icon */}
        <Camera className={`${iconSizeClasses[size]} text-white relative z-10`} />
      </div>
      
      {showText && (
        <h1 className={`${textSizeClasses[size]} font-bold ${textColor}`}>
          Safe Câmeras
        </h1>
      )}
    </div>
  );
};

export default Logo;