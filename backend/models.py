from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime 

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
    
    # --- NEW: Store the Region of Interest grid ---
    # This will be a comma-separated string of cell IDs (e.g., "0,1,2,10")
    motion_roi = Column(String, nullable=True) 

    owner = relationship("User", back_populates="cameras")
    events = relationship("Event", back_populates="camera", cascade="all, delete-orphan")

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

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    end_time = Column(DateTime, nullable=True)
    reason = Column(String, default="motion", index=True)
    video_path = Column(String, unique=True)
    
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    camera = relationship("Camera", back_populates="events")
    owner = relationship("User", back_populates="events")