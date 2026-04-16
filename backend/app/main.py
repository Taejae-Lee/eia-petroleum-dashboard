import asyncio
import logging
import os
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.crawler import crawl_full, crawl_latest
from app.database import get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="EIA Weekly Petroleum Status API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Data endpoints
# ---------------------------------------------------------------------------


@app.get("/api/data")
async def get_data(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    """Return weekly report rows ordered by report_date ASC.

    Query params:
      from_date: YYYY-MM-DD (default: 1 year ago)
      to_date:   YYYY-MM-DD (default: today)
    """
    today = date.today()
    default_from = (today - timedelta(days=365)).isoformat()
    default_to = today.isoformat()

    from_dt = from_date or default_from
    to_dt = to_date or default_to

    supabase = get_supabase()
    response = (
        supabase.table("weekly_reports")
        .select("*")
        .gte("report_date", from_dt)
        .lte("report_date", to_dt)
        .order("report_date", desc=False)
        .execute()
    )

    rows = response.data or []
    return {"data": rows, "count": len(rows)}


@app.get("/api/data/latest")
async def get_latest():
    """Return the most recent weekly report row."""
    supabase = get_supabase()
    response = (
        supabase.table("weekly_reports")
        .select("*")
        .order("report_date", desc=True)
        .limit(1)
        .execute()
    )

    rows = response.data or []
    record = rows[0] if rows else None
    return {"data": record}


# ---------------------------------------------------------------------------
# Futures prices — EIA spot prices (RWTC = WTI, RBRTE = Brent)
# ---------------------------------------------------------------------------

_EIA_SPT_URL = "https://api.eia.gov/v2/petroleum/pri/spt/data/"


@app.get("/api/prices/futures")
async def get_futures_prices():
    """Return WTI and Brent daily spot prices from EIA API v2."""
    api_key = os.environ.get("EIA_API_KEY", "")
    params = [
        ("api_key", api_key),
        ("frequency", "daily"),
        ("data[0]", "value"),
        ("facets[series][]", "RWTC"),   # WTI Cushing spot
        ("facets[series][]", "RBRTE"),  # Brent spot
        ("sort[0][column]", "period"),
        ("sort[0][direction]", "desc"),
        ("length", "10"),
    ]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_EIA_SPT_URL, params=params)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"EIA API error: {exc}") from exc

    items = resp.json().get("response", {}).get("data", [])

    by_series: dict = defaultdict(list)
    for item in items:
        by_series[item.get("series", "")].append(item)

    def extract(series_id: str) -> Optional[dict]:
        rows = by_series.get(series_id, [])
        if not rows:
            return None
        latest = rows[0]
        price = latest.get("value")
        if price is None:
            return None
        prev_price = rows[1].get("value") if len(rows) > 1 else None
        change = round(float(price) - float(prev_price), 2) if prev_price is not None else None
        change_pct = round((change / float(prev_price)) * 100, 2) if (change is not None and prev_price) else None
        return {
            "price": float(price),
            "change": change,
            "change_pct": change_pct,
            "currency": "USD",
            "date": latest.get("period"),
        }

    wti = extract("RWTC")
    brent = extract("RBRTE")
    if wti is None and brent is None:
        raise HTTPException(status_code=502, detail="EIA returned no spot price data")
    return {"wti": wti, "brent": brent}


# ---------------------------------------------------------------------------
# Admin crawl endpoints
# ---------------------------------------------------------------------------


async def _run_crawl_full():
    try:
        await crawl_full()
    except Exception as exc:
        logger.error("crawl_full raised an exception: %s", exc)


async def _run_crawl_latest():
    try:
        await crawl_latest()
    except Exception as exc:
        logger.error("crawl_latest raised an exception: %s", exc)


@app.post("/admin/crawl/full")
async def admin_crawl_full(background_tasks: BackgroundTasks):
    """Trigger a full crawl of all historical EIA weekly reports."""
    background_tasks.add_task(_run_crawl_full)
    return {"message": "Full crawl started"}


@app.post("/admin/crawl/latest")
async def admin_crawl_latest(background_tasks: BackgroundTasks):
    """Trigger a crawl of the most recent EIA weekly report."""
    background_tasks.add_task(_run_crawl_latest)
    return {"message": "Latest crawl started"}
