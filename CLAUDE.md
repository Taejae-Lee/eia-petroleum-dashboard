# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EIA Weekly Petroleum Status Report 시각화 PWA.
- EIA 주간 원유·제품 데이터를 크롤링해 DB에 적재, 7개 카테고리로 시각화.
- 데이터 범위: 2020-01-01 ~ 현재, 매주 수요일 업데이트.

## Architecture

```
backend/    FastAPI — 크롤러 + REST API        → Render (free)
frontend/   Next.js 15 PWA — 7개 카테고리 차트 → Vercel (free)
supabase/   PostgreSQL 스키마 + 마이그레이션   → Supabase (free)
```

## Data Sources

| 카테고리 | 소스 | 파일/시리즈 |
|---------|------|------------|
| 1. 총재고 | EIA Archive CSV | table1.csv |
| 2. 제품재고 | EIA Archive CSV | table1.csv |
| 3. 정제소가동율 | EIA Archive CSV | table2.csv (row: Percent Utilization) |
| 4. 생산 | EIA Archive CSV | table1.csv (Crude Oil Supply > Domestic Production) |
| 5. 내재수요 | EIA Archive CSV | table1.csv (Products Supplied 섹션) |
| 6. 수출입 | EIA Archive CSV | table7.csv |
| 7. 제품가격 | EIA API v2 | EMM_EPM0_PTE_NUS_DPG (주간, $/gallon) |

Archive URL 패턴:
```
https://www.eia.gov/petroleum/supply/weekly/archive/{YYYY}/{YYYY_MM_DD}/csv/table{N}.csv
```

CSV 인코딩: latin-1 (UTF-8 아님 — 0x96 문자 포함)

## Commands

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 전체 크롤링 (최초 1회)
curl -X POST http://localhost:8000/admin/crawl/full

# 최신 1주 업데이트
curl -X POST http://localhost:8000/admin/crawl/latest
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # localhost:3000
npm run build
```

### DB Migration
Supabase 대시보드 SQL Editor에서 실행:
```
supabase/migrations/001_initial.sql
```

## Environment Variables

`.env` 파일 (루트에 위치, gitignore됨):
```
SUPABASE_URL=https://wgaeriwwfeooojstcqoy.supabase.co
SUPABASE_ANON_KEY=eyJ...
EIA_API_KEY=...
BACKEND_URL=http://localhost:8000
```

## Hooks (Harness Engineering)

`.claude/settings.json`에 3개 훅 설정:
- **PostToolUse(Write/Edit)**: Python 파일 저장 시 ruff format 자동 실행
- **PreToolUse(Bash)**: 위험한 명령어 감지 시 경고 출력
- **Stop**: 작업 완료 시 git status 요약 출력

## Key Implementation Notes

- CSV 파싱 시 `encoding='latin-1'` 필수 (일부 셀에 0x96 en-dash 포함)
- table7.csv의 `Total Products Net Imports` 값에 `\x96` 문자 포함될 수 있음 → 숫자 파싱 시 정규식으로 제거
- EIA API 주간 가격은 Monday 기준, Archive CSV는 Friday 기준 → DB 저장 시 report_date를 Friday로 통일
- Render 무료 플랜은 15분 미사용 시 sleep → /health 엔드포인트로 keep-alive 불필요 (크롤러는 on-demand)
