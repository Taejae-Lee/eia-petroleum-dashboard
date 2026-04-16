-- EIA Weekly Petroleum Status Report
-- 2020-01-01 ~ present, weekly

CREATE TABLE IF NOT EXISTS weekly_reports (
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL UNIQUE,   -- 데이터 기준일 (금요일)
  release_date    DATE NOT NULL,           -- EIA 발표일 (수요일)

  -- 1. 총재고 (million barrels)
  crude_total_stocks      NUMERIC(10,3),   -- Crude Oil (total incl. SPR)
  crude_commercial_stocks NUMERIC(10,3),   -- Commercial (Excl. SPR)
  crude_spr_stocks        NUMERIC(10,3),   -- Strategic Petroleum Reserve

  -- 2. 제품재고 (million barrels)
  gasoline_stocks         NUMERIC(10,3),   -- Total Motor Gasoline
  distillate_stocks       NUMERIC(10,3),   -- Distillate Fuel Oil
  jet_fuel_stocks         NUMERIC(10,3),   -- Kerosene-Type Jet Fuel

  -- 3. 정제소 가동율 (%)
  refinery_utilization    NUMERIC(5,1),    -- Percent Utilization (U.S. total)

  -- 4. 생산 (thousand barrels/day)
  domestic_production     NUMERIC(10,0),   -- Domestic Crude Production

  -- 5. 내재수요 / Product Supplied (thousand barrels/day)
  demand_gasoline         NUMERIC(10,0),   -- Finished Motor Gasoline
  demand_jet_fuel         NUMERIC(10,0),   -- Kerosene-Type Jet Fuel
  demand_distillate       NUMERIC(10,0),   -- Distillate Fuel Oil

  -- 6. 수출입 (thousand barrels/day, + = 순수입, - = 순수출)
  crude_net_imports       NUMERIC(10,0),   -- Crude Oil Net Imports
  products_net_imports    NUMERIC(10,0),   -- Total Products Net Imports

  -- 7. 제품가격 ($/gallon, EIA API 주간 — EMM_EPM0_PTE_NUS_DPG)
  gasoline_retail_price   NUMERIC(6,3),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_date ON weekly_reports(report_date DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_weekly_reports_updated_at
  BEFORE UPDATE ON weekly_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
