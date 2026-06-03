"""
Primary Source Connectors:
  - Moneycontrol
  - TradingView
  - NSE India
  - Motilal Oswal
"""
import re
from crawlers.base import BaseCrawler, NewsItem
from crawlers.extractor import extract_tickers, extract_timestamp


class MoneycontrolCrawler(BaseCrawler):
    source_name = "Moneycontrol"
    source_url = "https://www.moneycontrol.com/news/business/markets/"
    source_rank = 2

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        # Moneycontrol news list items
        for tag in soup.select("li.clearfix h2 a, .news_list li a[href*='/news/']")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if not url.startswith("http"):
                url = "https://www.moneycontrol.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class TradingViewCrawler(BaseCrawler):
    source_name = "TradingView"
    source_url = "https://www.tradingview.com/news/"
    source_rank = 4

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select("a.news-story__title, article a[href*='/news/']")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://www.tradingview.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


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
    source_name = "Motilal Oswal"
    source_url = "https://www.motilaloswal.com/blog/stock-market-news/"
    source_rank = 5

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select(".blog-card h3 a, .article-title a, h2 a, h3 a")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://www.motilaloswal.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items
