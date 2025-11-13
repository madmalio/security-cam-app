from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime 
import uuid # <-- 1. Import uuid

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    display_name = Column(String, index=True, nullable=True)
    gravatar_hash = Column(String, nullable=True)
    
    tokens_valid_from = Column(DateTime, default=datetime.datetime.utcnow)

    cameras = relationship("Camera", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="owner", cascade="all, delete-orphan") # <-- 2. Add events relationship

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True)
    rtsp_url = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))
    display_order = Column(Integer, default=0)
    
    # --- 3. NEW: Add a secret for secure webhooks ---
    # This secret will be part of the webhook URL your camera calls,
    # proving the request is coming from your camera and not an attacker.
    webhook_secret = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))

    owner = relationship("User", back_populates="cameras")
    events = relationship("Event", back_populates="camera", cascade="all, delete-orphan") # <-- 2. Add events relationship

class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String, unique=True, index=True) # Refresh token's JWT ID
    user_id = Column(Integer, ForeignKey("users.id"))
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    
    user = relationship("User", back_populates="sessions")

# --- 4. NEW: Event model to store recordings ---
class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    end_time = Column(DateTime, nullable=True)
    reason = Column(String, default="motion", index=True) # e.g., "motion", "manual"
    video_path = Column(String, unique=True) # Path to the recorded .mp4 file
    
    # Foreign key to the camera that recorded this
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    # Foreign key to the user who owns the camera (for faster queries)
    user_id = Column(Integer, ForeignKey("users.id"))

    camera = relationship("Camera", back_populates="events")
    owner = relationship("User", back_populates="events")