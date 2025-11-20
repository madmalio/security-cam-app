from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime 
from datetime import timezone

def get_utc_now():
    return datetime.datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    display_name = Column(String, index=True, nullable=True)
    gravatar_hash = Column(String, nullable=True)
    
    tokens_valid_from = Column(DateTime(timezone=True), default=get_utc_now)

    cameras = relationship("Camera", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="owner", cascade="all, delete-orphan")

class Camera(Base):
    __tablename__ = "cameras"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True)
    rtsp_url = Column(String)
    rtsp_substream_url = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    display_order = Column(Integer, default=0)
    motion_type = Column(String, default="off", nullable=False)
    motion_roi = Column(String, nullable=True)
    motion_sensitivity = Column(Integer, default=50)
    continuous_recording = Column(Boolean, default=False, nullable=False)
    
    owner = relationship("User", back_populates="cameras")
    events = relationship("Event", back_populates="camera", cascade="all, delete-orphan")

class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String, unique=True, index=True) 
    user_id = Column(Integer, ForeignKey("users.id"))
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    
    user = relationship("User", back_populates="sessions")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    
    start_time = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    reason = Column(String, default="motion", index=True)
    video_path = Column(String, unique=True)
    thumbnail_path = Column(String, nullable=True) 
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    camera = relationship("Camera", back_populates="events")
    owner = relationship("User", back_populates="events")

# --- NEW TABLE ---
class SystemSettings(Base):
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    retention_days = Column(Integer, default=30) # Default to 30 days