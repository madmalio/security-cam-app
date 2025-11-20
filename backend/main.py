from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
import re
import httpx
import logging
import asyncio
import hashlib
import uuid
import time
import shutil
import psutil
import docker 
from datetime import datetime, timezone, timedelta, date 
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import sys

# Import our own modules
import models
import database
from database import SessionLocal, engine, get_db

from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel, Field, validator

# --- Logging ---
log = logging.getLogger("uvicorn")

# --- Database Initialization ---
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

os.makedirs("/recordings", exist_ok=True)
app.mount("/recordings", StaticFiles(directory="/recordings"), name="recordings")


# ====================================================================
#                 CORS Middleware & Pydantic Schemas
# ====================================================================

# --- FIX: Allow ALL origins so mobile devices can connect via IP ---
origin_regex = r"^http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origin_regex, # <-- Changed from allow_origins
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

class CameraBase(BaseModel): name: str
class CameraCreate(BaseModel): 
    name: str
    rtsp_url: str
    rtsp_substream_url: Optional[str] = None

class Camera(CameraBase):
    id: int
    owner_id: int
    path: str
    rtsp_url: str
    rtsp_substream_url: Optional[str] = None
    display_order: int
    motion_type: str
    motion_roi: Optional[str] = None
    motion_sensitivity: int 
    continuous_recording: bool
    class Config: from_attributes = True 

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    rtsp_substream_url: Optional[str] = None
    motion_type: Optional[str] = None
    motion_roi: Optional[str] = None
    motion_sensitivity: Optional[int] = None 
    continuous_recording: Optional[bool] = None

class TestCameraRequest(BaseModel):
    rtsp_url: str
class ReorderRequest(BaseModel):
    camera_ids: List[int]
class UserBase(BaseModel):
    email: str
    display_name: Optional[str] = None
class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    @validator('password')
    def password_byte_length(cls, v):
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long (max 72 bytes)')
        return v
class UserSession(BaseModel):
    id: int
    jti: str
    user_agent: Optional[str]
    ip_address: Optional[str]
    created_at: datetime
    class Config: from_attributes = True
class User(UserBase):
    id: int
    cameras: List[Camera] = []
    gravatar_hash: Optional[str] = None
    class Config: from_attributes = True 
class UserUpdate(BaseModel):
    display_name: Optional[str] = None
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
class TokenData(BaseModel):
    email: str | None = None
class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)
    @validator('new_password')
    def password_byte_length(cls, v):
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long (max 72 bytes)')
        return v
class Event(BaseModel):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    reason: str
    video_path: str
    thumbnail_path: Optional[str] = None
    camera_id: int
    user_id: int
    camera: CameraBase
    class Config: from_attributes = True
class EventSummary(BaseModel):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    camera_id: int
    class Config: from_attributes = True

class RecordingSegment(BaseModel):
    start_time: str  # ISO format
    end_time: str    # ISO format
    filename: str

class SystemHealth(BaseModel):
    cpu_percent: float
    memory_total: int
    memory_used: int
    memory_percent: float
    disk_total: int
    disk_free: int
    disk_used: int
    disk_percent: float
    uptime_seconds: float

class SystemSettingsSchema(BaseModel):
    retention_days: int

# --- Batch Delete Schema ---
class BatchDeleteRequest(BaseModel):
    event_ids: List[int]


# ====================================================================
#                 Security & Auth
# ====================================================================
def get_secret_key():
    try:
        with open("/run/secrets/jwt_secret_key", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        print("!!! ERROR: 'jwt_secret_key' file not found. Using fallback for local dev.")
        return "oVlxx1WjIyVNfsr2WWROPcsVyBhW5L7u"

SECRET_KEY = get_secret_key()
MEDIAMTX_ADMIN_PASS = "mysecretpassword"
MEDIAMTX_VIEWER_PASS = "secret"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)
def verify_password(plain_password, hashed_password): return pwd_context.verify(plain_password, hashed_password)
def get_password_hash(password): return pwd_context.hash(password)
def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# ====================================================================
#                 Helper Functions
# ====================================================================

async def configure_mediamtx_path(camera_path: str, rtsp_url: str):
    """Adds or updates a camera path in mediamtx."""
    auth = ("admin", MEDIAMTX_ADMIN_PASS) 
    
    path_config = {
        "source": rtsp_url,
        "sourceOnDemand": True,
    }

    async with httpx.AsyncClient() as client:
        patch_url = f"http://mediamtx:9997/v3/config/paths/patch/{camera_path}"
        try:
            response = await client.patch(patch_url, auth=auth, json=path_config)
            if response.status_code == 404:
                log.warning(f"--- Path {camera_path} not found, creating... ---")
                add_url = f"http://mediamtx:9997/v3/config/paths/add/{camera_path}"
                add_response = await client.post(add_url, auth=auth, json=path_config)
                add_response.raise_for_status()
            else:
                response.raise_for_status()
        except httpx.HTTPStatusError as e:
            log.error(f"--- mediamtx API error: {e.response.text} ---")
            raise
        except httpx.RequestError as e:
            log.error(f"--- Cannot contact mediamtx: {e} ---")
            raise

# ====================================================================
#                     Startup Event
# ====================================================================
@app.on_event("startup")
async def on_startup():
    log.info("--- STARTUP: Re-populating mediamtx ---")
    db = SessionLocal()
    try:
        all_cameras = db.query(models.Camera).all()
        if not all_cameras:
            log.info("--- STARTUP: No cameras in database. Skipping. ---")
            return
        
        for camera in all_cameras:
            if not camera.rtsp_url:
                log.warning(f"--- STARTUP: Skipping camera {camera.path} (no URL) ---")
                continue
            log.info(f"--- STARTUP: Updating camera {camera.path} ---")
            await configure_mediamtx_path(camera.path, camera.rtsp_url) 
            
    except Exception as e:
        log.error(f"--- STARTUP: Failed to configure mediamtx: {e} ---")
    finally:
        db.close()
    log.info("--- STARTUP: mediamtx re-population complete. ---")


# ====================================================================
#                 DB Functions
# ====================================================================
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).options(joinedload(models.User.cameras)).filter(models.User.email == email).first()
def get_gravatar_hash(email: str) -> str:
    email_for_hash = email.strip().lower().encode('utf-8')
    return hashlib.md5(email_for_hash).hexdigest()
def create_user_db(db: Session, user: UserCreate):
    hashed_password = get_password_hash(user.password)
    gravatar_hash = get_gravatar_hash(user.email) 
    db_user = models.User(
        email=user.email, 
        hashed_password=hashed_password,
        display_name=user.display_name or user.email.split('@')[0],
        gravatar_hash=gravatar_hash,
        tokens_valid_from=datetime.now(timezone.utc)
    )
    db.add(db_user)
    db.commit()
    return get_user_by_email(db, user.email)
def get_cameras_by_user(db: Session, user_id: int):
    return db.query(models.Camera).filter(models.Camera.owner_id == user_id).order_by(models.Camera.display_order).all()

# ====================================================================
#                 Auth Dependency
# ====================================================================
async def get_current_user_from_token(token: str | None = Depends(oauth2_scheme)) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    revoked_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token has been revoked", 
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None: raise credentials_exception
    db = SessionLocal()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        iat_timestamp: int = payload.get("iat") 
        if email is None or iat_timestamp is None:
            raise credentials_exception
        token_iat = datetime.fromtimestamp(iat_timestamp, tz=timezone.utc)
        user = get_user_by_email(db, email=email)
        if user is None:
            raise credentials_exception
        if user.tokens_valid_from and token_iat < user.tokens_valid_from.replace(tzinfo=timezone.utc):
            raise revoked_exception
        return user
    except JWTError as e:
        credentials_exception.detail = f"Could not validate credentials: {e}"
        raise credentials_exception
    finally:
        db.close()

# ====================================================================
#                 API Endpoints
# ====================================================================
@app.get("/")
def read_root(): return {"message": "Security Camera API is running!"}
@app.post("/register", response_model=User)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = get_user_by_email(db, email=user.email)
    if db_user: raise HTTPException(status_code=400, detail="Email already registered")
    return create_user_db(db=db, user=user)
@app.post("/token", response_model=Token)
async def login_for_access_token(
    request: Request, 
    form_data: OAuth2PasswordRequestForm = Depends(), 
):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=form_data.username)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"},)
        
        now_utc = datetime.now(timezone.utc)
        
        access_jti = str(uuid.uuid4())
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token_data = {"sub": user.email, "iat": now_utc, "jti": access_jti, "type": "access"}
        access_token = create_access_token(access_token_data, expires_delta=access_token_expires)
        
        refresh_jti = str(uuid.uuid4())
        refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        refresh_token_expires_at = now_utc + refresh_token_expires
        refresh_token_data = {"sub": user.email, "iat": now_utc, "jti": refresh_jti, "type": "refresh"}
        refresh_token = create_access_token(refresh_token_data, expires_delta=refresh_token_expires)
        
        new_session = models.UserSession(
            jti=refresh_jti,
            user_id=user.id,
            user_agent=request.headers.get("User-Agent"),
            ip_address=request.client.host,
            expires_at=refresh_token_expires_at
        )
        db.add(new_session)
        db.commit()
        
        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
    finally: db.close()
@app.post("/token/refresh", response_model=Token)
async def refresh_access_token(request: Request):
    db = SessionLocal()
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
        
        refresh_token = auth_header.split(" ")[1]
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        
        email: str = payload.get("sub")
        jti: str = payload.get("jti")
        token_type: str = payload.get("type")
        iat_timestamp: int = payload.get("iat")
        
        if email is None or jti is None or token_type != "refresh" or iat_timestamp is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        
        session = db.query(models.UserSession).filter(models.UserSession.jti == jti).first()
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token not found (revoked)")
            
        user = db.query(models.User).filter(models.User.id == session.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        token_iat = datetime.fromtimestamp(iat_timestamp, tz=timezone.utc)
        if user.tokens_valid_from and token_iat < user.tokens_valid_from.replace(tzinfo=timezone.utc):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")

        now_utc = datetime.now(timezone.utc)
        access_jti = str(uuid.uuid4())
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token_data = {"sub": user.email, "iat": now_utc, "jti": access_jti, "type": "access"}
        access_token = create_access_token(access_token_data, expires_delta=access_token_expires)

        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
        
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid refresh token: {e}")
    finally:
        db.close()
@app.get("/users/me", response_model=User)
async def read_users_me(current_user: models.User = Depends(get_current_user_from_token)):
    return current_user

# --- Camera Endpoints ---
@app.get("/api/cameras", response_model=List[Camera])
async def read_user_cameras(current_user: models.User = Depends(get_current_user_from_token)):
    return current_user.cameras

@app.post("/api/cameras", response_model=Camera, status_code=status.HTTP_201_CREATED)
async def create_camera_for_user(
    camera: CameraCreate,
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        user_id = current_user.id
        max_order = db.query(func.max(models.Camera.display_order)).filter(models.Camera.owner_id == user_id).scalar()
        new_order = (max_order or 0) + 1
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', camera.name.lower().replace(" ", "_"))
        path_name = f"user_{user_id}_{safe_name}"
        existing = db.query(models.Camera).filter(models.Camera.path == path_name).first()
        if existing: 
             path_name = f"{path_name}_{str(uuid.uuid4())[:4]}"
        
        await configure_mediamtx_path(path_name, camera.rtsp_url)
        
        db_camera = models.Camera(
            name=camera.name, 
            path=path_name, 
            rtsp_url=camera.rtsp_url, 
            rtsp_substream_url=camera.rtsp_substream_url,
            owner_id=user_id, 
            display_order=new_order,
            motion_type="off",
            motion_sensitivity=50, # Default
            continuous_recording=False # Default
        )
        db.add(db_camera)
        db.commit()
        db.refresh(db_camera)
        return db_camera
    except Exception as e:
        db.rollback()
        log.error(f"--- Error creating camera: {e} ---")
        raise HTTPException(status_code=500, detail="Failed to create camera in mediamtx")
    finally: db.close()

@app.patch("/api/cameras/{camera_id}", response_model=Camera)
async def update_camera(
    camera_id: int, 
    camera_update: CameraUpdate, 
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
        if not db_camera: raise HTTPException(status_code=404, detail="Camera not found")
        
        update_data = camera_update.model_dump(exclude_unset=True)
        
        for key, value in update_data.items():
            setattr(db_camera, key, value)
        
        if 'rtsp_url' in update_data:
            await configure_mediamtx_path(db_camera.path, db_camera.rtsp_url)

        db.commit()
        db.refresh(db_camera)
        return db_camera
    except Exception as e:
        db.rollback()
        log.error(f"--- Error updating camera: {e} ---")
        raise HTTPException(status_code=500, detail="Failed to update camera")
    finally:
        db.close()

@app.delete("/api/cameras/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: int, 
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
        if db_camera is None: raise HTTPException(status_code=404, detail="Camera not found or user does not own it")
        
        mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{db_camera.path}"
        try:
            auth = ("admin", MEDIAMTX_ADMIN_PASS)
            async with httpx.AsyncClient() as client:
                response = await client.delete(mediamtx_url, auth=auth)
            if response.status_code != 404: response.raise_for_status()
        except Exception as e: 
            log.error(f"--- DELETING CAMERA: Failed to delete path {mediamtx_url}: {e} ---")
        
        db.delete(db_camera)
        db.commit()
        return
    finally: db.close()

# --- WIPE CAMERA RECORDINGS ---
@app.delete("/api/cameras/{camera_id}/recordings", status_code=status.HTTP_200_OK)
async def wipe_camera_recordings(
    camera_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    # Verify ownership
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    log.info(f"--- WIPE: Starting wipe for camera {camera.name} ({camera.id}) ---")

    # 1. Delete Events from Database
    try:
        num_events = db.query(models.Event).filter(models.Event.camera_id == camera_id).delete()
        db.commit()
        log.info(f"--- WIPE: Deleted {num_events} events from DB ---")
    except Exception as e:
        db.rollback()
        log.error(f"--- WIPE ERROR (DB): {e} ---")
        raise HTTPException(status_code=500, detail="Failed to clear database events")

    # 2. Delete Files
    try:
        # A. Delete Event clips in root /recordings (format: event_{id}_*)
        prefix = f"event_{camera_id}_"
        deleted_files = 0
        for f in os.listdir("/recordings"):
            if f.startswith(prefix) and (f.endswith(".mp4") or f.endswith(".jpg") or f.endswith(".log")):
                try:
                    os.remove(os.path.join("/recordings", f))
                    deleted_files += 1
                except Exception as e:
                    log.error(f"Failed to delete {f}: {e}")

        # B. Delete Continuous Folder (/recordings/continuous/{id})
        continuous_path = f"/recordings/continuous/{camera_id}"
        if os.path.exists(continuous_path):
             shutil.rmtree(continuous_path)
             os.makedirs(continuous_path) # Recreate empty folder to prevent errors
             
        log.info(f"--- WIPE: File cleanup complete. Deleted {deleted_files} event files. ---")
        return {"message": f"Successfully wiped all recordings for {camera.name}"}
        
    except Exception as e:
        log.error(f"--- WIPE ERROR (FS): {e} ---")
        raise HTTPException(status_code=500, detail="Failed to delete files from disk")


@app.post("/api/cameras/reorder", status_code=status.HTTP_200_OK)
async def reorder_cameras(
    req: ReorderRequest, 
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        user_cameras = {cam.id: cam for cam in current_user.cameras}
        if len(req.camera_ids) != len(user_cameras): raise HTTPException(status_code=400, detail="Camera list mismatch")
        for index, cam_id in enumerate(req.camera_ids):
            if cam_id not in user_cameras: raise HTTPException(status_code=400, detail=f"Invalid camera ID: {cam_id}")
            camera = user_cameras[cam_id]
            camera.display_order = index
        db.commit()
        return {"message": "Camera order updated successfully"}
    except Exception as e:
        db.rollback()
        log.error(f"--- Error reordering cameras: {e} ---")
        raise HTTPException(status_code=500, detail="Failed to reorder cameras")
    finally: db.close()
@app.post("/api/cameras/test-connection")
async def test_camera_connection(
    req: TestCameraRequest, 
    background_tasks: BackgroundTasks, 
    current_user: models.User = Depends(get_current_user_from_token)
):
    temp_path = f"test_{uuid.uuid4()}"
    log.info(f"--- Creating temp test path {temp_path} ---")
    auth = ("admin", MEDIAMTX_ADMIN_PASS)
    try:
        async with httpx.AsyncClient() as client:
            add_url = f"http://mediamtx:9997/v3/config/paths/add/{temp_path}"
            path_config = {"source": req.rtsp_url, "sourceOnDemand": True}
            response = await client.post(add_url, auth=auth, json=path_config)
        response.raise_for_status()
        background_tasks.add_task(delete_temp_path, temp_path)
        return {"path": temp_path}
    except httpx.HTTPStatusError as e:
        log.error(f"--- mediamtx error creating test path: {e.response.text} ---")
        raise HTTPException(status_code=e.response.status_code, detail=f"mediamtx error: {e.response.text}")
    except httpx.RequestError as e:
        log.error(f"--- Failed to contact mediamtx for test: {e} ---")
        raise HTTPException(status_code=500, detail=f"Failed to contact mediamtx: {e}")
async def delete_temp_path(path: str):
    await asyncio.sleep(60) 
    log.info(f"--- CLEANUP: Deleting temp test path {path} ---")
    auth = ("admin", MEDIAMTX_ADMIN_PASS)
    mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{path}"
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(mediamtx_url, auth=auth)
    except Exception as e:
        log.error(f"--- Failed to delete temp path {path}: {e} ---")

# --- Event / Webhook Endpoints ---
@app.post("/api/webhook/motion/{camera_path}")
async def webhook_motion_legacy(
    camera_path: str,
    db: Session = Depends(get_db)
):
    log.info(f"--- LEGACY motion webhook triggered for path {camera_path} ---")
    
    camera = db.query(models.Camera).filter(models.Camera.path == camera_path).first()
    if not camera:
        log.warning(f"--- Webhook invalid: No camera found for path {camera_path} ---")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
        
    if camera.motion_type != "webhook":
        log.warning(f"--- Webhook ignored: Camera {camera_path} not set to 'webhook' mode ---")
        return {"message": "Webhook ignored. Camera not in webhook mode."}

    now = datetime.now(timezone.utc)
    
    video_db_path = f"recordings/webhook-event-{now.strftime('%Y%m%d-%H%M%S')}.log"
    abs_video_path = f"/{video_db_path}"
    
    try:
        with open(abs_video_path, "w") as f:
            f.write(f"Legacy webhook event for {camera_path} at {now.isoformat()}")
    except Exception as e:
        log.error(f"--- Failed to create placeholder file {abs_video_path}: {e} ---")
    
    db_event = models.Event(
        start_time=now,
        end_time=now, 
        reason="motion (webhook)",
        video_path=video_db_path, 
        camera_id=camera.id,
        user_id=camera.owner_id
    )
    db.add(db_event)
    db.commit()
    
    log.info(f"--- Created Event {db_event.id} for camera {camera.name} ---")
    return {"message": "Event logged"}

# --- Timezone-Aware Event Endpoints ---
@app.get("/api/events", response_model=List[Event])
async def get_events(
    camera_id: Optional[int] = None, 
    start_ts: Optional[datetime] = None, 
    end_ts: Optional[datetime] = None,   
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    query = (
        db.query(models.Event)
        .filter(models.Event.user_id == current_user.id)
    )
    
    if camera_id is not None:
        query = query.filter(models.Event.camera_id == camera_id)
        
    if start_ts:
        query = query.filter(models.Event.start_time >= start_ts)
    if end_ts:
        query = query.filter(models.Event.start_time <= end_ts)
            
    events = (
        query.options(joinedload(models.Event.camera))
        .order_by(models.Event.start_time.desc())
        .limit(100) 
        .all()
    )
    return events

@app.get("/api/events/summary", response_model=List[EventSummary])
async def get_event_summary(
    start_ts: datetime, 
    end_ts: datetime,
    camera_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    query = (
        db.query(models.Event)
        .filter(models.Event.user_id == current_user.id)
        .filter(models.Event.start_time >= start_ts)
        .filter(models.Event.start_time <= end_ts)
    )
    
    if camera_id is not None:
        query = query.filter(models.Event.camera_id == camera_id)
        
    events = (
        query.order_by(models.Event.start_time.asc())
        .all()
    )
    return events

# --- NEW: BATCH DELETE ---
@app.post("/api/events/batch-delete", status_code=status.HTTP_200_OK)
async def batch_delete_events(
    req: BatchDeleteRequest,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    if not req.event_ids:
        return {"message": "No events to delete"}

    # 1. Fetch events to get paths
    events = db.query(models.Event).filter(
        models.Event.id.in_(req.event_ids),
        models.Event.user_id == current_user.id
    ).all()

    deleted_count = 0
    
    for event in events:
        video_path = f"/{event.video_path}"
        thumb_path = f"/{event.thumbnail_path}" if event.thumbnail_path else None
        
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
            if thumb_path and os.path.exists(thumb_path):
                os.remove(thumb_path)
            deleted_count += 1
        except Exception as e:
            log.error(f"Failed to delete file for event {event.id}: {e}")
            
    # 2. Delete from DB
    try:
        db.query(models.Event).filter(
            models.Event.id.in_(req.event_ids),
            models.Event.user_id == current_user.id
        ).delete(synchronize_session=False)
        db.commit()
        
        return {"message": f"Successfully deleted {deleted_count} events."}
    except Exception as e:
        db.rollback()
        log.error(f"Batch delete DB error: {e}")
        raise HTTPException(status_code=500, detail="Database error during batch delete")


@app.delete("/api/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    event = db.query(models.Event).filter(
        models.Event.id == event_id,
        models.Event.user_id == current_user.id
    ).first()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    video_path = event.video_path
    thumb_path = event.thumbnail_path
    
    try:
        db.delete(event)
        db.commit()
        
        abs_video_path = f"/{video_path}" 
        if os.path.exists(abs_video_path):
            os.remove(abs_video_path)
            log.info(f"--- Deleted video file: {abs_video_path} ---")
        else:
            log.warning(f"--- Video file not found: {abs_video_path} ---") 
            
        if thumb_path:
            abs_thumb_path = f"/{thumb_path}"
            if os.path.exists(abs_thumb_path):
                os.remove(abs_thumb_path)
                log.info(f"--- Deleted thumbnail file: {abs_thumb_path} ---")
            else:
                log.warning(f"--- Thumbnail file not found: {abs_thumb_path} ---")
        return
    
    except Exception as e:
        db.rollback()
        log.error(f"--- Error deleting event {event_id}: {e} ---")
        raise HTTPException(status_code=500, detail="Failed to delete event")

# --- Endpoint to list continuous recordings ---
@app.get("/api/cameras/{camera_id}/recordings")
async def get_continuous_recordings(
    camera_id: int,
    date_str: str, 
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    recordings_dir = f"/recordings/continuous/{camera_id}"
    
    if not os.path.exists(recordings_dir):
        return []

    target_date_prefix = date_str.replace("-", "") 
    
    found_files = []
    try:
        for filename in os.listdir(recordings_dir):
            if filename.startswith(target_date_prefix) and filename.endswith(".mp4"):
                url = f"continuous/{camera_id}/{filename}"
                found_files.append({
                    "filename": filename,
                    "url": url,
                    "time": filename.split("-")[1].split(".")[0] 
                })
                
        found_files.sort(key=lambda x: x["filename"])
        
    except Exception as e:
        log.error(f"Error listing recordings: {e}")
        raise HTTPException(status_code=500, detail="Failed to list recordings")

    return found_files

# --- NEW: Get Timeline Ranges Endpoint ---
@app.get("/api/cameras/{camera_id}/recordings/timeline", response_model=List[RecordingSegment])
async def get_continuous_timeline(
    camera_id: int,
    date_str: str, 
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """
    Returns start/end times of continuous recordings for a specific date
    to be visualized on the timeline.
    """
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    recordings_dir = f"/recordings/continuous/{camera_id}"
    if not os.path.exists(recordings_dir):
        return []

    target_date_prefix = date_str.replace("-", "") 
    segments = []
    
    try:
        # 1. Scan files
        files = [f for f in os.listdir(recordings_dir) 
                 if f.startswith(target_date_prefix) and f.endswith(".mp4")]
        
        for filename in files:
            # 2. Parse Start Time from filename: YYYYMMDD-HHMMSS.mp4
            time_part = filename.split("-")[1].split(".")[0] # HHMMSS
            date_part = filename.split("-")[0] # YYYYMMDD
            
            # Create datetime object (Naive first, then assume it's in local time logic or just send ISO)
            # We will construct an ISO string.
            # Format: YYYY-MM-DDTHH:MM:SS
            iso_start = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:8]}T{time_part[:2]}:{time_part[2:4]}:{time_part[4:6]}"
            
            # Calculate End Time (Start + 15 mins)
            # We use datetime parsing to add the delta
            dt_start = datetime.strptime(iso_start, "%Y-%m-%dT%H:%M:%S")
            dt_end = dt_start + timedelta(minutes=15) # 900 seconds
            
            segments.append({
                "start_time": dt_start.isoformat(),
                "end_time": dt_end.isoformat(),
                "filename": filename
            })
            
    except Exception as e:
        log.error(f"Error calculating timeline: {e}")
        return []
        
    return segments

# --- NEW: Delete Continuous Recording Endpoint ---
@app.delete("/api/cameras/{camera_id}/recordings/{filename}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_continuous_recording(
    camera_id: int,
    filename: str,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    # 1. Verify ownership
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # 2. Sanitize filename (prevent traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # 3. Construct path and delete
    file_path = f"/recordings/continuous/{camera_id}/{filename}"
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            log.info(f"Deleted continuous recording: {file_path}")
        except Exception as e:
            log.error(f"Failed to delete file {file_path}: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete file")
    else:
        raise HTTPException(status_code=404, detail="File not found")
    return

# --- WIPE ALL RECORDINGS ENDPOINT ---
@app.delete("/api/system/recordings", status_code=status.HTTP_200_OK)
async def wipe_all_recordings(
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    # 1. Clear Database
    try:
        num_events = db.query(models.Event).delete()
        db.commit()
        log.info(f"--- WIPE: Deleted {num_events} events from DB ---")
    except Exception as e:
        db.rollback()
        log.error(f"--- WIPE ERROR (DB): {e} ---")
        raise HTTPException(status_code=500, detail="Failed to clear database")

    # 2. Clear Files
    try:
        # Delete Event clips/thumbs in root
        for f in os.listdir("/recordings"):
            path = os.path.join("/recordings", f)
            if os.path.isfile(path) and (f.endswith(".mp4") or f.endswith(".jpg") or f.endswith(".log")):
                os.remove(path)
        
        # Delete Continuous recordings
        continuous_path = "/recordings/continuous"
        if os.path.exists(continuous_path):
             shutil.rmtree(continuous_path)
             os.makedirs(continuous_path) # Recreate empty folder
             
        log.info("--- WIPE: File cleanup complete ---")
        return {"message": f"Wiped {num_events} events and all recording files."}
        
    except Exception as e:
        log.error(f"--- WIPE ERROR (FS): {e} ---")
        raise HTTPException(status_code=500, detail="Failed to delete files")

# --- System Settings Endpoints ---
@app.get("/api/system/settings", response_model=SystemSettingsSchema)
async def get_system_settings(
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    settings = db.query(models.SystemSettings).first()
    if not settings:
        # Create default settings if they don't exist
        settings = models.SystemSettings(retention_days=30)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@app.put("/api/system/settings", response_model=SystemSettingsSchema)
async def update_system_settings(
    new_settings: SystemSettingsSchema,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    settings = db.query(models.SystemSettings).first()
    if not settings:
        settings = models.SystemSettings(retention_days=new_settings.retention_days)
        db.add(settings)
    else:
        settings.retention_days = new_settings.retention_days
    
    db.commit()
    db.refresh(settings)
    return settings

# --- System Health Endpoint ---
@app.get("/api/system/health", response_model=SystemHealth)
async def get_system_health(
    current_user: models.User = Depends(get_current_user_from_token)
):
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = shutil.disk_usage("/recordings")
        uptime_seconds = time.time() - psutil.boot_time()
        
        return {
            "cpu_percent": cpu_percent,
            "memory_total": mem.total,
            "memory_used": mem.used,
            "memory_percent": mem.percent,
            "disk_total": disk.total,
            "disk_free": disk.free,
            "disk_used": disk.used,
            "disk_percent": (disk.used / disk.total) * 100,
            "uptime_seconds": uptime_seconds
        }
    except Exception as e:
        log.error(f"Failed to get system stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch system health")

# --- RESTART ENDPOINT ---
@app.post("/api/system/restart", status_code=status.HTTP_200_OK)
async def restart_services(
    current_user: models.User = Depends(get_current_user_from_token)
):
    """
    Restarts the application containers (Motion, MediaMTX, and Backend).
    Uses the Docker socket mounted at /var/run/docker.sock.
    """
    try:
        client = docker.from_env()
        
        my_hostname = os.environ.get("HOSTNAME", "")
        containers = client.containers.list()
        
        restarted_count = 0
        
        # Find the motion-detector and mediamtx containers
        for c in containers:
            name = c.name.lower()
            # Skip myself for now
            if c.id.startswith(my_hostname) or my_hostname.startswith(c.id):
                continue
            
            # Look for key services
            if "motion-detector" in name or "mediamtx" in name:
                log.info(f"Restarting container: {c.name}")
                c.restart()
                restarted_count += 1
                
        # Finally, kill myself (Docker restart policy will bring me back)
        # We launch this as a background task so the HTTP response can finish
        asyncio.create_task(suicide_task())
        
        return {"message": f"Restart initiated. {restarted_count} sibling services restarted."}

    except Exception as e:
        log.error(f"Failed to restart services: {e}")
        raise HTTPException(status_code=500, detail=f"Restart failed: {str(e)}")

async def suicide_task():
    """Wait a moment for response to send, then exit."""
    await asyncio.sleep(2)
    log.info("--- RESTARTING BACKEND (Self-Termination) ---")
    os._exit(0) # Hard exit, Docker will restart us


# --- NEW: Download Endpoint ---
@app.get("/api/download")
async def download_recording(
    path: str,
    current_user: models.User = Depends(get_current_user_from_token)
):
    """
    Downloads a recording file.
    Expects 'path' to be relative to the /recordings directory.
    """
    if ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    clean_path = path
    if clean_path.startswith("recordings/"):
        clean_path = clean_path.replace("recordings/", "", 1)
        
    full_path = os.path.join("/recordings", clean_path)
    
    if not os.path.exists(full_path):
         raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=full_path, 
        filename=os.path.basename(full_path), 
        media_type='application/octet-stream'
    )

# --- User/Session Endpoints ---
@app.put("/api/users/me", response_model=User)
async def update_user_me(
    user_update: UserUpdate, 
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        user = db.merge(current_user)
        user.display_name = user_update.display_name
        db.commit()
        db.refresh(user)
        return user
    finally: db.close()
@app.post("/api/users/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    passwords: PasswordChange, 
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        user = db.merge(current_user)
        if not verify_password(passwords.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")
        new_hashed_password = get_password_hash(passwords.new_password)
        user.hashed_password = new_hashed_password
        user.tokens_valid_from = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Password updated successfully"}
    finally: db.close()
@app.delete("/api/users/delete-account", status_code=status.HTTP_200_OK)
async def delete_account(
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        user = db.merge(current_user)
        cameras = get_cameras_by_user(db, user_id=user.id)
        auth = ("admin", MEDIAMTX_ADMIN_PASS)
        async with httpx.AsyncClient() as client:
            tasks = []
            for camera in cameras:
                mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{camera.path}"
                log.info(f"--- Queuing delete for camera: {camera.path} ---")
                tasks.append(client.delete(mediamtx_url, auth=auth))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
        
        db.delete(user) 
        db.commit()
        return {"message": "Account and all associated cameras deleted successfully"}
    finally: db.close()
@app.post("/api/users/logout-all", status_code=status.HTTP_200_OK)
async def logout_all_sessions(
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        user = db.merge(current_user)
        user.tokens_valid_from = datetime.now(timezone.utc)
        db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete()
        db.commit()
        return {"message": "All other sessions have been logged out."}
    finally:
        db.close()
@app.get("/api/webrtc-creds")
async def get_webrtc_credentials(
    current_user: models.User = Depends(get_current_user_from_token)
):
    return {"user": "viewer", "pass": MEDIAMTX_VIEWER_PASS}
@app.get("/api/sessions", response_model=List[UserSession])
async def get_sessions(
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        sessions = db.query(models.UserSession).filter(models.UserSession.user_id == current_user.id).all()
        return sessions
    finally:
        db.close()
@app.delete("/api/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def logout_session(
    session_id: int,
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        session = db.query(models.UserSession).filter(
            models.UserSession.id == session_id,
            models.UserSession.user_id == current_user.id
        ).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        db.delete(session)
        db.commit()
        return
    finally:
        db.close()