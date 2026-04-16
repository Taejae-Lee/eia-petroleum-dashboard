'use client';

import { useState, useEffect } from 'react';
import { fetchData, fetchLatest, type WeeklyReport } from '@/lib/api';
import YoYChart from '@/components/YoYChart';
import FuturesPrices from '@/components/FuturesPrices';

function formatDisplayDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

type Section = {
  heading: string;
  subheading: string;
  charts: {
    title: string;
    subtitle: string;
    dataKey: string;
    unit: string;
    showZeroLine?: boolean;
    startYear?: number;
  }[];
};

const SECTIONS: Section[] = [
  {
    heading: '총재고',
    subheading: 'Crude Oil Stocks',
    charts: [
      { title: 'Crude Oil Total', subtitle: '원유 총재고', dataKey: 'crude_total_stocks', unit: 'M bbl' },
      { title: 'Commercial Crude', subtitle: '상업용 원유재고 (SPR 제외)', dataKey: 'crude_commercial_stocks', unit: 'M bbl' },
      { title: 'SPR', subtitle: '전략비축유', dataKey: 'crude_spr_stocks', unit: 'M bbl' },
    ],
  },
  {
    heading: '제품재고',
    subheading: 'Product Stocks',
    charts: [
      { title: 'Motor Gasoline', subtitle: '휘발유재고', dataKey: 'gasoline_stocks', unit: 'M bbl' },
      { title: 'Distillate Fuel Oil', subtitle: '경유재고', dataKey: 'distillate_stocks', unit: 'M bbl' },
      { title: 'Kerosene-Type Jet Fuel', subtitle: '항공유재고', dataKey: 'jet_fuel_stocks', unit: 'M bbl' },
    ],
  },
  {
    heading: '정제소 & 생산',
    subheading: 'Refinery & Production',
    charts: [
      { title: 'Refinery Utilization', subtitle: '정제소 가동율', dataKey: 'refinery_utilization', unit: '%' },
      { title: 'Domestic Production', subtitle: '국내 원유 생산량', dataKey: 'domestic_production', unit: 'K bbl/d' },
    ],
  },
  {
    heading: '내재수요',
    subheading: 'Implied Demand (Products Supplied)',
    charts: [
      { title: 'Gasoline Demand', subtitle: '휘발유 내재수요', dataKey: 'demand_gasoline', unit: 'K bbl/d', startYear: 2024 },
      { title: 'Distillate Demand', subtitle: '경유 내재수요', dataKey: 'demand_distillate', unit: 'K bbl/d' },
      { title: 'Jet Fuel Demand', subtitle: '항공유 내재수요', dataKey: 'demand_jet_fuel', unit: 'K bbl/d' },
    ],
  },
  {
    heading: '수출입',
    subheading: 'Net Imports',
    charts: [
      { title: 'Crude Net Imports', subtitle: '원유 순수입', dataKey: 'crude_net_imports', unit: 'K bbl/d', showZeroLine: true },
      { title: 'Products Net Imports', subtitle: '제품 순수입', dataKey: 'products_net_imports', unit: 'K bbl/d', showZeroLine: true },
    ],
  },
];

export default function Dashboard() {
  const [data, setData] = useState<WeeklyReport[]>([]);
  const [latest, setLatest] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date().toISOString().split('T')[0];
        const [rows, latestRow] = await Promise.all([
          fetchData('2020-01-01', today),
          fetchLatest(),
        ]);
        setData(rows);
        setLatest(latestRow);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-4 py-3">
        <div className="max-w-screen-2xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              EIA Petroleum Weekly
            </h1>
            {latest && (
              <p className="text-slate-400 text-xs mt-0.5">
                Last updated: {formatDisplayDate(latest.release_date)}
                <span className="mx-1.5 text-slate-600">·</span>
                Report date: {formatDisplayDate(latest.report_date)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <FuturesPrices />
            <span className="text-slate-700 text-xs hidden sm:inline">·</span>
            <span className="text-xs text-slate-500">YoY · 2020–2026</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-8">
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Loading petroleum data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Category sections */}
            {SECTIONS.map((section) => (
              <section key={section.heading}>
                <div className="mb-3">
                  <h2 className="text-white font-bold text-base">{section.heading}</h2>
                  <p className="text-slate-500 text-xs">{section.subheading}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {section.charts.map((chart) => {
                    const chartData = chart.startYear
                      ? data.filter((r) => new Date(r.report_date + 'T00:00:00').getFullYear() >= chart.startYear!)
                      : data;
                    return (
                      <YoYChart
                        key={chart.dataKey}
                        title={chart.title}
                        subtitle={chart.subtitle}
                        allData={chartData}
                        dataKey={chart.dataKey}
                        unit={chart.unit}
                        height={200}
                        showZeroLine={chart.showZeroLine}
                      />
                    );
                  })}
                </div>
              </section>
            ))}

            {/* Full-width price chart */}
            <section>
              <div className="mb-3">
                <h2 className="text-white font-bold text-base">제품가격</h2>
                <p className="text-slate-500 text-xs">Retail Gasoline Price</p>
              </div>
              <YoYChart
                title="Regular Gasoline Retail Price"
                subtitle="U.S. National Average"
                allData={data}
                dataKey="gasoline_retail_price"
                unit="$/gal"
                height={220}
              />
            </section>

            {/* Footer */}
            <p className="text-center text-slate-600 text-xs pb-4">
              Source: U.S. Energy Information Administration (EIA) · Weekly Petroleum Status Report
              {data.length > 0 && <> · {data.length} weekly reports (2020-01-01 to {new Date().toISOString().split('T')[0]})</>}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
