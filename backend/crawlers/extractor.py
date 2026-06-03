"""
Entity Extractor: Identifies stock tickers and company names in news headlines.
Uses a lookup-table approach against the NIFTY50 ticker map for zero-latency extraction.
"""
import re
from crawlers.sources import NIFTY50_TICKERS


def extract_tickers(text: str) -> list[str]:
    """
    Scan headline/snippet text for known Nifty50 company names and map
    them to their NSE ticker symbols.
    Returns a de-duplicated list of matched tickers.
    """
    found = set()
    text_lower = text.lower()

    for ticker, aliases in NIFTY50_TICKERS.items():
        for alias in aliases:
            # Word-boundary match, case-insensitive
            pattern = r'\b' + re.escape(alias.lower()) + r'\b'
            if re.search(pattern, text_lower):
                found.add(ticker)
                break  # avoid adding same ticker multiple times

    return sorted(found)


def extract_timestamp(date_str: str):
    """
    Try parsing common date formats found in Indian financial news sites.
    Returns a datetime object or None.
    """
    from datetime import datetime

    FORMATS = [
        "%b %d, %Y, %I:%M %p",     # May 24, 2026, 10:30 AM
        "%Y-%m-%dT%H:%M:%S",        # ISO format
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",      # ISO with offset, e.g. 2026-06-03T13:45:00+00:00 (Reddit Atom)
        "%d %b %Y %I:%M %p",        # 24 May 2026 10:30 AM
        "%d/%m/%Y %H:%M",           # 24/05/2026 10:30
        "%Y-%m-%d",
        "%a, %d %b %Y %H:%M:%S %Z", # Tue, 02 Jun 2026 12:00:00 GMT (RSS format)
        "%a, %d %b %Y %H:%M:%S %z", # Tue, 02 Jun 2026 12:00:00 +0000 (RSS format with offset)
        "%d %b %Y %H:%M:%S %Z",     # 02 Jun 2026 12:00:00 GMT
        "%d %b %Y %H:%M:%S %z",     # 02 Jun 2026 12:00:00 +0530
    ]

    if not date_str:
        return None

    date_str = date_str.strip()
    for fmt in FORMATS:
        try:
            dt = datetime.strptime(date_str, fmt)
            # Strip tz so naive comparisons in callers don't trip
            return dt.replace(tzinfo=None) if dt.tzinfo else dt
        except ValueError:
            continue

    return None
