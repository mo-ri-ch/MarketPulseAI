"""
AI Pipeline: Orchestrates the full AI processing flow for a batch of NewsItems.

Flow:
  raw NewsItems
    → deduplicate()       → NewsCluster[]
    → extract_tickers()   → enriched clusters
    → sentiment scoring   → per-cluster sentiment
    → summarize()         → AI summary per cluster
    → importance_score()  → ranked output
    → save to database
"""
import asyncio
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from ai.deduplicator import deduplicate, NewsCluster
from ai.sentiment import score_cluster
from ai.summarizer import summarize, importance_score
from database import SessionLocal
import models

logger = logging.getLogger(__name__)


async def process_news_items(news_items: list) -> list[dict]:
    """
    Full AI pipeline: deduplicate → sentiment → summarize → rank.

    Args:
        news_items: Raw list of NewsItem objects from the crawlers.

    Returns:
        List of enriched cluster dicts ready for API response or DB storage.
    """
    if not news_items:
        return []

    logger.info(f"[AI Pipeline] Processing {len(news_items)} raw items...")

    # Step 1: Deduplicate
    clusters: list[NewsCluster] = deduplicate(news_items, threshold=0.65)
    logger.info(f"[AI Pipeline] Reduced to {len(clusters)} unique clusters.")

    # Step 2: Process each cluster concurrently
    async def process_cluster(cluster: NewsCluster) -> dict:
        all_headlines = [cluster.primary_headline] + [
            d["headline"] for d in cluster.duplicate_sources
        ]

        # Sentiment
        sentiment = score_cluster(all_headlines)

        # Summary (async — may call Gemini API)
        summary = await summarize(all_headlines, cluster.tickers)

        # Importance
        importance = importance_score(cluster)

        return {
            "headline": cluster.primary_headline,
            "url": cluster.primary_url,
            "source": cluster.primary_source,
            "source_rank": cluster.primary_rank,
            "tickers": cluster.tickers,
            "duplicate_count": len(cluster.duplicate_sources),
            "duplicate_sources": cluster.duplicate_sources,
            "sentiment": sentiment,
            "summary": summary,
            "importance": importance,
        }

    results = await asyncio.gather(*[process_cluster(c) for c in clusters])

    # Step 3: Sort by importance descending
    results_sorted = sorted(results, key=lambda x: x["importance"], reverse=True)

    logger.info(f"[AI Pipeline] Done. Top story: {results_sorted[0]['headline'] if results_sorted else 'N/A'}")
    return results_sorted


async def save_ai_results(results: list[dict], db: Session = None) -> int:
    """
    Persist AI-enriched results (summaries + sentiment scores) to the database.
    Matches against existing News records by URL.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    saved = 0
    try:
        for result in results:
            news = db.query(models.News).filter(models.News.url == result["url"]).first()
            if not news:
                continue

            # Save / update summary
            summary = db.query(models.Summary).filter(models.Summary.news_id == news.id).first()
            if not summary:
                summary = models.Summary(news_id=news.id, ai_summary=result["summary"])
                db.add(summary)
            else:
                summary.ai_summary = result["summary"]

            # Save / update sentiment
            sentiment_rec = db.query(models.SentimentScore).filter(
                models.SentimentScore.news_id == news.id
            ).first()
            sent = result["sentiment"]
            if not sentiment_rec:
                sentiment_rec = models.SentimentScore(
                    news_id=news.id,
                    positive=sent["positive"],
                    neutral=sent["neutral"],
                    negative=sent["negative"],
                )
                db.add(sentiment_rec)
            else:
                sentiment_rec.positive = sent["positive"]
                sentiment_rec.neutral = sent["neutral"]
                sentiment_rec.negative = sent["negative"]

            saved += 1

        db.commit()
        logger.info(f"[AI Pipeline] Saved AI results for {saved} articles.")
    except Exception as e:
        db.rollback()
        logger.error(f"[AI Pipeline] DB error: {e}")
    finally:
        if close_db:
            db.close()

    return saved


async def run_full_pipeline(news_items: list) -> dict:
    """Top-level entrypoint: run AI processing and persist results."""
    results = await process_news_items(news_items)
    saved = await save_ai_results(results)
    return {
        "clusters_processed": len(results),
        "db_records_updated": saved,
        "top_stories": results[:5],  # return top 5 for API response
    }
