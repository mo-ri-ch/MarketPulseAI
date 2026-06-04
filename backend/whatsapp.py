"""
WhatsApp Cloud API integration for MarketPulse AI.

Sends breaking-news alerts to a user's WhatsApp number using Meta's
free WhatsApp Cloud API (Graph API v19+).

Required environment variables
───────────────────────────────
WHATSAPP_TOKEN          — Permanent access token from Meta Developer console
WHATSAPP_PHONE_ID       — Phone Number ID (not the phone number itself) from
                          the WhatsApp > Getting Started page
WHATSAPP_API_VERSION    — Graph API version, defaults to v19.0

Setup (one-time, free)
───────────────────────
1. Go to https://developers.facebook.com/ → Create App → Business
2. Add the "WhatsApp" product to your app
3. Under WhatsApp > Getting Started, note your:
   - Temporary / Permanent access token  → WHATSAPP_TOKEN
   - Phone Number ID                     → WHATSAPP_PHONE_ID
4. Add your personal WhatsApp number as a "test recipient" in the console
5. Set both env vars in your Railway service variables
"""

import os
import logging
import httpx
from datetime import datetime

logger = logging.getLogger(__name__)

WHATSAPP_TOKEN       = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID    = os.getenv("WHATSAPP_PHONE_ID", "")
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v19.0")

_GRAPH_URL = (
    f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"
    f"/{WHATSAPP_PHONE_ID}/messages"
)


def _is_configured() -> bool:
    """Return True if both required env vars are present."""
    return bool(WHATSAPP_TOKEN and WHATSAPP_PHONE_ID)


def _sentiment_emoji(sentiment: dict | None) -> str:
    """Return a quick emoji for the sentiment score dict."""
    if not sentiment:
        return "⚪"
    if sentiment.get("positive", 0) > 0.5:
        return "🟢"
    if sentiment.get("negative", 0) > 0.5:
        return "🔴"
    return "🟡"


def _sentiment_label(sentiment: dict | None) -> str:
    if not sentiment:
        return "Neutral"
    if sentiment.get("positive", 0) > 0.5:
        return "Bullish"
    if sentiment.get("negative", 0) > 0.5:
        return "Bearish"
    return "Neutral"


def format_news_alert(news_item: dict, portfolio_name: str | None = None) -> str:
    """
    Format a single news article into a WhatsApp text message.

    news_item fields used: headline, url, source, published_at, sentiment
    """
    headline  = news_item.get("headline", "").strip()
    url       = news_item.get("url", "").strip()
    source    = news_item.get("source") or "MarketPulse"
    sentiment = news_item.get("sentiment")

    s_emoji = _sentiment_emoji(sentiment)
    s_label = _sentiment_label(sentiment)

    now_ist = datetime.utcnow()  # approximate; fine for alert labels
    time_str = now_ist.strftime("%d %b %Y, %H:%M UTC")

    lines = [
        f"📰 *{headline}*",
        f"",
        f"{s_emoji} Sentiment: *{s_label}*",
        f"📊 Source: {source}",
    ]
    if portfolio_name:
        lines.append(f"📁 Portfolio: {portfolio_name}")
    lines += [
        f"🕐 {time_str}",
        f"",
        f"🔗 {url}",
        f"",
        f"_— MarketPulse AI_",
    ]
    return "\n".join(lines)


async def send_whatsapp_message(to: str, text: str) -> bool:
    """
    Send a plain-text WhatsApp message via Meta Cloud API.

    Parameters
    ----------
    to   : E.164 phone number string, e.g. "+919876543210"
    text : Message body (max ~4096 chars for regular text messages)

    Returns True on success, False on failure (logged internally).
    """
    if not _is_configured():
        logger.warning(
            "[WhatsApp] WHATSAPP_TOKEN or WHATSAPP_PHONE_ID not set — "
            "skipping alert dispatch."
        )
        return False

    # Normalise: strip spaces/dashes, ensure leading +
    phone = to.replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+" + phone

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": text,
        },
    }
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(_GRAPH_URL, json=payload, headers=headers)
        if r.status_code == 200:
            logger.info(f"[WhatsApp] Alert sent to {phone[:6]}***")
            return True
        else:
            logger.warning(
                f"[WhatsApp] API returned {r.status_code}: {r.text[:200]}"
            )
            return False
    except Exception as exc:
        logger.error(f"[WhatsApp] Failed to send message: {exc}")
        return False


async def dispatch_news_alerts(
    new_articles: list[dict],
    users_with_numbers: list[dict],
) -> None:
    """
    For every new article, send a WhatsApp alert to each eligible user.

    Parameters
    ----------
    new_articles        : list of news dicts (headline, url, source, sentiment, tickers_matched)
    users_with_numbers  : list of dicts with keys:
                            - whatsapp_number  (str)
                            - portfolio_name   (str | None)
                            - tickers          (list[str]) — empty = receive all news
    """
    if not _is_configured():
        return
    if not new_articles or not users_with_numbers:
        return

    for article in new_articles:
        article_tickers = set(article.get("tickers_matched", []))
        for user in users_with_numbers:
            phone         = user.get("whatsapp_number", "")
            user_tickers  = set(user.get("tickers", []))
            portfolio_name = user.get("portfolio_name")

            if not phone:
                continue

            # Filter: if the user has a portfolio, only send matching articles
            if user_tickers and article_tickers and not user_tickers.intersection(article_tickers):
                continue

            msg = format_news_alert(article, portfolio_name=portfolio_name)
            await send_whatsapp_message(phone, msg)
