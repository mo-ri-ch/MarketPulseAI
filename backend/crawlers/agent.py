"""
Search Agent: Orchestrates all crawlers, runs them concurrently,
de-duplicates results, enriches with tickers, and saves to the database.
"""
import asyncio
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from crawlers.base import NewsItem
from crawlers.primary import (
    MoneycontrolCrawler, TradingViewCrawler, NSEIndiaCrawler,
    FrontPageCrawler, MotilaOswalCrawler,
)
from crawlers.secondary import (
    ReutersCrawler, YahooFinanceCrawler, EconomicTimesCrawler,
    LiveMintCrawler, BusinessStandardCrawler, CNBCTv18Crawler,
    RedditCrawler, GoogleNewsRSSCrawler, MoneycontrolRSSCrawler,
)
from database import SessionLocal
import models

logger = logging.getLogger(__name__)

ALL_CRAWLERS = [
    NSEIndiaCrawler(),
    MoneycontrolCrawler(),
    ReutersCrawler(),
    TradingViewCrawler(),
    MotilaOswalCrawler(),
    YahooFinanceCrawler(),
    EconomicTimesCrawler(),
    LiveMintCrawler(),
    BusinessStandardCrawler(),
    CNBCTv18Crawler(),
    RedditCrawler(),
    FrontPageCrawler(),
    GoogleNewsRSSCrawler(),
    MoneycontrolRSSCrawler(),
]


async def run_all_crawlers() -> list[NewsItem]:
    """
    Run all registered crawlers concurrently.
    Returns a flat, deduplicated list of NewsItems sorted by source rank.
    """
    tasks = [crawler.scrape() for crawler in ALL_CRAWLERS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: list[NewsItem] = []
    seen_urls: set[str] = set()

    for result in results:
        if isinstance(result, Exception):
            logger.error(f"Crawler failed: {result}")
            continue
        for item in result:
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
    Skips already-existing URLs to prevent duplicates.
    Returns count of newly saved items.
    """
    db: Session = SessionLocal()
    saved = 0
    try:
        for item in items:
            # Skip if URL already exists
            existing = db.query(models.News).filter(models.News.url == item.url).first()
            if existing:
                continue

            source = get_or_create_source(db, item.source_name, item.url, item.source_rank)
            news = models.News(
                headline=item.headline,
                url=item.url,
                source_id=source.id,
                published_at=item.published_at or datetime.utcnow(),
            )
            db.add(news)
            saved += 1

        db.commit()
        logger.info(f"[Agent] Saved {saved} new news items to database.")
    except Exception as e:
        db.rollback()
        logger.error(f"[Agent] DB save error: {e}")
    finally:
        db.close()

    return saved


def archive_old_news(db: Session):
    """Archive news older than 2 days (48 hours) from current time."""
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=2)
    try:
        num_archived = (
            db.query(models.News)
            .filter(
                models.News.published_at < cutoff,
                models.News.is_archived == False
            )
            .update({models.News.is_archived: True}, synchronize_session=False)
        )
        db.commit()
        if num_archived > 0:
            logger.info(f"[Archiver] Archived {num_archived} news items older than {cutoff}.")
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
    except Exception as e:
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
