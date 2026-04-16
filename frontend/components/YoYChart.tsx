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
  ReferenceLine,
} from 'recharts';
import type { WeeklyReport } from '@/lib/api';

// 연도별 색상
const YEAR_COLORS: Record<number, string> = {
  2020: '#475569',
  2021: '#6366f1',
  2022: '#14b8a6',
  2023: '#f59e0b',
  2024: '#f97316',
  2025: '#ef4444',
  2026: '#c084fc',
};

const MONTH_START_WEEKS: [number, string][] = [
  [1, 'Jan'], [5, 'Feb'], [9, 'Mar'], [14, 'Apr'],
  [18, 'May'], [22, 'Jun'], [27, 'Jul'], [31, 'Aug'],
  [35, 'Sep'], [40, 'Oct'], [44, 'Nov'], [48, 'Dec'],
];

function getWeekOfYear(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000) + 1;
  return Math.min(52, Math.max(1, Math.ceil(dayOfYear / 7)));
}

// ── YoY dataset ──────────────────────────────────────────────────────────────

type SlotRow = { week: number } & Record<string, number | null>;

function buildYoYDataset(
  allData: WeeklyReport[],
  dataKey: string
): { slots: SlotRow[]; years: number[] } {
  const yearSet = new Set<number>();
  allData.forEach((r) =>
    yearSet.add(new Date(r.report_date + 'T00:00:00').getFullYear())
  );
  const years = [...yearSet].sort();

  const slots: SlotRow[] = Array.from({ length: 52 }, (_, i) => {
    const base: SlotRow = { week: i + 1 };
    years.forEach((y) => { base[String(y)] = null; });
    return base;
  });

  for (const row of allData) {
    const d = new Date(row.report_date + 'T00:00:00');
    const year = d.getFullYear();
    const weekIdx = getWeekOfYear(row.report_date) - 1;
    const raw = (row as Record<string, unknown>)[dataKey];
    const value = typeof raw === 'number' ? raw : null;
    if (weekIdx >= 0 && weekIdx < 52 && value !== null) {
      slots[weekIdx][String(year)] = value;
    }
  }

  return { slots, years };
}

// ── 3-month zoom dataset ──────────────────────────────────────────────────────

type ZoomRow = { date: string; [year: string]: number | null | string };

function buildZoomDataset(
  allData: WeeklyReport[],
  dataKey: string
): { rows: ZoomRow[]; years: number[] } {
  const sorted = [...allData].sort((a, b) => a.report_date.localeCompare(b.report_date));
  const recent = sorted.slice(-13); // ~3 months
  const years = [...new Set(recent.map((r) =>
    new Date(r.report_date + 'T00:00:00').getFullYear()
  ))].sort();

  const rows: ZoomRow[] = recent.map((r) => {
    const year = new Date(r.report_date + 'T00:00:00').getFullYear();
    const raw = (r as Record<string, unknown>)[dataKey];
    const value = typeof raw === 'number' ? raw : null;
    const row: ZoomRow = { date: r.report_date };
    years.forEach((y) => { row[String(y)] = y === year ? value : null; });
    return row;
  });

  return { rows, years };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function abbreviateNumber(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (Math.abs(value) < 10) return value.toFixed(2);
  return value.toFixed(1);
}

function weekToMonthLabel(week: number): string {
  const found = MONTH_START_WEEKS.find(([w]) => w === week);
  return found ? found[1] : '';
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ── Y-axis domain (no forced zero) ────────────────────────────────────────────

const Y_DOMAIN: [(v: number) => number, (v: number) => number] = [
  (dataMin: number) => dataMin >= 0 ? Math.floor(dataMin * 0.95) : Math.floor(dataMin * 1.05),
  (dataMax: number) => dataMax >= 0 ? Math.ceil(dataMax * 1.05) : Math.ceil(dataMax * 0.95),
];

// ── Tooltips ──────────────────────────────────────────────────────────────────

interface TooltipEntry {
  name?: string;
  value?: number | null;
  color?: string;
}

function makeTooltip(unit: string, labelFormatter: (label: unknown) => string) {
  function TooltipContent({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: unknown;
  }) {
    if (!active || !payload || payload.length === 0) return null;
    const validEntries = (payload as TooltipEntry[])
      .filter((e) => e.value != null)
      .sort((a, b) => Number(b.name) - Number(a.name));

    return (
      <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 shadow-xl text-xs min-w-[140px]">
        <p className="text-slate-300 font-semibold mb-2">{labelFormatter(label)}</p>
        {validEntries.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-1.5">
              <span
                style={{ backgroundColor: e.color, display: 'inline-block', width: 10, height: 2 }}
              />
              <span className="text-slate-400">{e.name}</span>
            </div>
            <span className="text-white font-medium tabular-nums">
              {Number(e.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
              <span className="text-slate-500">{unit}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }
  TooltipContent.displayName = 'TooltipContent';
  return TooltipContent;
}

// ── Component ─────────────────────────────────────────────────────────────────

type YoYChartProps = {
  title: string;
  subtitle?: string;
  allData: WeeklyReport[];
  dataKey: string;
  unit: string;
  height?: number;
  showZeroLine?: boolean;
};

const CURRENT_YEAR = new Date().getFullYear();

export default function YoYChart({
  title,
  subtitle,
  allData,
  dataKey,
  unit,
  height = 200,
  showZeroLine = false,
}: YoYChartProps) {
  const { slots, years } = buildYoYDataset(allData, dataKey);
  const { rows: zoomRows, years: zoomYears } = buildZoomDataset(allData, dataKey);

  const YoYTooltip = makeTooltip(
    unit,
    (label) => {
      const week = Number(label);
      const monthLabel = weekToMonthLabel(week);
      return monthLabel ? `${monthLabel} (W${week})` : `W${week}`;
    }
  );
  const ZoomTooltip = makeTooltip(
    unit,
    (label) => formatShortDate(String(label))
  );

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2 border border-slate-700">
      {/* Title */}
      <div>
        <h3 className="text-slate-100 font-semibold text-sm">{title}</h3>
        {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
      </div>

      {/* Two charts side by side */}
      <div className="grid grid-cols-[3fr_2fr] gap-3">
        {/* ── Full YoY chart ── */}
        <div>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={slots} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={weekToMonthLabel}
                interval={0}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={abbreviateNumber}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={42}
                domain={Y_DOMAIN}
              />
              {showZeroLine && (
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" strokeWidth={1} />
              )}
              <Tooltip
                content={<YoYTooltip />}
                cursor={{ stroke: '#334155', strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: '10px', color: '#64748b', paddingTop: '4px' }} />
              {years.map((year) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={String(year)}
                  name={String(year)}
                  stroke={YEAR_COLORS[year] ?? '#94a3b8'}
                  strokeWidth={year === CURRENT_YEAR ? 2.5 : 1.2}
                  strokeOpacity={year === CURRENT_YEAR ? 1 : 0.75}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── 3-month zoom chart ── */}
        <div className="flex flex-col">
          <p className="text-slate-500 text-xs mb-1">Recent 3M</p>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={zoomRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                interval={3}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={abbreviateNumber}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={38}
                domain={Y_DOMAIN}
              />
              {showZeroLine && (
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" strokeWidth={1} />
              )}
              <Tooltip
                content={<ZoomTooltip />}
                cursor={{ stroke: '#334155', strokeWidth: 1 }}
              />
              {zoomYears.map((year) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={String(year)}
                  name={String(year)}
                  stroke={YEAR_COLORS[year] ?? '#94a3b8'}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: YEAR_COLORS[year] ?? '#94a3b8', strokeWidth: 0 }}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
