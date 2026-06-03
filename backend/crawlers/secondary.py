"""
Secondary & Community Source Connectors:
  - Reuters Markets
  - Yahoo Finance
  - Economic Times
  - LiveMint
  - Business Standard
  - CNBC TV18
  - Reddit (r/IndianStockMarket)
"""
from crawlers.base import BaseCrawler, NewsItem
from crawlers.extractor import extract_tickers, extract_timestamp


# ---------- Secondary Sources ----------

class ReutersCrawler(BaseCrawler):
    source_name = "Reuters"
    source_url = "https://www.reuters.com/markets/"
    source_rank = 3

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select("a[data-testid='Heading'], h3 a, .story-title a")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://www.reuters.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class YahooFinanceCrawler(BaseCrawler):
    source_name = "Yahoo Finance"
    source_url = "https://finance.yahoo.com/topic/stock-market-news/"
    source_rank = 6

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select("h3 a[href*='/news/'], li a[href*='/news/']")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://finance.yahoo.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class EconomicTimesCrawler(BaseCrawler):
    source_name = "Economic Times"
    source_url = "https://economictimes.indiatimes.com/markets"
    source_rank = 6

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select(".eachStory h3 a, .story-box h3 a, h3 a")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://economictimes.indiatimes.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class LiveMintCrawler(BaseCrawler):
    source_name = "LiveMint"
    source_url = "https://www.livemint.com/market"
    source_rank = 6

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select(".listingNew h2 a, h2.headline a, h3 a")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://www.livemint.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class BusinessStandardCrawler(BaseCrawler):
    source_name = "Business Standard"
    source_url = "https://www.business-standard.com/markets"
    source_rank = 6

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select(".listingstory h2 a, .card-title a, h2 a, h3 a")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://www.business-standard.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class CNBCTv18Crawler(BaseCrawler):
    source_name = "CNBC TV18"
    source_url = "https://www.cnbctv18.com/market/"
    source_rank = 6

    async def scrape(self) -> list[NewsItem]:
        html = await self.fetch_html(self.source_url)
        if not html:
            return []
        soup = self.parse(html)
        items = []

        for tag in soup.select(".news-box h3 a, .jsx-article-title a, h3 a, h2 a")[:20]:
            headline = tag.get_text(strip=True)
            url = tag.get("href", "")
            if not headline or not url:
                continue
            if url.startswith("/"):
                url = "https://www.cnbctv18.com" + url
            item = self.to_news_item(headline, url)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


# ---------- Community Sources ----------

class RedditCrawler(BaseCrawler):
    """Uses Reddit's public JSON API — no auth required for public subreddits."""
    source_name = "Reddit"
    source_url = "https://www.reddit.com/r/IndianStockMarket/hot.json?limit=25"
    source_rank = 7

    async def scrape(self) -> list[NewsItem]:
        try:
            import httpx, json
            headers = {**self.HEADERS, "Accept": "application/json"}
            async with httpx.AsyncClient(headers=headers, timeout=15, follow_redirects=True) as client:
                resp = await client.get(self.source_url)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Reddit] API call failed: {e}")
            return []

        items = []
        posts = data.get("data", {}).get("children", [])
        for post in posts:
            d = post.get("data", {})
            headline = d.get("title", "")
            url = d.get("url", "")
            permalink = "https://www.reddit.com" + d.get("permalink", "")
            if not headline:
                continue
            item = self.to_news_item(headline, permalink)
            item.tickers = extract_tickers(headline)
            items.append(item)

        return items


class GoogleNewsRSSCrawler(BaseCrawler):
    """Google News RSS Crawler for general Indian stock market updates."""
    source_name = "Google News"
    source_url = "https://news.google.com/rss/search?q=stock+market+india+business&hl=en-IN&gl=IN&ceid=IN:en"
    source_rank = 3

    async def scrape(self) -> list[NewsItem]:
        try:
            import xml.etree.ElementTree as ET
            from crawlers.extractor import extract_timestamp, extract_tickers

            html = await self.fetch_html(self.source_url)
            if not html:
                return []
            
            root = ET.fromstring(html.encode("utf-8"))
            items = []
            
            for item in root.findall(".//item")[:25]:
                title_full = item.find("title")
                title_text = title_full.text if title_full is not None else ""
                if not title_text:
                    continue

                headline = title_text
                source_name = "Google News"
                if " - " in title_text:
                    parts = title_text.rsplit(" - ", 1)
                    headline = parts[0]
                    source_name = parts[1]
                
                link_el = item.find("link")
                url = link_el.text if link_el is not None else ""
                
                pub_date_el = item.find("pubDate")
                pub_date_str = pub_date_el.text if pub_date_el is not None else ""
                published_at = extract_timestamp(pub_date_str) if pub_date_str else None
                
                news_item = self.to_news_item(headline, url, published_at=published_at)
                news_item.source_name = source_name
                news_item.tickers = extract_tickers(headline)
                items.append(news_item)
                
            return items
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Google News RSS] Scraping failed: {e}")
            return []


class HinduBusinessLineCrawler(BaseCrawler):
    """Hindu BusinessLine markets RSS — replaces the dead FrontPage source.
    BL exposes a clean RSS feed with real pubDates, so timestamps are honest."""
    source_name = "Hindu BusinessLine"
    source_url = "https://www.thehindubusinessline.com/markets/feeder/default.rss"
    source_rank = 3

    async def scrape(self) -> list[NewsItem]:
        try:
            import xml.etree.ElementTree as ET
            from crawlers.extractor import extract_timestamp, extract_tickers

            xml_text = await self.fetch_html(self.source_url)
            if not xml_text:
                return []

            root = ET.fromstring(xml_text.encode("utf-8"))
            items = []

            for item in root.findall(".//item")[:25]:
                title_el = item.find("title")
                title = title_el.text if title_el is not None else ""
                if not title:
                    continue

                link_el = item.find("link")
                url = link_el.text if link_el is not None else ""
                if not url:
                    continue

                pub_date_el = item.find("pubDate")
                pub_date_str = pub_date_el.text if pub_date_el is not None else ""
                published_at = extract_timestamp(pub_date_str) if pub_date_str else None

                news_item = self.to_news_item(title.strip(), url.strip(), published_at=published_at)
                news_item.tickers = extract_tickers(title)
                items.append(news_item)

            return items
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Hindu BusinessLine] Scraping failed: {e}")
            return []


class MoneycontrolRSSCrawler(BaseCrawler):
    """Google News RSS Crawler restricted specifically to Moneycontrol articles."""
    source_name = "Moneycontrol"
    source_url = "https://news.google.com/rss/search?q=site:moneycontrol.com+stock+market+india+business&hl=en-IN&gl=IN&ceid=IN:en"
    source_rank = 2

    async def scrape(self) -> list[NewsItem]:
        try:
            import xml.etree.ElementTree as ET
            from crawlers.extractor import extract_timestamp, extract_tickers

            html = await self.fetch_html(self.source_url)
            if not html:
                return []
            
            root = ET.fromstring(html.encode("utf-8"))
            items = []
            
            for item in root.findall(".//item")[:25]:
                title_full = item.find("title")
                title_text = title_full.text if title_full is not None else ""
                if not title_text:
                    continue

                headline = title_text
                # Clean up " - Moneycontrol" suffix from headlines
                if " - " in title_text:
                    parts = title_text.rsplit(" - ", 1)
                    headline = parts[0]
                
                link_el = item.find("link")
                url = link_el.text if link_el is not None else ""
                
                pub_date_el = item.find("pubDate")
                pub_date_str = pub_date_el.text if pub_date_el is not None else ""
                published_at = extract_timestamp(pub_date_str) if pub_date_str else None
                
                news_item = self.to_news_item(headline, url, published_at=published_at)
                news_item.source_name = "Moneycontrol"
                news_item.tickers = extract_tickers(headline)
                items.append(news_item)
                
            return items
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Moneycontrol RSS] Scraping failed: {e}")
            return []


