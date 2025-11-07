from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    cameras = relationship("Camera", back_populates="owner")


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True)
    
    # --- THIS IS THE NEW LINE ---
    rtsp_url = Column(String) # Store the camera's RTSP URL
    
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="cameras")