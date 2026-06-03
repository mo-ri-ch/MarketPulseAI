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
from urllib.parse import quote_plus
from crawlers.base import BaseCrawler, NewsItem
from crawlers.extractor import extract_tickers, extract_timestamp


async def scrape_via_google_news(crawler: BaseCrawler, query: str, limit: int = 25) -> list[NewsItem]:
    """
    Shared helper: pull a Google News RSS search result and convert to
    NewsItems. Used by sources whose own HTML or RSS endpoints either
    block cloud IPs (Reuters, Business Standard) or no longer expose a
    parseable structure (TradingView, Motilal Oswal). Google News indexes
    those publishers reliably and provides real pubDates, so timestamps
    are honest.

    `query` is the raw Google News query (URL-encoded internally), e.g.
    'site:reuters.com india markets'. The crawler's source_name is stamped
    on each item so badges remain branded as Reuters / BS / etc. rather
    than "Google News".
    """
    try:
        import xml.etree.ElementTree as ET
        url = (
            "https://news.google.com/rss/search?q="
            f"{quote_plus(query)}&hl=en-IN&gl=IN&ceid=IN:en"
        )
        xml_text = await crawler.fetch_html(url)
        if not xml_text:
            return []

        root = ET.fromstring(xml_text.encode("utf-8"))
        items: list[NewsItem] = []
        for item in root.findall(".//item")[:limit]:
            title_el = item.find("title")
            title = title_el.text if title_el is not None else ""
            if not title:
                continue
            # Google News appends " - Publisher" to titles. Strip it.
            headline = title.rsplit(" - ", 1)[0] if " - " in title else title

            link_el = item.find("link")
            link = link_el.text if link_el is not None else ""
            if not link:
                continue

            pub_date_el = item.find("pubDate")
            pub_date_str = pub_date_el.text if pub_date_el is not None else ""
            published_at = extract_timestamp(pub_date_str) if pub_date_str else None

            news_item = crawler.to_news_item(headline.strip(), link.strip(), published_at=published_at)
            news_item.tickers = extract_tickers(headline)
            items.append(news_item)
        return items
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"[{crawler.source_name}] Google News scrape failed: {e}")
        return []


# ---------- Secondary Sources ----------

class ReutersCrawler(BaseCrawler):
    """Reuters blocks direct scrapes from cloud IPs (403), so we route
    through Google News with a site filter. Yields real Reuters URLs and
    real pubDates."""
    source_name = "Reuters"
    source_url = "https://www.reuters.com/markets/"
    source_rank = 3

    async def scrape(self) -> list[NewsItem]:
        return await scrape_via_google_news(self, "site:reuters.com india markets")


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
    """BS RSS endpoints return 403 to cloud IPs and the markets page
    requires JS, so route through Google News with a site filter."""
    source_name = "Business Standard"
    source_url = "https://www.business-standard.com/markets"
    source_rank = 6

    async def scrape(self) -> list[NewsItem]:
        return await scrape_via_google_news(self, "site:business-standard.com markets")


class CNBCTv18Crawler(BaseCrawler):
    """CNBC TV18 exposes a proper RSS feed with ~200 fresh market items
    and real pubDates — far better than scraping the JS-rendered page."""
    source_name = "CNBC TV18"
    source_url = "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml"
    source_rank = 4

    async def scrape(self) -> list[NewsItem]:
        try:
            import xml.etree.ElementTree as ET
            xml_text = await self.fetch_html(self.source_url)
            if not xml_text:
                return []
            root = ET.fromstring(xml_text.encode("utf-8"))
            items: list[NewsItem] = []
            for item in root.findall(".//item")[:25]:
                title_el = item.find("title")
                title = title_el.text if title_el is not None else ""
                if not title:
                    continue
                link_el = item.find("link")
                link = link_el.text if link_el is not None else ""
                if not link:
                    continue
                pub_date_el = item.find("pubDate")
                pub_date_str = pub_date_el.text if pub_date_el is not None else ""
                published_at = extract_timestamp(pub_date_str) if pub_date_str else None
                news_item = self.to_news_item(title.strip(), link.strip(), published_at=published_at)
                news_item.tickers = extract_tickers(title)
                items.append(news_item)
            return items
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[CNBC TV18] RSS scrape failed: {e}")
            return []


# ---------- Community Sources ----------

class RedditCrawler(BaseCrawler):
    """Reddit's hot.json endpoint returns 403 to most cloud IPs now, but
    the public Atom feed at /r/<sub>/.rss still works. Atom uses <entry>
    rather than <item>, hence the namespaced findall below."""
    source_name = "Reddit"
    source_url = "https://www.reddit.com/r/IndianStockMarket/.rss"
    source_rank = 7

    _ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}

    async def scrape(self) -> list[NewsItem]:
        try:
            import xml.etree.ElementTree as ET
            xml_text = await self.fetch_html(self.source_url)
            if not xml_text:
                return []
            root = ET.fromstring(xml_text.encode("utf-8"))
            items: list[NewsItem] = []
            for entry in root.findall("atom:entry", self._ATOM_NS)[:25]:
                title_el = entry.find("atom:title", self._ATOM_NS)
                title = title_el.text if title_el is not None else ""
                if not title:
                    continue
                link_el = entry.find("atom:link", self._ATOM_NS)
                link = link_el.get("href") if link_el is not None else ""
                if not link:
                    continue
                # Atom uses <updated> not <pubDate>
                updated_el = entry.find("atom:updated", self._ATOM_NS)
                pub_str = updated_el.text if updated_el is not None else ""
                published_at = extract_timestamp(pub_str) if pub_str else None
                news_item = self.to_news_item(title.strip(), link.strip(), published_at=published_at)
                news_item.tickers = extract_tickers(title)
                items.append(news_item)
            return items
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Reddit] Atom feed scrape failed: {e}")
            return []


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


