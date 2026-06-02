"""
Base Crawler: Defines the abstract interface all source connectors implement.
Each connector scrapes headlines, timestamps, and URLs from its source.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import httpx
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

@dataclass
class NewsItem:
    """Normalized representation of a scraped news headline."""
    headline: str
    url: str
    source_name: str
    source_rank: int
    published_at: Optional[datetime] = None
    content_snippet: Optional[str] = None
    tickers: list[str] = field(default_factory=list)


class BaseCrawler(ABC):
    """Abstract base class for all news source crawlers."""
    
    source_name: str = ""
    source_url: str = ""
    source_rank: int = 10

    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    }

    async def fetch_html(self, url: str) -> Optional[str]:
        """Fetch page HTML using httpx with timeout and error handling."""
        try:
            async with httpx.AsyncClient(headers=self.HEADERS, timeout=15, follow_redirects=True) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.text
        except Exception as e:
            logger.warning(f"[{self.source_name}] Failed to fetch {url}: {e}")
            return None

    def parse(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "lxml")

    @abstractmethod
    async def scrape(self) -> list[NewsItem]:
        """Main scraping entry point. Must return a list of NewsItem objects."""
        ...

    def to_news_item(self, headline: str, url: str, published_at=None, snippet=None) -> NewsItem:
        return NewsItem(
            headline=headline.strip(),
            url=url.strip(),
            source_name=self.source_name,
            source_rank=self.source_rank,
            published_at=published_at,
            content_snippet=snippet,
        )
