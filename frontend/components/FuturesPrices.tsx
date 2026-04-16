'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const REFRESH_INTERVAL_MS = 60_000; // 1 minute

type FuturesQuote = {
  price: number | null;
  change: number | null;
  change_pct: number | null;
  name: string;
  currency: string;
  market_state: string;
};

type FuturesData = {
  wti: FuturesQuote | null;
  brent: FuturesQuote | null;
};

function PriceCard({
  label,
  ticker,
  quote,
}: {
  label: string;
  ticker: string;
  quote: FuturesQuote | null;
}) {
  if (!quote || quote.price == null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
        <div>
          <p className="text-slate-500 text-xs">{label}</p>
          <p className="text-slate-600 text-xs">—</p>
        </div>
      </div>
    );
  }

  const isUp = (quote.change ?? 0) >= 0;
  const sign = isUp ? '+' : '';
  const changeColor = isUp ? 'text-emerald-400' : 'text-red-400';
  const isOpen = quote.market_state === 'REGULAR' || quote.market_state === 'PRE' || quote.market_state === 'POST';

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-300 text-xs font-semibold">{label}</span>
          <span className="text-slate-600 text-[10px]">{ticker}</span>
          {isOpen && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" title="Market open" />
          )}
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-white font-bold text-sm tabular-nums">
            ${quote.price.toFixed(2)}
          </span>
          <span className={`text-xs tabular-nums ${changeColor}`}>
            {sign}{(quote.change ?? 0).toFixed(2)} ({sign}{(quote.change_pct ?? 0).toFixed(2)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

export default function FuturesPrices() {
  const [data, setData] = useState<FuturesData | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/prices/futures`, { cache: 'no-store' });
      if (!res.ok) return;
      const json: FuturesData = await res.json();
      setData(json);
      setLastFetched(new Date());
    } catch {
      // silently fail — don't disrupt the rest of the dashboard
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const timer = setInterval(fetchPrices, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPrices]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <PriceCard label="WTI Cushing Spot" ticker="RWTC" quote={data?.wti ?? null} />
      <PriceCard label="Europe Brent Spot" ticker="RBRTE" quote={data?.brent ?? null} />
      {lastFetched && (
        <span className="text-slate-600 text-[10px] hidden sm:inline">
          {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
