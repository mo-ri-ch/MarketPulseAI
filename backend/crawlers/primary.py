"""
Primary Source Connectors:
  - TradingView
  - NSE India
  - Motilal Oswal

Note: the old direct Moneycontrol HTML crawler was removed because the
Moneycontrol RSS crawler in secondary.py already yields the same content
(~25 items per run) more reliably.
"""
from crawlers.base import BaseCrawler, NewsItem
from crawlers.extractor import extract_tickers
from crawlers.secondary import scrape_via_google_news


class TradingViewCrawler(BaseCrawler):
    """TradingView's /news pages are heavily JS-rendered and return no
    parseable headlines via static HTML scrape. Route through Google
    News with a site filter instead."""
    source_name = "TradingView"
    source_url = "https://www.tradingview.com/news/"
    source_rank = 4

    async def scrape(self) -> list[NewsItem]:
        return await scrape_via_google_news(self, "site:tradingview.com india")


class NSEIndiaCrawler(BaseCrawler):
    source_name = "NSE India"
    source_url = "https://www.nseindia.com/api/corporate-announcements?index=equities"
    source_rank = 1

    async def scrape(self) -> list[NewsItem]:
        """NSE India provides a JSON API for corporate announcements."""
        try:
            import httpx, json
            headers = {**self.HEADERS, "Referer": "https://www.nseindia.com/"}
            async with httpx.AsyncClient(headers=headers, timeout=15, follow_redirects=True) as client:
                # First hit the main page to get cookies
                await client.get("https://www.nseindia.com/")
                resp = await client.get(self.source_url)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[NSE India] API call failed: {e}")
            return []

        items = []
        announcements = data if isinstance(data, list) else data.get("data", [])
        for ann in announcements[:20]:
            headline = ann.get("subject") or ann.get("desc") or ""
            url = f"https://www.nseindia.com/companies-listing/corporate-filings-announcements"
            if not headline:
                continue
            item = self.to_news_item(headline, url)
            item.tickers = [ann.get("symbol", "")] if ann.get("symbol") else extract_tickers(headline)
            items.append(item)

        return items


class MotilaOswalCrawler(BaseCrawler):
    """Motilal Oswal's blog RSS endpoint 301s into nothing and the page
    itself is JS-rendered. Pull coverage via Google News matching the
    research-house name in headlines."""
    source_name = "Motilal Oswal"
    source_url = "https://www.motilaloswal.com/blog/stock-market-news/"
    source_rank = 5

    async def scrape(self) -> list[NewsItem]:
        return await scrape_via_google_news(self, '"motilal oswal" stock india')
