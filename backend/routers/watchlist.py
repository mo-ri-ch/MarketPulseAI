"""
Watchlist CRUD + Alerts backend endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
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
    user_id: int
    type: str       # PRICE | NEWS | SENTIMENT
    target: str     # ticker symbol or "*"
    condition: str  # e.g. "price > 1500" or "sentiment == negative"

# ── Watchlists ─────────────────────────────────────────────────────────────────

@router.post("/watchlists")
def create_watchlist(data: WatchlistCreate, user_id: int, db: Session = Depends(get_db)):
    wl = models.Watchlist(user_id=user_id, name=data.name, stocks=data.stocks)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return wl

@router.get("/watchlists")
def get_watchlists(user_id: int, db: Session = Depends(get_db)):
    return db.query(models.Watchlist).filter(models.Watchlist.user_id == user_id).all()

@router.put("/watchlists/{wl_id}")
def update_watchlist(wl_id: int, data: WatchlistUpdate, db: Session = Depends(get_db)):
    wl = db.query(models.Watchlist).filter(models.Watchlist.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if data.name is not None:
        wl.name = data.name
    if data.stocks is not None:
        wl.stocks = data.stocks
    db.commit()
    db.refresh(wl)
    return wl

@router.delete("/watchlists/{wl_id}")
def delete_watchlist(wl_id: int, db: Session = Depends(get_db)):
    wl = db.query(models.Watchlist).filter(models.Watchlist.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    db.delete(wl)
    db.commit()
    return {"message": "Watchlist deleted"}

@router.post("/watchlists/{wl_id}/add")
def add_stock(wl_id: int, ticker: str, db: Session = Depends(get_db)):
    wl = db.query(models.Watchlist).filter(models.Watchlist.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    existing = [s.strip().upper() for s in (wl.stocks or "").split(",") if s.strip()]
    ticker = ticker.upper()
    if ticker not in existing:
        existing.append(ticker)
    wl.stocks = ",".join(existing)
    db.commit()
    return {"stocks": existing}

@router.post("/watchlists/{wl_id}/remove")
def remove_stock(wl_id: int, ticker: str, db: Session = Depends(get_db)):
    wl = db.query(models.Watchlist).filter(models.Watchlist.id == wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    existing = [s.strip().upper() for s in (wl.stocks or "").split(",") if s.strip()]
    ticker = ticker.upper()
    existing = [s for s in existing if s != ticker]
    wl.stocks = ",".join(existing)
    db.commit()
    return {"stocks": existing}

# ── Alerts ─────────────────────────────────────────────────────────────────────

@router.post("/alerts")
def create_alert(data: AlertCreate, db: Session = Depends(get_db)):
    alert = models.Alert(
        user_id=data.user_id,
        type=data.type,
        target=data.target,
        condition=data.condition,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert

@router.get("/alerts")
def get_alerts(user_id: int, db: Session = Depends(get_db)):
    return db.query(models.Alert).filter(
        models.Alert.user_id == user_id,
        models.Alert.is_active == True,
    ).all()

@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    db.commit()
    return {"message": "Alert disabled"}
