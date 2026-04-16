from __future__ import annotations

import asyncio
import csv
import io
import logging
import os
import re
from datetime import date, timedelta

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

logger = logging.getLogger(__name__)

ARCHIVE_INDEX_URL = "https://www.eia.gov/petroleum/supply/weekly/archive/"
EIA_GASOLINE_API_URL = "https://api.eia.gov/v2/petroleum/pri/gnd/data/"
REQUEST_TIMEOUT = 60.0
RETRY_ATTEMPTS = 3
POLITE_DELAY = 0.5  # seconds between CSV requests within a single report


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


async def _get(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    """GET with retry logic (3 attempts, 2s backoff)."""
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            response = await client.get(url, timeout=REQUEST_TIMEOUT, **kwargs)
            response.raise_for_status()
            return response
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            if attempt == RETRY_ATTEMPTS:
                raise
            wait = 2 ** attempt
            logger.warning("Attempt %d failed for %s: %s. Retrying in %ds.", attempt, url, exc, wait)
            await asyncio.sleep(wait)
    raise RuntimeError("Unreachable")


# ---------------------------------------------------------------------------
# Archive index parsing
# ---------------------------------------------------------------------------


async def get_archive_urls(start_year: int = 2020) -> list[dict]:
    """Fetch all report URLs from the archive index page.

    Returns a list of dicts: {release_date: date, csv_base: str}
    where csv_base is the base URL path for downloading CSVs.
    """
    # Pattern: archive/{YYYY}/{YYYY_MM_DD}/wpsr_{YYYY_MM_DD}.php
    pattern = re.compile(
        r'href="(/petroleum/supply/weekly/archive/(\d{4})/(\d{4}_\d{2}_\d{2})/wpsr_\d{4}_\d{2}_\d{2}\.php)"'
    )
    base = "https://www.eia.gov"

    async with httpx.AsyncClient() as client:
        resp = await _get(client, ARCHIVE_INDEX_URL)
        html = resp.text

    results: list[dict] = []
    seen: set[str] = set()

    for match in pattern.finditer(html):
        href = match.group(1)
        year = int(match.group(2))
        date_str = match.group(3)  # YYYY_MM_DD

        if year < start_year:
            continue
        if href in seen:
            continue
        seen.add(href)

        # Parse release date from the folder name (YYYY_MM_DD)
        try:
            release_date = date(int(date_str[:4]), int(date_str[5:7]), int(date_str[8:10]))
        except ValueError:
            logger.warning("Could not parse date from %s", date_str)
            continue

        # CSV base URL: replace wpsr_*.php page URL with csv/ subdirectory
        # e.g. .../archive/2026/2026_04_03/ → csv base
        folder = "/".join(href.split("/")[:-1])  # strip filename
        csv_base = f"{base}{folder}/csv/"

        results.append({"release_date": release_date, "csv_base": csv_base})

    # Sort oldest first so progress logging makes sense
    results.sort(key=lambda x: x["release_date"])
    return results


# ---------------------------------------------------------------------------
# CSV fetching
# ---------------------------------------------------------------------------


async def fetch_csv_rows(url: str) -> list[list[str]]:
    """Download CSV, decode latin-1, return parsed rows."""
    async with httpx.AsyncClient() as client:
        resp = await _get(client, url)

    content = resp.content.decode("latin-1")
    reader = csv.reader(io.StringIO(content))
    return [row for row in reader]


# ---------------------------------------------------------------------------
# Number parsing
# ---------------------------------------------------------------------------


def parse_number(s: str) -> float | None:
    """Strip non-numeric chars (except dot and leading minus), return float or None."""
    if not s:
        return None
    # Replace en-dash (0x96 / U+2013) and other dash-like chars with minus
    cleaned = s.replace("\x96", "-").replace("\u2013", "-").replace("\u2014", "-")
    # Keep only digits, dot, and a potential leading minus
    cleaned = cleaned.strip()
    # Remove commas used as thousands separators
    cleaned = cleaned.replace(",", "")
    # Strip any remaining non-numeric chars except dot and minus
    cleaned = re.sub(r"[^\d.\-]", "", cleaned)
    if not cleaned or cleaned in ("-", "."):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Table parsers
# ---------------------------------------------------------------------------


def _is_double_stub(row: list[str]) -> bool:
    """Return True if this is a double-stub row (row[1] is not numeric)."""
    if len(row) < 2:
        return False
    try:
        float(row[1].replace(",", ""))
        return False
    except ValueError:
        return True


def parse_table1(rows: list[list[str]]) -> dict:
    """Extract stocks, production, and demand fields from table1 rows."""
    result: dict = {}

    # Flags to grab first occurrence only
    _crude_total_done = False
    _gasoline_done = False
    _distillate_done = False
    _jet_fuel_done = False

    for row in rows:
        if not row:
            continue

        double = _is_double_stub(row)

        if not double:
            # Single-stub: row[0]=item, row[1]=value
            name = row[0].strip() if len(row) > 0 else ""
            val_str = row[1].strip() if len(row) > 1 else ""

            if name == "Crude Oil" and not _crude_total_done:
                result["crude_total_stocks"] = parse_number(val_str)
                _crude_total_done = True
            elif name == "Commercial (Excluding SPR)":
                if "crude_commercial_stocks" not in result:
                    result["crude_commercial_stocks"] = parse_number(val_str)
            elif name == "Strategic Petroleum Reserve (SPR)":
                if "crude_spr_stocks" not in result:
                    result["crude_spr_stocks"] = parse_number(val_str)
            elif name == "Total Motor Gasoline" and not _gasoline_done:
                result["gasoline_stocks"] = parse_number(val_str)
                _gasoline_done = True
            elif name == "Distillate Fuel Oil" and not _distillate_done:
                result["distillate_stocks"] = parse_number(val_str)
                _distillate_done = True
            elif name == "Kerosene-Type Jet Fuel" and not _jet_fuel_done:
                result["jet_fuel_stocks"] = parse_number(val_str)
                _jet_fuel_done = True

        else:
            # Double-stub: row[0]=category, row[1]=item, row[2]=value
            cat = row[0].strip() if len(row) > 0 else ""
            item = row[1].strip() if len(row) > 1 else ""
            val_str = row[2].strip() if len(row) > 2 else ""

            if "Crude Oil Supply" in cat and "(1)" in item:
                if "domestic_production" not in result:
                    result["domestic_production"] = parse_number(val_str)
            elif "Products Supplied" in cat:
                if "(31)" in item and "demand_gasoline" not in result:
                    result["demand_gasoline"] = parse_number(val_str)
                elif "(32)" in item and "demand_jet_fuel" not in result:
                    result["demand_jet_fuel"] = parse_number(val_str)
                elif "(33)" in item and "demand_distillate" not in result:
                    result["demand_distillate"] = parse_number(val_str)

    return result


def parse_table2(rows: list[list[str]]) -> dict:
    """Extract refinery_utilization from table2 rows."""
    result: dict = {}

    for row in rows:
        if len(row) < 3:
            continue
        cat = row[0].strip()
        item = row[1].strip()
        val_str = row[2].strip()

        if "Refiner Inputs" in cat and "Percent Utilization" in item:
            result["refinery_utilization"] = parse_number(val_str)
            break

    return result


def parse_table7(rows: list[list[str]]) -> dict:
    """Extract crude_net_imports and products_net_imports from table7 rows."""
    result: dict = {}

    for row in rows:
        if len(row) < 2:
            continue
        name = row[0].strip()
        val_str = row[1].strip()

        if "Crude Oil Net Imports" in name and "crude_net_imports" not in result:
            result["crude_net_imports"] = parse_number(val_str)
        elif name == "Total Products Net Imports" and "products_net_imports" not in result:
            result["products_net_imports"] = parse_number(val_str)

    return result


# ---------------------------------------------------------------------------
# Report date extraction
# ---------------------------------------------------------------------------


def _parse_report_date_from_table1_header(rows: list[list[str]]) -> date | None:
    """Parse report_date from the header row of table1 (column index 1)."""
    for row in rows:
        if not row:
            continue
        # Header row contains STUB_1 in first cell
        if "STUB_1" in row[0] and len(row) > 1:
            date_str = row[1].strip().strip('"')
            # Format: M/D/YY  e.g. "4/3/26"
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
                    if year < 100:
                        year += 2000
                    return date(year, month, day)
            except (ValueError, IndexError):
                pass
    return None


# ---------------------------------------------------------------------------
# Crawl a single report
# ---------------------------------------------------------------------------


async def crawl_report(
    release_date: date,
    csv_base: str,
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
) -> dict | None:
    """Download table1, table2, table7 concurrently, merge results."""
    async def fetch(table: str) -> list[list[str]]:
        async with sem:
            resp = await _get(client, f"{csv_base}{table}.csv")
            content = resp.content.decode("latin-1")
            return list(csv.reader(io.StringIO(content)))

    try:
        t1_rows, t2_rows, t7_rows = await asyncio.gather(
            fetch("table1"), fetch("table2"), fetch("table7")
        )
    except Exception as exc:
        logger.error("Failed to download CSVs for release_date=%s: %s", release_date, exc)
        return None

    # Parse report_date from table1 header
    report_date = _parse_report_date_from_table1_header(t1_rows)
    if report_date is None:
        logger.error("Could not parse report_date for release_date=%s", release_date)
        return None

    data: dict = {
        "report_date": report_date.isoformat(),
        "release_date": release_date.isoformat(),
    }

    try:
        data.update(parse_table1(t1_rows))
    except Exception as exc:
        logger.error("parse_table1 failed for %s: %s", release_date, exc)

    try:
        data.update(parse_table2(t2_rows))
    except Exception as exc:
        logger.error("parse_table2 failed for %s: %s", release_date, exc)

    try:
        data.update(parse_table7(t7_rows))
    except Exception as exc:
        logger.error("parse_table7 failed for %s: %s", release_date, exc)

    return data


# ---------------------------------------------------------------------------
# EIA gasoline price API
# ---------------------------------------------------------------------------


async def fetch_eia_gasoline_prices() -> dict[str, float]:
    """Call EIA API, return dict of {report_date_str (Friday ISO): price}."""
    api_key = os.environ.get("EIA_API_KEY", "")
    params = {
        "api_key": api_key,
        "frequency": "weekly",
        "data[0]": "value",
        "facets[duoarea][]": "NUS",
        "facets[product][]": "EPM0",
        "start": "2020-01-01",
        "length": "5000",
    }

    async with httpx.AsyncClient() as client:
        resp = await _get(client, EIA_GASOLINE_API_URL, params=params)

    payload = resp.json()
    items = payload.get("response", {}).get("data", [])

    prices: dict[str, float] = {}
    for item in items:
        period_str = item.get("period")  # "YYYY-MM-DD" Monday
        value = item.get("value")
        if not period_str or value is None:
            continue
        try:
            period_date = date.fromisoformat(period_str)
            # Map Monday → Friday (+4 days)
            friday = period_date + timedelta(days=4)
            prices[friday.isoformat()] = float(value)
        except (ValueError, TypeError):
            continue

    return prices


# ---------------------------------------------------------------------------
# Full crawl
# ---------------------------------------------------------------------------


async def crawl_full(start_year: int = 2020):
    """Full crawl: all reports + EIA prices → upsert to Supabase (parallel)."""
    from app.database import get_supabase

    supabase = get_supabase()

    logger.info("Fetching archive URLs from %d onward...", start_year)
    urls = await get_archive_urls(start_year)
    logger.info("Found %d report URLs.", len(urls))

    logger.info("Fetching EIA gasoline prices...")
    try:
        prices = await fetch_eia_gasoline_prices()
        logger.info("Fetched %d price entries.", len(prices))
    except Exception as exc:
        logger.error("Failed to fetch EIA gasoline prices: %s", exc)
        prices = {}

    # Semaphore: 최대 동시 HTTP 요청 수 제한 (60 = 리포트 20개 × CSV 3개)
    sem = asyncio.Semaphore(60)

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        async def process(entry: dict) -> bool:
            record = await crawl_report(entry["release_date"], entry["csv_base"], client, sem)
            if record is None:
                return False
            report_date_str = record.get("report_date")
            if report_date_str and report_date_str in prices:
                record["gasoline_retail_price"] = prices[report_date_str]
            try:
                supabase.table("weekly_reports").upsert(record, on_conflict="report_date").execute()
                return True
            except Exception as exc:
                logger.error("Upsert failed for %s: %s", report_date_str, exc)
                return False

        # 20개씩 배치로 병렬 처리
        BATCH = 20
        success = 0
        errors = 0
        for batch_start in range(0, len(urls), BATCH):
            batch = urls[batch_start: batch_start + BATCH]
            results = await asyncio.gather(*[process(e) for e in batch])
            success += sum(results)
            errors += sum(1 for r in results if not r)
            done = batch_start + len(batch)
            logger.info("Progress: %d/%d (success=%d, errors=%d)", done, len(urls), success, errors)

    logger.info("Crawl complete: %d success, %d errors out of %d reports.", success, errors, len(urls))


# ---------------------------------------------------------------------------
# Latest-only crawl
# ---------------------------------------------------------------------------


async def crawl_latest():
    """Crawl only the most recent report."""
    from app.database import get_supabase

    supabase = get_supabase()

    urls = await get_archive_urls(start_year=2020)
    if not urls:
        logger.warning("No archive URLs found.")
        return

    entry = urls[-1]  # most recent
    release_date: date = entry["release_date"]
    csv_base: str = entry["csv_base"]

    logger.info("Crawling latest report: release_date=%s", release_date)

    sem = asyncio.Semaphore(10)
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        record = await crawl_report(release_date, csv_base, client, sem)
    if record is None:
        logger.error("Failed to crawl latest report.")
        return

    # Fetch gasoline price for this single date
    try:
        prices = await fetch_eia_gasoline_prices()
        report_date_str = record.get("report_date")
        if report_date_str and report_date_str in prices:
            record["gasoline_retail_price"] = prices[report_date_str]
    except Exception as exc:
        logger.warning("Could not fetch gasoline price: %s", exc)

    try:
        supabase.table("weekly_reports").upsert(record, on_conflict="report_date").execute()
        logger.info("Upserted latest report: report_date=%s", record.get("report_date"))
    except Exception as exc:
        logger.error("Upsert failed: %s", exc)
