import React from 'react';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const baseClasses = 'relative w-full rounded-lg border p-4';
  
  const variantClasses = {
    default: 'bg-white text-gray-900 border-gray-200',
    destructive: 'bg-red-50 text-red-900 border-red-200'
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      role="alert"
      {...props}
    >
      {children}
    </div>
  );
};

interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const AlertDescription: React.FC<AlertDescriptionProps> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p
      className={`text-sm ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};

export default Alert;