import { cn } from "@/lib/utils";
import { FileX } from 'lucide-react';

interface EmptyProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<any>;
  className?: string;
}

/**
 * Componente para exibir estado vazio com ícone e mensagem personalizáveis
 */
export default function Empty({ 
  title = "Nenhum item encontrado", 
  description = "Não há dados para exibir no momento.",
  icon: Icon = FileX,
  className 
}: EmptyProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-64 text-gray-500", className)}>
      <Icon className="h-12 w-12 mb-4 opacity-50" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-center max-w-sm">{description}</p>
    </div>
  );
}