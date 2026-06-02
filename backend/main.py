from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os

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

app = FastAPI(title="Market Pulse AI Backend")

async def cron_crawler_loop():
    """Background task that runs 24/7 to fetch news every 15 minutes."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[Scheduler] Starting 24/7 crawler loop...")
    while True:
        try:
            logger.info("[Scheduler] Triggering scheduled news crawl...")
            await fetch_and_save()
            logger.info("[Scheduler] Scheduled news crawl complete.")
        except Exception as e:
            logger.error(f"[Scheduler] Error in scheduled crawl: {e}")
        # Wait 15 minutes (900 seconds)
        await asyncio.sleep(900)


@app.on_event("startup")
def on_startup():
    from database import engine, Base
    import models
    Base.metadata.create_all(bind=engine)

    # Start 24/7 background scheduler loop
    import asyncio
    asyncio.create_task(cron_crawler_loop())

    # Self-healing migration to add is_archived column if it doesn't exist
    from sqlalchemy import inspect, text
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
            import logging
            logging.getLogger(__name__).info("[Startup] Added is_archived column to news table.")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[Startup] Migration check failed: {e}")

    # Optimize news query performance by indexing published_at
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_news_published_at ON news (published_at)"))
            import logging
            logging.getLogger(__name__).info("[Startup] Verified index on news (published_at).")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[Startup] Index creation failed: {e}")



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

app.include_router(watchlist_router, tags=["watchlists"])

@app.get("/")
def read_root():
    return {"message": "Market Pulse AI API is running"}



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
def get_news(db: Session = Depends(get_db), skip: int = 0, limit: int = 50):
    """Return latest news items from the database."""
    from crawlers.agent import archive_old_news
    archive_old_news(db)

    news = (
        db.query(models.News)
        .filter(models.News.is_archived == False)
        .order_by(models.News.published_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": n.id,
            "headline": n.headline,
            "url": n.url,
            "source_id": n.source_id,
            "published_at": n.published_at.isoformat() if n.published_at else None,
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
def get_insights(db: Session = Depends(get_db), limit: int = 30):
    """Return news articles with their AI summaries, sentiment scores, and source details."""
    from crawlers.agent import archive_old_news
    archive_old_news(db)

    rows = (
        db.query(models.News, models.Source, models.Summary, models.SentimentScore)
        .outerjoin(models.Source, models.Source.id == models.News.source_id)
        .outerjoin(models.Summary, models.Summary.news_id == models.News.id)
        .outerjoin(models.SentimentScore, models.SentimentScore.news_id == models.News.id)
        .filter(models.News.is_archived == False)
        .order_by(models.News.published_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": news.id,
            "headline": news.headline,
            "url": news.url,                          # exact article URL from crawler
            "source": source.name if source else None,
            "source_url": source.url if source else None,
            "published_at": news.published_at.isoformat() if news.published_at else None,
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
    start_of_yesterday = datetime.combine(now.date() - timedelta(days=1), datetime.min.time())

    # Dynamic live search to fetch recent news about the stock
    search_query = f"{company_name} {ticker} stock"
    try:
        from bs4 import BeautifulSoup
        import httpx
        from crawlers.base import NewsItem
        from crawlers.extractor import extract_timestamp
        from crawlers.agent import save_news_items
        from ai.pipeline import run_full_pipeline
        
        rss_url = f"https://news.google.com/rss/search?q={search_query.replace(' ', '+')}&hl=en-IN&gl=IN&ceid=IN:en"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, htmllike Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        async with httpx.AsyncClient(headers=headers, timeout=12, follow_redirects=True) as client:
            r = await client.get(rss_url)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "xml")
                rss_items = soup.find_all("item")[:15]
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
    archive_old_news(db)

    rows = (
        db.query(models.News, models.Source, models.Summary, models.SentimentScore)
        .outerjoin(models.Source, models.Source.id == models.News.source_id)
        .outerjoin(models.Summary, models.Summary.news_id == models.News.id)
        .outerjoin(models.SentimentScore, models.SentimentScore.news_id == models.News.id)
        .filter(or_(*conditions))
        .filter(models.News.is_archived == False)
        .filter(models.News.published_at >= start_of_yesterday)
        .order_by(models.News.published_at.desc())
        .limit(20)
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
            "published_at": news.published_at.isoformat() if news.published_at else None,
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

