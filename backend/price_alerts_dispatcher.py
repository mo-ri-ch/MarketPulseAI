"""
Server-side dispatcher for in-page price alerts → WhatsApp.

The frontend PriceAlertWatcher fires a toast and the siren whenever a
ticker's live price crosses one of the user's configured thresholds. This
module mirrors that behaviour on the server so the user also gets a
WhatsApp message — even when no browser tab is open.

Storage shape — the same Alert row that the popover saves (type='PRICE_WEB')
is reused. We extend the JSON `condition` field with two latch booleans so
we can dedupe sends across evaluation ticks:

    {"above": 1500.0, "below": 1200.0,
     "above_triggered": false, "below_triggered": false}

Semantics match the in-page watcher:
  - Fresh crossing (price out-of-band AND latch=false): send WhatsApp,
    set latch=true.
  - Price returns into the band: clear the corresponding latch so the next
    crossing can fire again.
  - One WhatsApp per fresh crossing — no spam while the price hovers.
"""
import json
import logging
import asyncio
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

import models
from whatsapp import send_whatsapp_template, _is_configured as _wa_configured

logger = logging.getLogger(__name__)

PRICE_WEB = "PRICE_WEB"

# Browser-ish UA — Yahoo's public chart endpoint refuses generic clients.
_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
}


def _yahoo_symbol(ticker: str) -> str:
    return f"{ticker}.NS"


async def _fetch_price(client: httpx.AsyncClient, ticker: str) -> float | None:
    """Pull the latest regularMarketPrice for one NSE ticker from Yahoo."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{_yahoo_symbol(ticker)}"
    try:
        r = await client.get(
            url,
            params={"interval": "1d", "range": "1d", "includePrePost": "false"},
            timeout=6.0,
        )
        if r.status_code != 200:
            return None
        result = r.json().get("chart", {}).get("result")
        if not result:
            return None
        meta = (result[0] or {}).get("meta", {}) or {}
        price = meta.get("regularMarketPrice")
        return float(price) if price is not None else None
    except Exception:
        return None


async def dispatch_price_alerts(db: Session) -> None:
    """Evaluate all active PRICE_WEB alerts and fire WhatsApp on fresh crossings."""
    if not _wa_configured():
        return

    rows: list[tuple[models.Alert, models.User]] = (
        db.query(models.Alert, models.User)
        .join(models.User, models.User.id == models.Alert.user_id)
        .filter(
            models.Alert.type == PRICE_WEB,
            models.Alert.is_active == True,
            models.User.whatsapp_alerts_enabled == True,
            models.User.whatsapp_number.isnot(None),
        )
        .all()
    )
    if not rows:
        return

    # One quote fetch per unique ticker — multiple users with the same stock
    # share a request.
    unique_tickers = sorted({a.target.upper() for a, _ in rows})
    async with httpx.AsyncClient(headers=_HTTP_HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*[_fetch_price(client, t) for t in unique_tickers])
    prices: dict[str, float] = {t: p for t, p in zip(unique_tickers, results) if p is not None}
    if not prices:
        return

    now_utc = datetime.utcnow()

    for alert, user in rows:
        ticker = alert.target.upper()
        price = prices.get(ticker)
        if price is None:
            continue

        try:
            cond: dict[str, Any] = json.loads(alert.condition or "{}")
        except (ValueError, TypeError):
            continue

        above = cond.get("above")
        below = cond.get("below")
        above_triggered = bool(cond.get("above_triggered"))
        below_triggered = bool(cond.get("below_triggered"))
        changed = False
        fired = False

        # ── Above ─────────────────────────────────────────────────────────
        if above is not None:
            if price >= above and not above_triggered:
                msg = f"{ticker} crossed above ₹{above} — Now ₹{price:.2f}"
                result = await send_whatsapp_template(
                    user.whatsapp_number,
                    template_name="price_alert",
                    language_code="en_US",
                    body_params=[ticker, f"{above:.2f}", f"{price:.2f}"],
                )
                logger.info(
                    f"[PriceAlerts/WA] {msg} → ok={result.get('ok')} "
                    f"status={result.get('status_code')}"
                )
                above_triggered = True
                changed = True
                fired = True
            elif price < above and above_triggered:
                above_triggered = False
                changed = True
        else:
            if above_triggered:
                above_triggered = False
                changed = True

        # ── Below ─────────────────────────────────────────────────────────
        if below is not None:
            if price <= below and not below_triggered:
                msg = f"{ticker} dropped below ₹{below} — Now ₹{price:.2f}"
                result = await send_whatsapp_template(
                    user.whatsapp_number,
                    template_name="price_alert",
                    language_code="en_US",
                    body_params=[ticker, f"{below:.2f}", f"{price:.2f}"],
                )
                logger.info(
                    f"[PriceAlerts/WA] {msg} → ok={result.get('ok')} "
                    f"status={result.get('status_code')}"
                )
                below_triggered = True
                changed = True
                fired = True
            elif price > below and below_triggered:
                below_triggered = False
                changed = True
        else:
            if below_triggered:
                below_triggered = False
                changed = True

        if changed:
            cond["above"] = above
            cond["below"] = below
            cond["above_triggered"] = above_triggered
            cond["below_triggered"] = below_triggered
            alert.condition = json.dumps(cond)
            if fired:
                alert.last_triggered_at = now_utc

    db.commit()
