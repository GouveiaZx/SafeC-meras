import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface DataPoint {
  [key: string]: any;
}

interface LineConfig {
  dataKey: string;
  name: string;
  color: string;
  unit?: string;
}

interface LineChartProps {
  data: DataPoint[];
  lines: LineConfig[];
  height?: number;
  title?: string;
  className?: string;
  xAxisKey?: string;
  unit?: string;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  lines,
  height = 300,
  title,
  className = '',
  xAxisKey = 'time',
  unit = ''
}) => {
  const formatXAxisLabel = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTooltipLabel = (label: string) => {
    const date = new Date(label);
    return date.toLocaleString('pt-BR');
  };

  const formatTooltipValue = (value: any, name: string) => {
    const line = lines.find(l => l.name === name);
    const unitToUse = line?.unit || unit || '';
    
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
        <RechartsLineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="timestamp"
            tickFormatter={formatXAxisLabel}
            stroke="#6b7280"
            fontSize={12}
          />
          <YAxis 
            stroke="#6b7280"
            fontSize={12}
          />
          <Tooltip
            labelFormatter={formatTooltipLabel}
            formatter={formatTooltipValue}
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend />
          
          {lines.map((line, index) => (
            <Line
              key={index}
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={2}
              dot={{ fill: line.color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: line.color, strokeWidth: 2 }}
              name={line.name}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LineChart;