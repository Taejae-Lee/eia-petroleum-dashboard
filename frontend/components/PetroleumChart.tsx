'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { WeeklyReport } from '@/lib/api';

export type ChartLine = {
  dataKey: string;
  name: string;
  color: string;
  unit?: string;
};

export type PetroleumChartProps = {
  title: string;
  subtitle?: string;
  data: WeeklyReport[];
  lines: ChartLine[];
  unit: string;
  height?: number;
};

function formatDateTick(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = String(date.getFullYear()).slice(2);
  return `${month} '${year}`;
}

function abbreviateNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(1);
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | null;
  color?: string;
  unit?: string;
}

function makeCustomTooltip(unit: string) {
  function CustomTooltip({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
  }) {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl text-sm">
        <p className="text-slate-300 font-medium mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 mb-1">
            <span
              style={{ backgroundColor: entry.color, display: 'inline-block', height: '2px', width: '12px' }}
            />
            <span className="text-slate-400">{entry.name}:</span>
            <span className="text-white font-medium">
              {entry.value !== null && entry.value !== undefined
                ? `${Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}`
                : 'N/A'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  CustomTooltip.displayName = 'CustomTooltip';
  return CustomTooltip;
}

export default function PetroleumChart({
  title,
  subtitle,
  data,
  lines,
  unit,
  height = 200,
}: PetroleumChartProps) {
  // 작은 차트 ~6개, 큰 차트(height≥250) ~12개 틱
  const targetTicks = height >= 250 ? 12 : 6;
  const tickInterval = Math.max(1, Math.floor(data.length / targetTicks));
  const TooltipContent = makeCustomTooltip(unit);

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2 border border-slate-700">
      <div>
        <h2 className="text-slate-100 font-semibold text-sm">{title}</h2>
        {subtitle && <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis
            dataKey="report_date"
            tickFormatter={formatDateTick}
            interval={tickInterval}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={abbreviateNumber}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            content={<TooltipContent />}
            cursor={{ stroke: '#475569', strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '8px' }}
          />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
