from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv
import logging
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./marketpulse.db")

# Railway/Heroku still inject the legacy `postgres://` scheme but SQLAlchemy 2.x
# only accepts `postgresql://` (or `postgresql+psycopg2://`). Normalise upfront
# so a freshly-attached Postgres plugin works without manual env editing.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

if DATABASE_URL.startswith("postgresql"):
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    _driver = "postgresql"
else:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    _driver = "sqlite"

# Log which DB the app is talking to (no creds) — so /health "DATABASE_URL: false"
# vs an actual Postgres connection is visible at boot.
logging.getLogger(__name__).info(
    f"[DB] Using {_driver} engine (DATABASE_URL env {'set' if os.getenv('DATABASE_URL') else 'UNSET — falling back to ephemeral SQLite'})"
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
