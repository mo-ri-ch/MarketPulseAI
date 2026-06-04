# MarketPulse AI

A live Indian-market intelligence dashboard. Aggregates news from a dozen-plus sources, summarises and sentiment-scores headlines with Gemini, streams live index and per-stock quotes from Yahoo Finance, and predicts next-day direction for any NSE ticker — all in one minimal 3-column UI.

Live deployment: [market-pulse-ai-topaz.vercel.app](https://market-pulse-ai-topaz.vercel.app)

---

## What it does

### Live market data
- **Header ticker** — NIFTY 50, SENSEX, BANK NIFTY, NIFTY IT, NIFTY MID, India VIX. Each card shows price, day-change %, and a sparkline. Polls every 2 s; the rightmost spark point is pinned to the live `regularMarketPrice` so it tracks intra-bar ticks, not just sealed 1-min candles. Hover the chart for an HH:MM:SS crosshair tooltip with the exact value at that instant.
- **Watchlist quotes** — every stock you add streams its real day-change from Yahoo (NSE `.NS` listings). 10 s polling; coalesced server-side so multiple watchlists hit Yahoo at most every 3 s.
- **IST clock** — 1 Hz ticking clock next to the LIVE pulse so you always know how fresh the screen is.

### News pipeline
A background `asyncio` task crawls 13 sources every 10 minutes from server boot:

| Tier | Sources |
|------|---------|
| Primary | NSE India, TradingView, Motilal Oswal |
| Secondary | Reuters, Yahoo Finance, Economic Times, LiveMint, Business Standard, CNBC TV18, Hindu BusinessLine |
| Aggregator RSS | Google News, Moneycontrol (via Google News `site:` query) |
| Community | Reddit (r/IndianStockMarket) |

Items are de-duplicated by URL, quality-filtered (drops nav labels, bylines, items < 25 chars), and given proper publish timestamps. A 2-day rolling window hard-deletes anything past the cutoff.

### AI layer
- **Gemini 2.0 Flash** runs sentiment scoring (`{positive, neutral, negative}`), unified summarisation across duplicate stories, and next-day predictive analysis (`UP` / `DOWN` / `NEUTRAL` with confidence).
- **Fallbacks** are local heuristics — the dashboard still works without a Gemini key, just with simpler analytics.

### Stock analysis
Click any watchlist row or type a ticker. The backend resolves it through a 140-entry alias dictionary (NIFTY 50 + popular retail names — IRCTC, SUZLON, IRFC, HAL, etc.), runs a targeted live Google News fetch for that company, joins it with sentiment-scored articles already in the DB, and ships a Gemini-generated rationale with key drivers and risks.

### Auth & persistence
- JWT auth (signup / login) with bcrypt password hashing.
- Per-user watchlists, persisted across sessions.

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  Next.js 16 frontend    │  HTTPS  │  FastAPI backend         │
│  (Vercel)               │ ──────▶ │  (Railway / Docker)      │
│                         │         │                          │
│  • Live ticker (2s)     │         │  • /market/indices       │
│  • Watchlist (10s)      │         │  • /market/quotes        │
│  • News feed (60s)      │         │  • /news/insights        │
│  • Stock analysis view  │         │  • /stocks/{q}/analysis  │
└─────────────────────────┘         └────────────┬─────────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          ▼                      ▼                      ▼
                  ┌──────────────┐      ┌──────────────┐       ┌──────────────┐
                  │ Yahoo        │      │ 13 news      │       │ Gemini API   │
                  │ Finance      │      │ crawlers     │       │ (gemini-     │
                  │ (chart API)  │      │ (10-min loop)│       │  2.0-flash)  │
                  └──────────────┘      └──────┬───────┘       └──────────────┘
                                               │
                                               ▼
                                       ┌──────────────┐
                                       │ Postgres /   │
                                       │ SQLite       │
                                       │ (SQLAlchemy) │
                                       └──────────────┘
```

The crawler loop is kicked off in the FastAPI [`lifespan`](backend/main.py) handler — opening the page never triggers a crawl, you just read whatever the 10-min cron has written.

---

## Tech stack

**Backend** — FastAPI · SQLAlchemy 2.0 · Alembic · httpx · BeautifulSoup4 · Gemini API · JWT (`python-jose`) · bcrypt · Sentry · Docker

**Frontend** — Next.js 16 (React 19) · TypeScript · Tailwind v4 · Lucide icons · Vercel

**Data** — Postgres in production, SQLite for local dev (auto-detected from `DATABASE_URL`)

---

## Project layout

```
StockMarketNews/
├── backend/
│   ├── ai/                  Gemini pipelines + alerts evaluator
│   ├── alembic/             DB migrations
│   ├── crawlers/
│   │   ├── agent.py         Orchestrator: fan-out, dedupe, save
│   │   ├── primary.py       NSE, TradingView, Motilal Oswal
│   │   ├── secondary.py     Reuters, ET, Mint, BS, CNBC, Hindu BL, RSS aggregators, Reddit
│   │   ├── sources.py       Ticker → alias dictionary (~140 entries)
│   │   └── extractor.py     Timestamp + ticker entity extraction
│   ├── routers/             Watchlist routes (auth-gated)
│   ├── main.py              FastAPI app, lifespan, /market/* endpoints
│   ├── models.py            SQLAlchemy: User, News, Source, Summary, SentimentScore, Watchlist
│   └── auth.py              JWT + bcrypt
│
├── frontend/
│   └── src/
│       ├── app/             Next.js app router (page.tsx, login/)
│       ├── components/
│       │   ├── MarketSummary.tsx     Live indices ticker with sparklines + hover tooltip
│       │   ├── WatchlistPanel.tsx    Per-stock real quotes
│       │   ├── BreakingNews.tsx      AI-summarised news feed
│       │   ├── SentimentPanel.tsx    Aggregate sentiment dial
│       │   └── StockAnalysisView.tsx Drill-down view with Gemini prediction
│       └── lib/api.ts       Auth + fetch helpers
│
├── docker-compose.yml
└── market_pulse_ai_updated_prd.md
```

---

## Running locally

### Prerequisites
- Python 3.10+ (3.13 used in dev)
- Node.js 18+
- (Optional) `GEMINI_API_KEY` — without it, AI features fall back to local heuristics

### Backend

```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt

# Create .env with at minimum:
#   SECRET_KEY=<jwt-signing-key>
#   GEMINI_API_KEY=<optional>
#   DATABASE_URL=<optional; defaults to local SQLite>
#   SENTRY_DSN=<optional>

# Tables are created on startup via lifespan — no manual alembic step needed
# for first run. To apply versioned migrations on top:
alembic upgrade head

uvicorn main:app --reload --port 8000
```

The first crawl kicks off ~immediately on boot. Watch progress at:
- `GET /health` — last crawl time, scheduler health, env presence
- `GET /debug/crawler-status` — per-crawler `{ok, count, error}` from the last run

### Frontend

```bash
cd frontend
npm install

# Optional .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API surface (selected)

| Endpoint | Purpose |
|----------|---------|
| `GET /market/indices` | 6 index ticker snapshot with 1-min sparklines + per-point timestamps |
| `GET /market/quotes?tickers=A,B,C` | Live day-change for a list of NSE stocks |
| `GET /news/insights` | News headlines joined with AI sentiment + summaries |
| `POST /news/fetch` | Trigger an immediate background crawl |
| `GET /stocks/{query}/analysis` | Gemini predictive analysis for a ticker |
| `POST /signup` · `POST /login` | JWT auth |
| `GET /watchlists` · `POST /watchlists` · `POST /watchlists/{id}/add` | Watchlist CRUD |
| `GET /health` · `GET /debug/crawler-status` | Operational visibility |

---

## Deployment

- **Backend** — Dockerfile in `backend/`. Deploys cleanly to Railway, Render, or Fly. Set `DATABASE_URL` to a managed Postgres instance for persistence.
- **Frontend** — Point Vercel at the `frontend/` subdirectory. The repo's current deployment lives at [market-pulse-ai-topaz.vercel.app](https://market-pulse-ai-topaz.vercel.app); the backend CORS allowlist already covers `*.vercel.app`.

---

## Notes & limitations

- Yahoo Finance is the live-quote source. For Indian indices it's near-real-time during NSE/BSE hours (≤ a few seconds); tick-by-tick exchange data would require a paid NSE/BSE feed.
- The 2-day news window is intentional — the AI sentiment is cheap to recompute and the UI is built around recency, not archives.
- Gemini calls degrade gracefully — every Gemini-backed endpoint has a local heuristic fallback so the dashboard never goes dark if the API key is missing or rate-limited.
