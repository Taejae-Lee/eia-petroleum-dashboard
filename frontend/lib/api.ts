const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type WeeklyReport = {
  report_date: string;
  release_date: string;
  crude_total_stocks: number | null;
  crude_commercial_stocks: number | null;
  crude_spr_stocks: number | null;
  gasoline_stocks: number | null;
  distillate_stocks: number | null;
  jet_fuel_stocks: number | null;
  refinery_utilization: number | null;
  domestic_production: number | null;
  demand_gasoline: number | null;
  demand_jet_fuel: number | null;
  demand_distillate: number | null;
  crude_net_imports: number | null;
  products_net_imports: number | null;
  gasoline_retail_price: number | null;
};

export async function fetchData(fromDate: string, toDate: string): Promise<WeeklyReport[]> {
  const url = `${API_URL}/api/data?from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as WeeklyReport[];
}

export async function fetchLatest(): Promise<WeeklyReport | null> {
  const url = `${API_URL}/api/data/latest`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  const data = json.data;
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data as WeeklyReport;
}
