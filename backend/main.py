from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import asyncio
import os
from datetime import datetime

# Set up centralized logging before importing local modules
from logger_config import setup_logging
setup_logging()

from database import get_db
import models, schemas, auth
from crawlers.agent import fetch_and_save
from routers.watchlist import router as watchlist_router

load_dotenv()

import sentry_sdk

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=1.0,
        send_default_pii=True
    )

# Track last successful crawl time for /health endpoint
_last_crawl_at: datetime | None = None


def _iso_utc(dt) -> str | None:
    """
    Serialize a datetime as an ISO string the frontend will parse as UTC.
    All persisted timestamps in this app are naive-UTC by convention
    (extract_timestamp normalizes to UTC, fallback uses utcnow). Append a
    'Z' so JavaScript's Date constructor doesn't reinterpret the value as
    the user's local timezone, which was producing negative "ago" values.
    """
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is not None:
        # Already timezone-aware — let isoformat add the offset.
        return dt.isoformat()
    return dt.isoformat() + "Z"


async def _cron_crawler_loop():
    """Background task: crawls all sources every 10 minutes."""
    import logging
    global _last_crawl_at
    logger = logging.getLogger(__name__)
    logger.info("[Scheduler] 24/7 crawler loop started.")
    while True:
        try:
            logger.info("[Scheduler] Triggering scheduled news crawl...")
            await fetch_and_save()
            _last_crawl_at = datetime.utcnow()
            logger.info("[Scheduler] Scheduled news crawl complete.")
        except Exception as e:
            logger.error(f"[Scheduler] Error in scheduled crawl: {e}")
        # Wait 10 minutes before next crawl
        await asyncio.sleep(600)


def _run_startup_db_tasks():
    """Synchronous DB setup: create tables, self-heal schema, add indexes."""
    import logging
    from database import engine, Base
    from sqlalchemy import inspect, text

    Base.metadata.create_all(bind=engine)

    # Self-healing migration: ensure is_archived column exists
    inspector = inspect(engine)
    try:
        columns = [c["name"] for c in inspector.get_columns("news")]
        if "is_archived" not in columns:
            with engine.begin() as conn:
                driver = engine.url.drivername
                if "postgresql" in driver:
                    conn.execute(text("ALTER TABLE news ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL"))
                else:
                    conn.execute(text("ALTER TABLE news ADD COLUMN is_archived BOOLEAN DEFAULT 0 NOT NULL"))
            logging.getLogger(__name__).info("[Startup] Added is_archived column to news table.")
    except Exception as e:
        logging.getLogger(__name__).warning(f"[Startup] Migration check failed: {e}")

    # Ensure index on published_at for query performance
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_news_published_at ON news (published_at)"))
        logging.getLogger(__name__).info("[Startup] Verified index on news (published_at).")
    except Exception as e:
        logging.getLogger(__name__).warning(f"[Startup] Index creation failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Async lifespan handler — runs in the event loop so create_task works correctly."""
    # Synchronous DB setup (safe to call from async context)
    _run_startup_db_tasks()
    # Kick off the 24/7 crawler loop as a proper async background task
    task = asyncio.create_task(_cron_crawler_loop())
    yield
    # Graceful shutdown: cancel the crawler loop
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Market Pulse AI Backend", lifespan=lifespan)



app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://market-pulse-ai-topaz.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Return JSON (not plain text) for unhandled exceptions so the browser
    receives a CORS-decorated response instead of a raw 500 it can't read.
    Without this, axios just sees "Network Error" / no response.
    """
    import logging
    logging.getLogger(__name__).error(
        f"[Unhandled] {request.method} {request.url.path}: {type(exc).__name__}: {exc}\n"
        f"{traceback.format_exc()}"
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)}"},
    )


app.include_router(watchlist_router, tags=["watchlists"])

@app.get("/")
def read_root():
    return {"message": "Market Pulse AI API is running"}

@app.get("/health")
def health_check():
    from crawlers.agent import LAST_CRAWLER_STATS, LAST_PIPELINE_STATUS
    from database import engine
    now = datetime.utcnow()
    seconds_since_crawl = (now - _last_crawl_at).total_seconds() if _last_crawl_at else None
    ok_count = sum(1 for s in LAST_CRAWLER_STATS.values() if s.get("ok"))
    total_count = len(LAST_CRAWLER_STATS)
    return {
        "status": "ok",
        "now_utc": now.isoformat(),
        "last_crawl_at": _last_crawl_at.isoformat() if _last_crawl_at else None,
        "seconds_since_last_crawl": seconds_since_crawl,
        "crawl_interval_minutes": 10,
        "scheduler_appears_stalled": seconds_since_crawl is not None and seconds_since_crawl > 900,
        "crawlers_succeeding": f"{ok_count}/{total_count}" if total_count else "no crawl yet",
        "ai_pipeline": LAST_PIPELINE_STATUS,
        "db_driver": engine.url.drivername,
        "db_persistent": not engine.url.drivername.startswith("sqlite"),
        "env_present": {
            "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
            "DATABASE_URL": bool(os.getenv("DATABASE_URL")),
            "SECRET_KEY": bool(os.getenv("SECRET_KEY")),
            "SENTRY_DSN": bool(os.getenv("SENTRY_DSN")),
        },
    }


# ── Live Market Indices ──────────────────────────────────────────────────────

# Yahoo Finance symbols for Indian market indices.
# Display name → (yahoo symbol, decimal precision)
_INDEX_SYMBOLS: list[tuple[str, str, int]] = [
    ("NIFTY 50",   "^NSEI",      2),
    ("SENSEX",     "^BSESN",     2),
    ("BANK NIFTY", "^NSEBANK",   2),
    ("NIFTY IT",   "^CNXIT",     2),
    ("NIFTY MID",  "^NSEMDCP50", 2),
    ("VIX",        "^INDIAVIX",  2),
]

# In-process cache so we don't hammer Yahoo when many tabs poll us at once.
# 1.5s TTL is short enough that a 2s frontend poll still sees fresh data on
# every other tick, while still coalescing burst load from multiple clients.
_INDICES_CACHE: dict = {"at": 0.0, "data": None}
_INDICES_TTL = 1.5  # seconds

# How many 1-minute spark points to keep — most recent ~hour of trading.
_SPARK_KEEP = 60


async def _fetch_index(client, display_name: str, symbol: str, precision: int) -> dict | None:
    """Fetch one index from Yahoo Finance v8 chart API. Returns None on failure."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    # 1m bars for near-real-time intraday resolution. Yahoo backfills the
    # current minute's bar continuously, so the right edge of the chart
    # tracks the live tape closely during market hours.
    params = {"interval": "1m", "range": "1d", "includePrePost": "false"}
    try:
        r = await client.get(url, params=params, timeout=8.0)
        if r.status_code != 200:
            return None
        payload = r.json()
        result = payload.get("chart", {}).get("result")
        if not result:
            return None
        node = result[0]
        meta = node.get("meta", {}) or {}
        timestamps = node.get("timestamp") or []
        quote = (node.get("indicators", {}) or {}).get("quote", [{}])[0] or {}
        closes_raw = quote.get("close") or []

        # Forward-fill nulls so the spark has no gaps and the latest value is
        # the most recent real print.
        spark: list[float] = []
        last: float | None = None
        for c in closes_raw:
            if c is not None:
                last = float(c)
            if last is not None:
                spark.append(round(last, precision))

        # Pin the rightmost spark point to the live regular-market price so
        # the chart edge tracks intra-bar ticks instead of jumping only when
        # Yahoo seals a 1m bar.
        live_price = meta.get("regularMarketPrice")
        if live_price is not None and spark:
            live_rounded = round(float(live_price), precision)
            if spark[-1] != live_rounded:
                spark.append(live_rounded)

        current = (live_price if live_price is not None else (spark[-1] if spark else None))
        prev_close = (
            meta.get("chartPreviousClose")
            or meta.get("previousClose")
        )
        if current is None or prev_close in (None, 0):
            return None

        current = float(current)
        prev_close = float(prev_close)
        change = current - prev_close
        change_pct = (change / prev_close) * 100.0

        # Keep the most recent N points at full 1m resolution so the chart
        # visibly slides as new bars arrive, instead of an evenly downsampled
        # view of the whole day which makes recent motion invisible.
        if len(spark) > _SPARK_KEEP:
            spark = spark[-_SPARK_KEEP:]

        return {
            "name": display_name,
            "symbol": symbol,
            "value": round(current, precision),
            "prev_close": round(prev_close, precision),
            "change": round(change, precision),
            "change_pct": round(change_pct, 2),
            "up": change >= 0,
            "spark": spark,
            "ts": (timestamps[-1] if timestamps else None),
        }
    except Exception:
        return None


@app.get("/market/indices")
async def market_indices(response: Response):
    """
    Live Indian market indices snapshot for the header ticker.

    Pulls NIFTY 50, SENSEX, BANK NIFTY, NIFTY IT, NIFTY MID, and India VIX
    from Yahoo Finance's public chart API in parallel. Cached for a few
    seconds to absorb burst polling.
    """
    import time
    import httpx
    import asyncio as _asyncio

    now = time.time()
    if _INDICES_CACHE["data"] is not None and (now - _INDICES_CACHE["at"]) < _INDICES_TTL:
        response.headers["Cache-Control"] = "no-store"
        return _INDICES_CACHE["data"]

    headers = {
        # Yahoo's chart endpoint 403s without a browser-ish UA.
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json,text/plain,*/*",
    }
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        results = await _asyncio.gather(
            *[_fetch_index(client, name, sym, prec) for name, sym, prec in _INDEX_SYMBOLS]
        )

    indices = []
    for spec, res in zip(_INDEX_SYMBOLS, results):
        name, symbol, _ = spec
        if res is not None:
            indices.append(res)
        elif _INDICES_CACHE["data"]:
            # Fall back to the last known good value for this symbol so a
            # single Yahoo hiccup doesn't blank out an index card.
            stale = next(
                (i for i in _INDICES_CACHE["data"]["indices"] if i["symbol"] == symbol),
                None,
            )
            if stale:
                indices.append({**stale, "stale": True})

    snapshot = {
        "as_of": datetime.utcnow().isoformat() + "Z",
        "indices": indices,
    }
    _INDICES_CACHE["data"] = snapshot
    _INDICES_CACHE["at"] = now
    response.headers["Cache-Control"] = "no-store"
    return snapshot


@app.get("/debug/crawler-status")
def debug_crawler_status():
    """Per-crawler success/failure from the most recent scheduled crawl."""
    from crawlers.agent import LAST_CRAWLER_STATS, LAST_PIPELINE_STATUS, ALL_CRAWLERS
    registered = [c.__class__.__name__ for c in ALL_CRAWLERS]
    return {
        "last_crawl_at": _last_crawl_at.isoformat() if _last_crawl_at else None,
        "registered_crawlers": registered,
        "per_crawler": LAST_CRAWLER_STATS,
        "ai_pipeline": LAST_PIPELINE_STATUS,
        "summary": {
            "ok": sum(1 for s in LAST_CRAWLER_STATS.values() if s.get("ok")),
            "failed": sum(1 for s in LAST_CRAWLER_STATS.values() if s.get("ok") is False),
            "total_items_last_run": sum(s.get("count", 0) for s in LAST_CRAWLER_STATS.values()),
        },
    }

@app.get("/debug/db-details")
def debug_db_details(db: Session = Depends(get_db)):
    sources = db.query(models.Source).all()
    news_count = db.query(models.News).count()
    news_unarchived = db.query(models.News).filter(models.News.is_archived == False).count()
    news_items = db.query(models.News).order_by(models.News.published_at.desc()).limit(15).all()
    
    return {
        "sources": [{"id": s.id, "name": s.name, "url": s.url, "rank": s.rank} for s in sources],
        "news_count": news_count,
        "news_unarchived_count": news_unarchived,
        "latest_news": [
            {
                "id": n.id,
                "headline": n.headline,
                "url": n.url,
                "source_id": n.source_id,
                "published_at": _iso_utc(n.published_at),
                "is_archived": n.is_archived
            }
            for n in news_items
        ]
    }





# ── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/signup", response_model=schemas.UserResponse)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login", response_model=schemas.Token)
def login(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user or not auth.verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": db_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# ── News Crawling ─────────────────────────────────────────────────────────────

@app.post("/news/fetch")
async def trigger_news_fetch(background_tasks: BackgroundTasks):
    """Trigger all crawlers concurrently. Runs in background so response is instant."""
    background_tasks.add_task(fetch_and_save)
    return {"message": "News fetch triggered in background."}

@app.get("/news")
def get_news(response: Response, db: Session = Depends(get_db), skip: int = 0, limit: int = 1000):
    """Return latest news items from the database."""
    from crawlers.agent import archive_old_news
    from sqlalchemy import func
    archive_old_news(db)

    # COALESCE so items missing a real publish time still sort sensibly by
    # when we first saw them — and never sort to the bottom in a NULL pile.
    effective_time = func.coalesce(models.News.published_at, models.News.created_at)

    news = (
        db.query(models.News)
        .filter(models.News.is_archived == False)
        .order_by(effective_time.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return [
        {
            "id": n.id,
            "headline": n.headline,
            "url": n.url,
            "source_id": n.source_id,
            "published_at": _iso_utc(n.published_at or n.created_at),
        }
        for n in news
    ]

# ── AI Processing ─────────────────────────────────────────────────────────────

@app.post("/news/analyse")
async def analyse_news():
    """
    Full pipeline: crawl all sources → deduplicate → sentiment → summarize → rank.
    Returns top stories enriched with AI insights.
    """
    from crawlers.agent import run_all_crawlers
    from ai.pipeline import run_full_pipeline

    news_items = await run_all_crawlers()
    result = await run_full_pipeline(news_items)
    return result

@app.get("/news/insights")
def get_insights(response: Response, db: Session = Depends(get_db), limit: int = 1000):
    """Return news articles with their AI summaries, sentiment scores, and source details."""
    from crawlers.agent import archive_old_news
    from sqlalchemy import func
    archive_old_news(db)

    effective_time = func.coalesce(models.News.published_at, models.News.created_at)

    rows = (
        db.query(models.News, models.Source, models.Summary, models.SentimentScore)
        .outerjoin(models.Source, models.Source.id == models.News.source_id)
        .outerjoin(models.Summary, models.Summary.news_id == models.News.id)
        .outerjoin(models.SentimentScore, models.SentimentScore.news_id == models.News.id)
        .filter(models.News.is_archived == False)
        .order_by(effective_time.desc())
        .limit(limit)
        .all()
    )
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return [
        {
            "id": news.id,
            "headline": news.headline,
            "url": news.url,                          # exact article URL from crawler
            "source": source.name if source else None,
            "source_url": source.url if source else None,
            "published_at": _iso_utc(news.published_at or news.created_at),
            "summary": summary.ai_summary if summary else None,
            "sentiment": {
                "positive": sentiment.positive if sentiment else 0,
                "neutral":  sentiment.neutral  if sentiment else 1,
                "negative": sentiment.negative if sentiment else 0,
            } if sentiment else None,
        }
        for news, source, summary, sentiment in rows
    ]


@app.get("/stocks/{query}/analysis")
async def get_stock_analysis(query: str, db: Session = Depends(get_db)):
    """
    Perform stock predictive sentiment analysis and return key stock insights.
    Identifies related news in the DB, calculates sentiment, and runs Gemini AI
    (or local fallback) to predict movement direction tomorrow.
    """
    import re
    import json
    import httpx
    from crawlers.sources import NIFTY50_TICKERS

    ticker = None
    company_name = None
    query_clean = query.strip().upper()

    # 1. Resolve query to ticker symbol
    if query_clean in NIFTY50_TICKERS:
        ticker = query_clean
    else:
        # Case-insensitive alias match
        for t, aliases in NIFTY50_TICKERS.items():
            if any(query_clean == alias.upper() for alias in aliases):
                ticker = t
                break
        
        # Substring match on ticker or aliases
        if not ticker:
            for t, aliases in NIFTY50_TICKERS.items():
                if any(query_clean in alias.upper() for alias in aliases) or query_clean in t:
                    ticker = t
                    break

    # Resolve company name and aliases
    if ticker:
        aliases = NIFTY50_TICKERS[ticker]
        company_name = max(aliases, key=len)
    else:
        ticker = query_clean
        company_name = query.strip()
        aliases = [ticker, company_name]

    # 1.5. Calculate start of yesterday (current day and day before)
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    start_of_yesterday = now - timedelta(days=2)

    # Dynamic live search to fetch recent news about the stock.
    # Use the quoted company name + "share OR stock" so Google News returns
    # company-specific articles (the NSE ticker is dropped — real headlines
    # never include the ticker symbol, and including it cuts yield by half).
    from urllib.parse import quote_plus
    search_query = f'"{company_name}" share OR stock'
    try:
        from bs4 import BeautifulSoup
        import httpx
        from crawlers.base import NewsItem
        from crawlers.extractor import extract_timestamp
        from crawlers.agent import save_news_items
        from ai.pipeline import run_full_pipeline

        rss_url = (
            "https://news.google.com/rss/search?q="
            f"{quote_plus(search_query)}&hl=en-IN&gl=IN&ceid=IN:en"
        )
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        async with httpx.AsyncClient(headers=headers, timeout=12, follow_redirects=True) as client:
            r = await client.get(rss_url)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "xml")
                rss_items = soup.find_all("item")[:25]
                news_items = []
                for item in rss_items:
                    headline_full = item.title.text
                    headline = headline_full
                    source_name = "Google News"
                    if " - " in headline_full:
                        parts = headline_full.rsplit(" - ", 1)
                        headline = parts[0]
                        source_name = parts[1]
                    
                    url = item.link.text
                    pub_date_str = item.pubDate.text
                    published_at = extract_timestamp(pub_date_str)
                    
                    # Filter items older than yesterday
                    if published_at and published_at < start_of_yesterday:
                        continue
                    
                    from crawlers.sources import SOURCES
                    rank = 6
                    for src in SOURCES:
                        if src["name"].lower() in source_name.lower() or source_name.lower() in src["name"].lower():
                            rank = src["rank"]
                            break
                            
                    news_items.append(NewsItem(
                        headline=headline,
                        url=url,
                        source_name=source_name,
                        source_rank=rank,
                        published_at=published_at,
                        tickers=[ticker]
                    ))
                
                if news_items:
                    save_news_items(news_items)
                    await run_full_pipeline(news_items)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Error fetching live search news for {ticker}: {e}")

    # 2. Build search conditions
    from sqlalchemy import or_
    conditions = []
    for alias in aliases:
        if len(alias) >= 2:
            conditions.append(models.News.headline.ilike(f"%{alias}%"))
    
    if not conditions:
        conditions.append(models.News.headline.ilike(f"%{query}%"))

    # 3. Query related news with sentiment & summaries
    from crawlers.agent import archive_old_news
    from sqlalchemy import func
    archive_old_news(db)

    # Use COALESCE so HTML-scraped items with NULL published_at still match
    # the 2-day window (previously they were silently excluded — which is
    # why TATASTEEL was returning 1 article instead of dozens).
    effective_time = func.coalesce(models.News.published_at, models.News.created_at)

    rows = (
        db.query(models.News, models.Source, models.Summary, models.SentimentScore)
        .outerjoin(models.Source, models.Source.id == models.News.source_id)
        .outerjoin(models.Summary, models.Summary.news_id == models.News.id)
        .outerjoin(models.SentimentScore, models.SentimentScore.news_id == models.News.id)
        .filter(or_(*conditions))
        .filter(effective_time >= start_of_yesterday)
        .order_by(effective_time.desc())
        .limit(30)
        .all()
    )

    # 4. Process articles
    articles_data = []
    positive_count = 0
    neutral_count = 0
    negative_count = 0
    
    total_pos = 0.0
    total_neu = 0.0
    total_neg = 0.0
    
    for news, source, summary, sentiment in rows:
        sent_dict = {
            "positive": sentiment.positive if sentiment else 0.0,
            "neutral": sentiment.neutral if sentiment else 1.0,
            "negative": sentiment.negative if sentiment else 0.0,
        }
        
        pos = sent_dict["positive"]
        neg = sent_dict["negative"]
        
        if pos > neg and pos > 0.2:
            positive_count += 1
        elif neg > pos and neg > 0.2:
            negative_count += 1
        else:
            neutral_count += 1
            
        total_pos += sent_dict["positive"]
        total_neu += sent_dict["neutral"]
        total_neg += sent_dict["negative"]
            
        articles_data.append({
            "id": news.id,
            "headline": news.headline,
            "url": news.url,
            "source": source.name if source else "Unknown",
            "source_url": source.url if source else None,
            "published_at": _iso_utc(news.published_at),
            "summary": summary.ai_summary if summary else None,
            "sentiment": sent_dict
        })

    count = len(rows)
    if count > 0:
        avg_pos = round(total_pos / count, 3)
        avg_neg = round(total_neg / count, 3)
        avg_neu = round(total_neu / count, 3)
    else:
        avg_pos = 0.0
        avg_neg = 0.0
        avg_neu = 1.0

    # 5. Prediction & Analysis Logic
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    if GEMINI_API_KEY and count > 0:
        try:
            articles_text = "\n".join([
                f"- Headline: {art['headline']} | Source: {art['source']} | Sentiment: Positive={art['sentiment']['positive']}, Negative={art['sentiment']['negative']}"
                for art in articles_data
            ])
            
            prompt = (
                f"You are a senior financial analyst. Below is a list of recent news articles about {company_name} ({ticker}).\n\n"
                f"Articles:\n{articles_text}\n\n"
                f"Analyze the news sentiment, key drivers, and risks for {ticker}.\n"
                f"Then, predict if the stock is likely to go UP, DOWN, or remain NEUTRAL tomorrow based on these news catalysts. Provide a confidence score between 0.0 and 1.0.\n\n"
                f"Return the response in raw JSON format matching this schema:\n"
                f"{{\n"
                f"  \"direction\": \"UP\" | \"DOWN\" | \"NEUTRAL\",\n"
                f"  \"confidence\": 0.85,\n"
                f"  \"rationale\": \"Explanation for the prediction...\",\n"
                f"  \"summary\": \"Analyst summary of the news...\",\n"
                f"  \"key_drivers\": [\"Driver 1\", \"Driver 2\"],\n"
                f"  \"key_risks\": [\"Risk 1\", \"Risk 2\"]\n"
                f"}}\n"
                f"Return ONLY valid JSON. Do not include markdown formatting, backticks, or any explanation wrapper."
            )
            
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
            payload = {"contents": [{"parts": [{"text": prompt}]}]}
            
            async with httpx.AsyncClient(timeout=25) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                text_response = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                
                if text_response.startswith("```"):
                    text_response = re.sub(r"^```(?:json)?\n", "", text_response)
                    text_response = re.sub(r"\n```$", "", text_response)
                
                result = json.loads(text_response)
                direction = result.get("direction", "NEUTRAL").upper()
                if direction not in ["UP", "DOWN", "NEUTRAL"]:
                    direction = "NEUTRAL"
                    
                return {
                    "ticker": ticker,
                    "company_name": company_name,
                    "prediction": {
                        "direction": direction,
                        "confidence": float(result.get("confidence", 0.5)),
                        "rationale": str(result.get("rationale", "Based on current news volume and sentiment trends."))
                    },
                    "analysis": {
                        "summary": str(result.get("summary", "")),
                        "sentiment_breakdown": {
                            "positive": round(avg_pos, 2),
                            "neutral": round(avg_neu, 2),
                            "negative": round(avg_neg, 2)
                        },
                        "key_drivers": list(result.get("key_drivers", [])),
                        "key_risks": list(result.get("key_risks", []))
                    },
                    "articles": articles_data
                }
        except Exception as e:
            # Fall back to local calculations if API fails
            pass

    # 6. Fallback local analysis when Gemini is unavailable or error occurs
    if count == 0:
        direction = "NEUTRAL"
        confidence = 0.5
        rationale = f"No recent news articles were found in the system for {company_name} ({ticker}) in the last 48 hours (today & yesterday)."
        summary = f"There is currently no active news coverage tracked for {company_name} ({ticker}) in the last 48 hours. Try refreshing the dashboard to crawl fresh news."
        key_drivers = ["No positive drivers available due to lack of news coverage."]
        key_risks = ["No identified risk factors due to lack of news coverage."]
    else:
        net_sentiment = positive_count - negative_count
        if net_sentiment > 0:
            direction = "UP"
            confidence = round(0.5 + (net_sentiment / count) * 0.45, 2)
            rationale = f"The stock shows upward potential tomorrow due to a net positive news flow ({positive_count} positive articles vs {negative_count} negative)."
            summary = f"Overall market sentiment for {company_name} is bullish. Out of {count} tracked news items, positive reports dominate the coverage."
            key_drivers = [art["headline"] for art in articles_data if art["sentiment"]["positive"] > 0.2][:3]
            key_risks = [art["headline"] for art in articles_data if art["sentiment"]["negative"] > 0.2][:2]
            if not key_risks:
                key_risks = ["General market volatility in the financial sector."]
        elif net_sentiment < 0:
            direction = "DOWN"
            confidence = round(0.5 + (abs(net_sentiment) / count) * 0.45, 2)
            rationale = f"Recent news shows negative trends for {company_name} ({negative_count} negative reports vs {positive_count} positive), suggesting potential downward pressure tomorrow."
            summary = f"Market coverage for {company_name} is cautious or bearish. {negative_count} negative headlines were detected, highlighting operational or market challenges."
            key_drivers = [art["headline"] for art in articles_data if art["sentiment"]["positive"] > 0.2][:2]
            if not key_drivers:
                key_drivers = ["Long-term institutional support remains stable."]
            key_risks = [art["headline"] for art in articles_data if art["sentiment"]["negative"] > 0.2][:3]
        else:
            direction = "NEUTRAL"
            confidence = 0.50
            rationale = f"Balanced news flow (sentiment shows equal mix of positive and negative updates, or predominantly neutral reporting)."
            summary = f"News coverage for {company_name} is neutral or mixed. The market is currently processing balanced developments, indicating sideways movement."
            key_drivers = [art["headline"] for art in articles_data if art["sentiment"]["positive"] > 0.2][:2]
            if not key_drivers:
                key_drivers = ["Steady business operations and core services."]
            key_risks = [art["headline"] for art in articles_data if art["sentiment"]["negative"] > 0.2][:2]
            if not key_risks:
                key_risks = ["Broader macroeconomic consolidation."]

    return {
        "ticker": ticker,
        "company_name": company_name,
        "prediction": {
            "direction": direction,
            "confidence": confidence,
            "rationale": rationale
        },
        "analysis": {
            "summary": summary,
            "sentiment_breakdown": {
                "positive": round(avg_pos, 2),
                "neutral": round(avg_neu, 2),
                "negative": round(avg_neg, 2)
            },
            "key_drivers": key_drivers,
            "key_risks": key_risks
        },
        "articles": articles_data
    }

