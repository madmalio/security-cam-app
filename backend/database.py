from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings

# This class reads environment variables from the .env file
class Settings(BaseSettings):
    DATABASE_URL: str
    class Config:
        env_file = ".env"

settings = Settings()

# Create the SQLAlchemy engine
# 'DATABASE_URL' is pulled from your .env file
engine = create_engine(settings.DATABASE_URL)

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