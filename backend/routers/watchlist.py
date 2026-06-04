"""
Watchlist CRUD + Alerts backend endpoints.

All watchlist endpoints are scoped to the authenticated user via the
get_current_user dependency. The previous `user_id` query param was insecure
(any client could read/edit anyone else's watchlist) and has been removed.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from auth import get_current_user
import models

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
