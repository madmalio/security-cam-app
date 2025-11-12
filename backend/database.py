from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings

# --- This class now reads the secret from a file ---
class Settings(BaseSettings):
    DATABASE_URL: str
    
    class Config:
        # Pydantic-settings can read from secret files
        secrets_dir = "/run/secrets"

# --- Create a helper function to read the secret ---
def get_db_url():
    try:
        with open("/run/secrets/db_url_secret", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        print("!!! ERROR: 'db_url_secret' file not found. Using fallback for local dev.")
        # Fallback for running python main.py directly (not in Docker)
        return "postgresql://admin:supersecret@localhost/cameradb"

DATABASE_URL = get_db_url()

# Create the SQLAlchemy engine
engine = create_engine(DATABASE_URL)

# Each instance of SessionLocal will be a new database session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our SQLAlchemy models
Base = declarative_base()

# Dependency to get a DB session in API routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()