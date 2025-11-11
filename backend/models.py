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

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True)
    rtsp_url = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="cameras")