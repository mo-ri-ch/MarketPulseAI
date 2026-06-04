"""
Search Agent: Orchestrates all crawlers, runs them concurrently,
de-duplicates results, enriches with tickers, and saves to the database.
"""
import asyncio
import logging
import re
import time
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from crawlers.base import NewsItem
from crawlers.primary import (
    TradingViewCrawler, NSEIndiaCrawler, MotilaOswalCrawler,
)
from crawlers.secondary import (
    ReutersCrawler, YahooFinanceCrawler, EconomicTimesCrawler,
    LiveMintCrawler, BusinessStandardCrawler, CNBCTv18Crawler,
    RedditCrawler, GoogleNewsRSSCrawler, MoneycontrolRSSCrawler,
    HinduBusinessLineCrawler,
)
from database import SessionLocal
import models

logger = logging.getLogger(__name__)

LAST_CRAWLER_STATS: dict[str, dict] = {}
LAST_PIPELINE_STATUS: dict = {"ok": None, "ran_at": None, "error": None}


# Common non-article strings that listing pages spit out (nav links, section
# titles, author bylines). Matched case-insensitively against the full headline.
_HEADLINE_DENYLIST = {
    "news", "newsletters", "newsletter", "science", "world", "markets",
    "business", "economy", "politics", "sports", "more", "home", "videos",
    "podcasts", "videos", "opinion", "editorial", "tech", "technology",
    "stocks", "stock market", "personal finance", "mutual funds",
    "ipo", "ipos", "commodities", "currencies", "subscribe", "log in",
    "sign in", "sign up", "advertisement", "explore",
}

# Heuristic: an article headline almost always has 4+ words and 25+ chars.
_MIN_HEADLINE_CHARS = 25
_MIN_HEADLINE_WORDS = 4


def is_valid_headline(text: str) -> bool:
    """
    Reject obvious non-articles: navigation labels, author bylines, section
    titles. Conservative — we'd rather drop a real headline than display
    "Newsletters" or "Prateek Agarwal" on the dashboard.
    """
    if not text:
        return False
    cleaned = text.strip()
    if cleaned.lower() in _HEADLINE_DENYLIST:
        return False
    if len(cleaned) < _MIN_HEADLINE_CHARS:
        return False
    words = re.findall(r"\S+", cleaned)
    if len(words) < _MIN_HEADLINE_WORDS:
        return False
    return True

ALL_CRAWLERS = [
    NSEIndiaCrawler(),
    ReutersCrawler(),
    TradingViewCrawler(),
    MotilaOswalCrawler(),
    YahooFinanceCrawler(),
    EconomicTimesCrawler(),
    LiveMintCrawler(),
    BusinessStandardCrawler(),
    CNBCTv18Crawler(),
    RedditCrawler(),
    HinduBusinessLineCrawler(),
    GoogleNewsRSSCrawler(),
    MoneycontrolRSSCrawler(),
]


async def _run_one_crawler(crawler) -> tuple[str, list[NewsItem] | Exception, float]:
    """Run a single crawler with timing, returning (name, result_or_exc, elapsed_ms)."""
    name = crawler.__class__.__name__
    started = time.monotonic()
    try:
        items = await crawler.scrape()
        return name, items, (time.monotonic() - started) * 1000.0
    except Exception as e:
        return name, e, (time.monotonic() - started) * 1000.0


async def run_all_crawlers() -> list[NewsItem]:
    """
    Run all registered crawlers concurrently.
    Returns a flat, deduplicated list of NewsItems sorted by source rank.
    Side effect: populates LAST_CRAWLER_STATS with per-crawler success/failure info.
    """
    results = await asyncio.gather(*[_run_one_crawler(c) for c in ALL_CRAWLERS])

    all_items: list[NewsItem] = []
    seen_urls: set[str] = set()
    ran_at = datetime.utcnow().isoformat()

    cutoff = datetime.utcnow() - timedelta(days=2)
    for name, result, elapsed_ms in results:
        if isinstance(result, Exception):
            LAST_CRAWLER_STATS[name] = {
                "ok": False,
                "count": 0,
                "elapsed_ms": round(elapsed_ms, 1),
                "error": f"{type(result).__name__}: {result}",
                "ran_at": ran_at,
            }
            logger.error(f"[Agent] Crawler {name} failed in {elapsed_ms:.0f}ms: {result}")
            continue

        LAST_CRAWLER_STATS[name] = {
            "ok": True,
            "count": len(result),
            "elapsed_ms": round(elapsed_ms, 1),
            "error": None,
            "ran_at": ran_at,
        }
        for item in result:
            if item.published_at and item.published_at < cutoff:
                continue
            if item.url not in seen_urls:
                seen_urls.add(item.url)
                all_items.append(item)

    # Sort by source rank (lower = higher priority)
    all_items.sort(key=lambda x: x.source_rank)
    logger.info(f"[Agent] Fetched {len(all_items)} unique news items from {len(ALL_CRAWLERS)} sources.")
    return all_items


def get_or_create_source(db: Session, source_name: str, source_url: str, rank: int) -> models.Source:
    """Upsert a Source record."""
    source = db.query(models.Source).filter(models.Source.name == source_name).first()
    if not source:
        source = models.Source(name=source_name, url=source_url, rank=rank)
        db.add(source)
        db.commit()
        db.refresh(source)
    return source


def save_news_items(items: list[NewsItem]) -> int:
    """
    Persist scraped news items to the database.
    Skips already-existing URLs and quality-filters headlines so navigation
    labels / author bylines don't end up on the dashboard. Leaves
    published_at NULL when the crawler couldn't extract a real timestamp
    (the read endpoints sort by COALESCE(published_at, created_at) so items
    still order sensibly).
    Returns count of newly saved items.
    """
    cutoff = datetime.utcnow() - timedelta(days=2)
    db: Session = SessionLocal()
    saved = 0
    skipped_quality = 0
    try:
        for item in items:
            if not is_valid_headline(item.headline):
                skipped_quality += 1
                continue

            # Skip if older than 48 hours
            if item.published_at and item.published_at < cutoff:
                continue

            # Skip if URL already exists
            existing = db.query(models.News).filter(models.News.url == item.url).first()
            if existing:
                continue

            source = get_or_create_source(db, item.source_name, item.url, item.source_rank)
            news = models.News(
                headline=item.headline,
                url=item.url,
                source_id=source.id,
                published_at=item.published_at,
            )
            db.add(news)
            saved += 1

        db.commit()
        logger.info(
            f"[Agent] Saved {saved} new news items to database "
            f"(rejected {skipped_quality} low-quality headlines)."
        )
    except Exception as e:
        db.rollback()
        logger.error(f"[Agent] DB save error: {e}")
    finally:
        db.close()

    return saved


def archive_old_news(db: Session):
    """Delete news older than 2 days (48 hours) from current time."""
    from datetime import datetime, timedelta
    from sqlalchemy import func
    cutoff = datetime.utcnow() - timedelta(days=2)
    try:
        effective_time = func.coalesce(models.News.published_at, models.News.created_at)
        # Find news IDs older than 2 days
        old_news = db.query(models.News.id).filter(effective_time < cutoff).all()
        old_news_ids = [n[0] for n in old_news]
        
        if old_news_ids:
            # Delete associated sentiment scores
            db.query(models.SentimentScore).filter(models.SentimentScore.news_id.in_(old_news_ids)).delete(synchronize_session=False)
            # Delete associated summaries
            db.query(models.Summary).filter(models.Summary.news_id.in_(old_news_ids)).delete(synchronize_session=False)
            # Delete news items
            num_deleted = db.query(models.News).filter(models.News.id.in_(old_news_ids)).delete(synchronize_session=False)
            db.commit()
            if num_deleted > 0:
                logger.info(f"[Archiver] Deleted {num_deleted} news items and their associated sentiment/summaries older than {cutoff}.")
    except Exception as e:
        db.rollback()
        logger.error(f"[Archiver] Error running archiver: {e}")


async def fetch_and_save() -> dict:
    """Main entry point: fetch from all sources and persist to DB."""
    # Archive old news on crawl trigger
    db_cleanup = SessionLocal()
    try:
        archive_old_news(db_cleanup)
    finally:
        db_cleanup.close()

    items = await run_all_crawlers()
    saved = save_news_items(items)
    try:
        from ai.pipeline import run_full_pipeline
        await run_full_pipeline(items)
        LAST_PIPELINE_STATUS.update({"ok": True, "ran_at": datetime.utcnow().isoformat(), "error": None})
    except Exception as e:
        LAST_PIPELINE_STATUS.update({"ok": False, "ran_at": datetime.utcnow().isoformat(), "error": f"{type(e).__name__}: {e}"})
        logger.error(f"[Agent] AI Pipeline execution error: {e}")
    try:
        from ai.alerts_evaluator import evaluate_alerts
        db = SessionLocal()
        try:
            evaluate_alerts(db)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[Agent] Alerts evaluation error: {e}")
    return {
        "total_fetched": len(items),
        "new_saved": saved,
        "sources": list({item.source_name for item in items}),
    }
