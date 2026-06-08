"""
Watchlist CRUD + Alerts backend endpoints.

All watchlist endpoints are scoped to the authenticated user via the
get_current_user dependency. The previous `user_id` query param was insecure
(any client could read/edit anyone else's watchlist) and has been removed.
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from auth import get_current_user
import models

# Alert.type value used by the in-page price alert system. Kept distinct from
# the legacy 'PRICE' alerts that the email evaluator handles so the two stay
# decoupled.
PRICE_WEB = "PRICE_WEB"

router = APIRouter()

# ── Schemas ────────────────────────────────────────────────────────────────────

class WatchlistCreate(BaseModel):
    name: str
    stocks: str = ""  # comma-separated tickers e.g. "TCS,INFY,RELIANCE"

class WatchlistUpdate(BaseModel):
    name: str | None = None
    stocks: str | None = None

class AlertCreate(BaseModel):
    type: str       # PRICE | NEWS | SENTIMENT
    target: str     # ticker symbol or "*"
    condition: str  # e.g. "price > 1500" or "sentiment == negative"


def _serialize(wl: models.Watchlist) -> dict:
    """Return a frontend-friendly representation: stocks as a list."""
    return {
        "id": wl.id,
        "name": wl.name,
        "stocks": [s.strip().upper() for s in (wl.stocks or "").split(",") if s.strip()],
    }


def _owned_watchlist(db: Session, wl_id: int, user: models.User) -> models.Watchlist:
    """Fetch a watchlist and verify it belongs to the authenticated user."""
    wl = db.query(models.Watchlist).filter(models.Watchlist.id == wl_id).first()
    if not wl or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return wl

# ── Watchlists ─────────────────────────────────────────────────────────────────

@router.post("/watchlists")
def create_watchlist(
    data: WatchlistCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wl = models.Watchlist(user_id=current_user.id, name=data.name, stocks=data.stocks)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return _serialize(wl)


@router.get("/watchlists")
def get_watchlists(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Watchlist)
        .filter(models.Watchlist.user_id == current_user.id)
        .order_by(models.Watchlist.id.asc())
        .all()
    )
    return [_serialize(w) for w in rows]


@router.put("/watchlists/{wl_id}")
def update_watchlist(
    wl_id: int,
    data: WatchlistUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wl = _owned_watchlist(db, wl_id, current_user)
    if data.name is not None:
        wl.name = data.name
    if data.stocks is not None:
        wl.stocks = data.stocks
    db.commit()
    db.refresh(wl)
    return _serialize(wl)


@router.delete("/watchlists/{wl_id}")
def delete_watchlist(
    wl_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wl = _owned_watchlist(db, wl_id, current_user)
    db.delete(wl)
    db.commit()
    return {"message": "Watchlist deleted"}


@router.post("/watchlists/{wl_id}/add")
def add_stock(
    wl_id: int,
    ticker: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wl = _owned_watchlist(db, wl_id, current_user)
    existing = [s.strip().upper() for s in (wl.stocks or "").split(",") if s.strip()]
    ticker = ticker.upper().strip()
    if ticker and ticker not in existing:
        existing.append(ticker)
    wl.stocks = ",".join(existing)
    db.commit()
    return {"stocks": existing}


@router.post("/watchlists/{wl_id}/remove")
def remove_stock(
    wl_id: int,
    ticker: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wl = _owned_watchlist(db, wl_id, current_user)
    existing = [s.strip().upper() for s in (wl.stocks or "").split(",") if s.strip()]
    ticker = ticker.upper().strip()
    existing = [s for s in existing if s != ticker]
    wl.stocks = ",".join(existing)
    db.commit()
    return {"stocks": existing}

# ── WhatsApp Alert Settings ────────────────────────────────────────────────────

class WhatsAppSettings(BaseModel):
    phone_number: str   # E.164 format, e.g. "+919876543210"
    enabled: bool = True


def _mask_phone(number: str) -> str:
    """Return a partially-masked number for display, e.g. +91******3210."""
    if not number or len(number) < 6:
        return number
    country = number[:3]         # e.g. +91
    last4   = number[-4:]        # e.g. 3210
    stars   = "*" * (len(number) - 7)
    return f"{country}{stars}{last4}"


@router.get("/user/whatsapp")
def get_whatsapp_settings(
    current_user: models.User = Depends(get_current_user),
):
    """Return the user's WhatsApp alert configuration (number is masked)."""
    return {
        "configured": bool(current_user.whatsapp_number),
        "phone_number_masked": _mask_phone(current_user.whatsapp_number or ""),
        "enabled": bool(current_user.whatsapp_alerts_enabled),
    }


@router.put("/user/whatsapp")
def save_whatsapp_settings(
    data: WhatsAppSettings,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save or update the user's WhatsApp number and enable/disable alerts."""
    phone = data.phone_number.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+") or len(phone) < 8:
        raise HTTPException(
            status_code=400,
            detail="Phone number must be in E.164 format, e.g. +919876543210",
        )
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    user.whatsapp_number = phone
    user.whatsapp_alerts_enabled = data.enabled
    db.commit()
    return {
        "configured": True,
        "phone_number_masked": _mask_phone(phone),
        "enabled": data.enabled,
        "message": "WhatsApp alerts saved ✓",
    }


@router.delete("/user/whatsapp")
def delete_whatsapp_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Remove the WhatsApp number and disable alerts for this user."""
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    user.whatsapp_number = None
    user.whatsapp_alerts_enabled = False
    db.commit()
    return {"configured": False, "enabled": False, "message": "WhatsApp alerts removed"}


@router.post("/user/whatsapp/test")
async def send_whatsapp_test(
    template: str = "pulse_alert",
    current_user: models.User = Depends(get_current_user),
):
    """
    Send the Meta-provided `hello_world` template to the user's saved
    number. Templates bypass the 24-hour customer-service window that
    silently swallows free-form text, so this should land on your phone
    as soon as Railway redeploys — proving the API token, phone-id, and
    recipient allow-list are all working end-to-end.

    `hello_world` (en_US) is pre-approved by Meta in every new WhatsApp
    app, so no template-creation work is required.
    """
    from whatsapp import send_whatsapp_template

    if not current_user.whatsapp_number:
        raise HTTPException(
            status_code=400,
            detail="No WhatsApp number saved. Save one via PUT /user/whatsapp first.",
        )

    # Default: send a preview of the real `pulse_alert` template. Override
    # with ?template=hello_world to fire Meta's pre-approved built-in
    # template — useful for diagnosing whether the pipeline (token,
    # phone ID, recipient allowlist) is healthy independent of your own
    # template-approval status.
    if template == "hello_world":
        body_params = None  # hello_world takes no body params
    else:
        body_params = ["TATASTEEL", "202.90", "202.50"]

    result = await send_whatsapp_template(
        current_user.whatsapp_number,
        template_name=template,
        language_code="en_US",
        body_params=body_params,
    )
    return {
        "delivered_per_meta": result["ok"],
        "status_code": result["status_code"],
        "meta_response": result["body"],
        "error": result["error"],
        "configured": result["configured"],
        "phone_used_masked": _mask_phone(result["phone"]),
        "graph_url": result["graph_url"],
        "template_used": result.get("template"),
        "hint": (
            "If you receive a TATASTEEL price-alert preview, your pipeline is "
            "working. Make sure the `pulse_alert` template (Utility, en_US) "
            "is Approved in the Meta dashboard with the body: "
            "'Stock {{1}} has crossed your alert threshold of ₹{{2}}. "
            "Current price is ₹{{3}} per share.'"
        ),
    }


# ── In-page Price Alerts ───────────────────────────────────────────────────────
# Per-ticker (above/below) price thresholds rendered as toasts in the web UI.
# Stored in the existing Alert table with type=PRICE_WEB and condition encoded
# as JSON like {"above": 1500.0, "below": 1200.0}. Either side may be null.

class PriceAlertIn(BaseModel):
    above: float | None = None
    below: float | None = None


def _decode_thresholds(condition: str | None) -> dict:
    if not condition:
        return {"above": None, "below": None}
    try:
        raw = json.loads(condition)
        above = raw.get("above")
        below = raw.get("below")
        return {
            "above": float(above) if above is not None else None,
            "below": float(below) if below is not None else None,
        }
    except (ValueError, TypeError):
        return {"above": None, "below": None}


def _price_alert_row(db: Session, user_id: int, ticker: str) -> models.Alert | None:
    return (
        db.query(models.Alert)
        .filter(
            models.Alert.user_id == user_id,
            models.Alert.type == PRICE_WEB,
            models.Alert.target == ticker,
        )
        .first()
    )


@router.get("/price-alerts")
def list_price_alerts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Alert)
        .filter(
            models.Alert.user_id == current_user.id,
            models.Alert.type == PRICE_WEB,
            models.Alert.is_active == True,
        )
        .all()
    )
    return [
        {"ticker": r.target.upper(), **_decode_thresholds(r.condition)}
        for r in rows
    ]


@router.put("/price-alerts/{ticker}")
def upsert_price_alert(
    ticker: str,
    data: PriceAlertIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Set (or clear) the above/below thresholds for one ticker.

    Passing both fields as null removes the alert outright so the watcher
    stops considering it.
    """
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker required")

    row = _price_alert_row(db, current_user.id, ticker)

    if data.above is None and data.below is None:
        if row:
            db.delete(row)
            db.commit()
        return {"ticker": ticker, "above": None, "below": None}

    condition = json.dumps({"above": data.above, "below": data.below})
    if row:
        row.condition = condition
        row.is_active = True
    else:
        row = models.Alert(
            user_id=current_user.id,
            type=PRICE_WEB,
            target=ticker,
            condition=condition,
            is_active=True,
        )
        db.add(row)
    db.commit()
    return {"ticker": ticker, "above": data.above, "below": data.below}


@router.delete("/price-alerts/{ticker}")
def delete_price_alert(
    ticker: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticker = ticker.upper().strip()
    row = _price_alert_row(db, current_user.id, ticker)
    if row:
        db.delete(row)
        db.commit()
    return {"ticker": ticker, "removed": True}


# ── Alerts ─────────────────────────────────────────────────────────────────────

@router.post("/alerts")
def create_alert(
    data: AlertCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    alert = models.Alert(
        user_id=current_user.id,
        type=data.type,
        target=data.target,
        condition=data.condition,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.get("/alerts")
def get_alerts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Alert).filter(
        models.Alert.user_id == current_user.id,
        models.Alert.is_active == True,
    ).all()


@router.delete("/alerts/{alert_id}")
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    alert = (
        db.query(models.Alert)
        .filter(models.Alert.id == alert_id, models.Alert.user_id == current_user.id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    db.commit()
    return {"message": "Alert disabled"}
