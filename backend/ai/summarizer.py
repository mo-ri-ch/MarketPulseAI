"""
AI Summarizer: Generates concise, analyst-style summaries of news clusters.

Strategy:
  1. First tries to use Google Gemini API (if GEMINI_API_KEY is set in .env).
  2. Falls back to an extractive rule-based summarizer — no API needed.

This means the system works offline / without an API key, and optionally
delivers premium AI summaries when the key is provided.
"""
import os
import re
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


# ── Extractive Fallback ───────────────────────────────────────────────────────

def _extractive_summary(headlines: list[str], tickers: list[str]) -> str:
    """
    Build a one-paragraph summary by combining the most informative headline
    with ticker context. No external API required.
    """
    if not headlines:
        return ""
    
    # Prefer the longest/most descriptive headline as the primary
    primary = max(headlines, key=len)
    
    ticker_str = ", ".join(tickers) if tickers else "the market"
    others = [h for h in headlines if h != primary]
    
    if others:
        sources_note = f" The story was also covered by {len(others)} additional source(s)."
    else:
        sources_note = ""
    
    summary = f"{primary.rstrip('.')}. This development relates to {ticker_str}.{sources_note}"
    return summary


# ── Gemini AI Summarizer ──────────────────────────────────────────────────────

async def _gemini_summary(headlines: list[str], tickers: list[str]) -> str:
    """Call Gemini API to generate an analyst-grade summary."""
    try:
        import httpx
        ticker_str = ", ".join(tickers) if tickers else "this market event"
        headlines_text = "\n".join(f"- {h}" for h in headlines)
        prompt = (
            f"You are a financial analyst assistant. Below are multiple news headlines "
            f"about the same market event involving {ticker_str}.\n\n"
            f"Headlines:\n{headlines_text}\n\n"
            f"Write a single concise analyst-style summary (2–3 sentences) that captures "
            f"the key insight, sentiment, and impact. Be factual and direct."
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {"contents": [{"parts": [{"text": prompt}]}]}

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        logger.warning(f"[Gemini] Summarization failed, falling back to extractive: {e}")
        return _extractive_summary(headlines, tickers)


# ── Public Interface ──────────────────────────────────────────────────────────

async def summarize(headlines: list[str], tickers: list[str]) -> str:
    """
    Generate a summary for a group of related headlines.
    Uses Gemini if API key is available, otherwise falls back to extractive summary.
    """
    if not headlines:
        return ""
    
    if GEMINI_API_KEY:
        return await _gemini_summary(headlines, tickers)
    else:
        return _extractive_summary(headlines, tickers)


def importance_score(cluster) -> float:
    """
    Calculate an importance score for a news cluster.
    Factors:
      - Source rank (lower = more important = higher score)
      - Number of sources covering it (more = higher importance)
      - Number of tickers mentioned
    
    Returns a float between 0.0 and 1.0.
    """
    # Source rank contribution: rank 1 → 1.0, rank 8 → 0.125
    rank = getattr(cluster, "primary_rank", 8) or 8
    rank_score = 1.0 / rank

    # Coverage breadth (how many sources cover same story)
    coverage = 1 + len(getattr(cluster, "duplicate_sources", []))
    coverage_score = min(coverage / 5.0, 1.0)  # cap at 5 sources = 1.0

    # Ticker density
    tickers = getattr(cluster, "tickers", []) or []
    ticker_score = min(len(tickers) / 3.0, 1.0)

    # Weighted combination
    score = (rank_score * 0.5) + (coverage_score * 0.35) + (ticker_score * 0.15)
    return round(min(score, 1.0), 4)
