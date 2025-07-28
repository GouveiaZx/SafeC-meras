import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface DataPoint {
  name: string;
  [key: string]: any;
}

interface BarConfig {
  dataKey: string;
  name: string;
  color: string;
  unit?: string;
}

interface BarChartProps {
  data: DataPoint[];
  bars?: BarConfig[];
  bar?: BarConfig;
  height?: number;
  title?: string;
  className?: string;
  layout?: 'horizontal' | 'vertical';
  unit?: string;
}

const BarChart: React.FC<BarChartProps> = ({
  data,
  bars,
  bar,
  height = 300,
  title,
  className = '',
  layout = 'vertical',
  unit = ''
}) => {
  const barConfigs = bars || (bar ? [bar] : []);
  const formatTooltipValue = (value: any, name: string) => {
    const barConfig = barConfigs.find(b => b.name === name);
    const unitToUse = barConfig?.unit || unit || '';
    
    if (typeof value === 'number') {
      if (unitToUse === '%') {
        return [`${value.toFixed(1)}%`, name];
      } else if (unitToUse === 'MB' || unitToUse === 'GB') {
        return [`${value.toFixed(2)} ${unitToUse}`, name];
      } else if (Number.isInteger(value)) {
        return [`${value} ${unitToUse}`, name];
      } else {
        return [`${value.toFixed(2)} ${unitToUse}`, name];
      }
    }
    
    return [value, name];
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      )}
      
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          layout={layout}
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" stroke="#6b7280" fontSize={12} />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="#6b7280" 
                fontSize={12}
                width={80}
              />
            </>
          ) : (
            <>
              <XAxis 
                type="category" 
                dataKey="name" 
                stroke="#6b7280" 
                fontSize={12}
              />
              <YAxis type="number" stroke="#6b7280" fontSize={12} />
            </>
          )}
          
          <Tooltip
            formatter={formatTooltipValue}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend />
          
          {barConfigs.map((barConfig) => (
            <Bar
              key={barConfig.dataKey}
              dataKey={barConfig.dataKey}
              fill={barConfig.color}
              name={barConfig.name}
              radius={[2, 2, 2, 2]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BarChart;