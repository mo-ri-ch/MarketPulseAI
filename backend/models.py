from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True) # Nullable for OAuth
    google_id = Column(String, unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # WhatsApp breaking-news alerts
    whatsapp_number = Column(String, nullable=True)          # E.164, e.g. "+919876543210"
    whatsapp_alerts_enabled = Column(Boolean, default=False, nullable=False)

class Watchlist(Base):
    __tablename__ = "watchlists"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, nullable=False)
    stocks = Column(String) # Comma separated list of tickers
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Source(Base):
    __tablename__ = "sources"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    url = Column(String, nullable=False)
    rank = Column(Integer, default=10) # 1 is highest priority

class News(Base):
    __tablename__ = "news"
    
    id = Column(Integer, primary_key=True, index=True)
    headline = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    url = Column(String, unique=True, nullable=False)
    source_id = Column(Integer, ForeignKey("sources.id"))
    published_at = Column(DateTime(timezone=True), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_archived = Column(Boolean, default=False, nullable=False)


class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    type = Column(String) # PRICE, NEWS, SENTIMENT
    target = Column(String) # Stock ticker or *
    condition = Column(String)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)

class Summary(Base):
    __tablename__ = "summaries"
    
    id = Column(Integer, primary_key=True, index=True)
    news_id = Column(Integer, ForeignKey("news.id"))
    ai_summary = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SentimentScore(Base):
    __tablename__ = "sentiment_scores"
    
    id = Column(Integer, primary_key=True, index=True)
    news_id = Column(Integer, ForeignKey("news.id"))
    positive = Column(Float, default=0.0)
    neutral = Column(Float, default=0.0)
    negative = Column(Float, default=0.0)
