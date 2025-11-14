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
from datetime import datetime, timezone, timedelta
from fastapi.staticfiles import StaticFiles
import os

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

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"], # Allow PATCH
    allow_headers=["Authorization", "Content-Type"],
)

# --- Schemas ---
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
    class Config: from_attributes = True 

# --- FIX: All fields are now Optional for partial updates ---
class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    rtsp_substream_url: Optional[str] = None
    motion_type: Optional[str] = None
    motion_roi: Optional[str] = None

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
    camera_id: int
    user_id: int
    camera: CameraBase
    class Config: from_attributes = True
        
# ====================================================================
#                     Startup Event
# ====================================================================
@app.on_event("startup")
async def on_startup():
    log.info("--- STARTUP: Re-populating mediamtx ---")
    db = SessionLocal()
    all_cameras = db.query(models.Camera).all()
    if not all_cameras:
        log.info("--- STARTUP: No cameras in database. Skipping. ---")
        db.close()
        return
    auth = ("admin", "mysecretpassword")
    async with httpx.AsyncClient() as client:
        for camera in all_cameras:
            if not camera.rtsp_url:
                log.warning(f"--- STARTUP: Skipping camera {camera.path} (no RTSP URL saved) ---")
                continue
            log.info(f"--- STARTUP: Updating camera {camera.path} ---")
            
            path_config = {
                "source": camera.rtsp_url,
                "sourceOnDemand": True,
            }
            
            mediamtx_url = f"http://mediamtx:9997/v3/config/paths/patch/{camera.path}"
            try:
                response = await client.patch(mediamtx_url, auth=auth, json=path_config)
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    log.warning(f"--- STARTUP: Path {camera.path} not found, creating it... ---")
                    add_url = f"http://mediamtx:9997/v3/config/paths/add/{camera.path}"
                    try:
                        add_response = await client.post(add_url, auth=auth, json=path_config)
                        add_response.raise_for_status()
                    except httpx.HTTPStatusError as add_e: log.error(f"--- STARTUP: Failed to create path {camera.path}: {add_e} ---")
                else: log.warning(f"--- STARTUP: Failed to update camera {camera.path}: {e} ---")
            except httpx.RequestError as e: log.error(f"--- STARTUP: Could not contact mediamtx: {e} ---")
    db.close()
    log.info("--- STARTUP: mediamtx re-population complete. ---")

# ====================================================================
#                 Security & Auth
# ====================================================================
# ... (unchanged) ...
def get_secret_key():
    try:
        with open("/run/secrets/jwt_secret_key", "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        print("!!! ERROR: 'jwt_secret_key' file not found. Using fallback for local dev.")
        return "oVlxx1WjIyVNfsr2WWROPcsVyBhW5L7u"
SECRET_KEY = get_secret_key()
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
#                 DB Functions
# ====================================================================
# ... (unchanged) ...
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
# ... (unchanged) ...
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
# ... ( / , /register, /token, /token/refresh, /users/me are unchanged) ...
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

        path_config = {
            "source": camera.rtsp_url,
            "sourceOnDemand": True,
        }
        
        mediamtx_url = f"http://mediamtx:9997/v3/config/paths/add/{path_name}"
        try:
            auth = ("admin", "mysecretpassword")
            async with httpx.AsyncClient() as client:
                response = await client.post(mediamtx_url, auth=auth, json=path_config)
            response.raise_for_status()
        except httpx.RequestError as e: raise HTTPException(status_code=500, detail=f"Failed to contact mediamtx: {e}")
        except httpx.HTTPStatusError as e: raise HTTPException(status_code=e.response.status_code, detail=f"mediamtx error: {e.response.text}")
        
        db_camera = models.Camera(
            name=camera.name, 
            path=path_name, 
            rtsp_url=camera.rtsp_url, 
            rtsp_substream_url=camera.rtsp_substream_url,
            owner_id=user_id, 
            display_order=new_order,
            motion_type="off"
        )
        db.add(db_camera)
        db.commit()
        db.refresh(db_camera)
        return db_camera
    finally: db.close()

# --- FIX: Changed to PATCH and updated logic ---
@app.patch("/api/cameras/{camera_id}", response_model=Camera)
async def update_camera(
    camera_id: int, 
    camera_update: CameraUpdate, # <-- Updated schema with Optional fields
    current_user: models.User = Depends(get_current_user_from_token)
):
    db = SessionLocal()
    try:
        db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == current_user.id).first()
        if not db_camera: raise HTTPException(status_code=404, detail="Camera not found")
        
        old_path = db_camera.path
        new_name_changed = False
        
        # --- FIX: Only update fields that were sent ---
        update_data = camera_update.model_dump(exclude_unset=True)
        
        for key, value in update_data.items():
            setattr(db_camera, key, value)
            if key == "name" and value != old_path:
                new_name_changed = True
        
        # We only need to talk to mediamtx if the name or URL changed
        if camera_update.name or camera_update.rtsp_url:
            auth = ("admin", "mysecretpassword")
            path_config = {
                "source": db_camera.rtsp_url, # Use the (potentially updated) URL
                "sourceOnDemand": True,
            }
            
            async with httpx.AsyncClient() as client:
                if new_name_changed:
                    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', db_camera.name.lower().replace(" ", "_"))
                    new_path = f"user_{current_user.id}_{safe_name}"
                    existing = db.query(models.Camera).filter(models.Camera.path == new_path).first()
                    if existing:
                        new_path = f"{new_path}_{str(uuid.uuid4())[:4]}"
                    db_camera.path = new_path
                    
                    log.info(f"--- UPDATING: Deleting old path {old_path} ---")
                    old_mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{old_path}"
                    try:
                        await client.delete(old_mediamtx_url, auth=auth)
                    except httpx.HTTPStatusError as e:
                         if e.response.status_code != 404: raise
                    
                    log.info(f"--- UPDATING: Adding new path {new_path} ---")
                    new_mediamtx_url = f"http://mediamtx:9997/v3/config/paths/add/{new_path}"
                    response = await client.post(new_mediamtx_url, auth=auth, json=path_config)
                    response.raise_for_status()
                else:
                    log.info(f"--- UPDATING: Patching existing path {old_path} ---")
                    mediamtx_url = f"http://mediamtx:9997/v3/config/paths/patch/{old_path}"
                    response = await client.patch(mediamtx_url, auth=auth, json=path_config)
                    response.raise_for_status()

        db.commit()
        db.refresh(db_camera)
        return db_camera
    except httpx.RequestError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to contact mediamtx: {e}")
    except httpx.HTTPStatusError as e:
        db.rollback()
        raise HTTPException(status_code=e.response.status_code, detail=f"mediamtx error: {e.response.text}")
    except Exception as e:
        db.rollback()
        log.error(f"--- Error updating camera: {e} ---")
        raise HTTPException(status_code=500, detail="Failed to update camera")
    finally:
        db.close()

# ... (rest of endpoints are unchanged) ...
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
            auth = ("admin", "mysecretpassword")
            async with httpx.AsyncClient() as client:
                response = await client.delete(mediamtx_url, auth=auth)
                log.info(f"--- DELETING CAMERA: Response status code {response.status_code} ---")
            if response.status_code != 404: response.raise_for_status()
        except httpx.RequestError as e: raise HTTPException(status_code=500, detail=f"Failed to contact mediamtx: {e}")
        except httpx.HTTPStatusError as e: raise HTTPException(status_code=e.response.status_code, detail=f"mediamtx error: {e.response.text}")
        except Exception as e: log.error(f"--- DELETING CAMERA: Failed to delete path {mediamtx_url}: {e} ---")
        
        db.delete(db_camera)
        db.commit()
        return
    finally: db.close()
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
    mediamtx_url = f"http://mediamtx:9997/v3/config/paths/add/{temp_path}"
    auth = ("admin", "mysecretpassword")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(mediamtx_url, auth=auth, json={"source": req.rtsp_url, "sourceOnDemand": True})
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
    auth = ("admin", "mysecretpassword")
    mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{path}"
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(mediamtx_url, auth=auth)
    except Exception as e:
        log.error(f"--- Failed to delete temp path {path}: {e} ---")
@app.post("/api/webhook/motion/{camera_path}")
async def webhook_motion(
    camera_path: str,
    db: Session = Depends(get_db)
):
    log.info(f"--- Motion webhook triggered for path {camera_path} ---")
    
    camera = db.query(models.Camera).filter(models.Camera.path == camera_path).first()
    if not camera:
        log.warning(f"--- Webhook invalid: No camera found for path {camera_path} ---")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
        
    if camera.motion_type != "webhook":
        log.warning(f"--- Webhook ignored: Camera {camera_path} not set to 'webhook' mode ---")
        return {"message": "Webhook ignored. Camera not in webhook mode."}

    now = datetime.now(timezone.utc)
    video_db_path = f"webhook-event-{now.strftime('%Y%m%d-%H%M%S')}.mp4"
    
    db_event = models.Event(
        start_time=now,
        reason="motion (webhook)",
        video_path=video_db_path,
        camera_id=camera.id,
        user_id=camera.owner_id
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    log.info(f"--- Created Event {db_event.id} for camera {camera.name} ---")
    return {"message": "Event logged"}
@app.get("/api/events", response_model=List[Event])
async def get_events(
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    events = (
        db.query(models.Event)
        .filter(models.Event.user_id == current_user.id)
        .options(joinedload(models.Event.camera))
        .order_by(models.Event.start_time.desc())
        .limit(100)
        .all()
    )
    return events
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
        auth = ("admin", "mysecretpassword")
        async with httpx.AsyncClient() as client:
            tasks = []
            for camera in cameras:
                mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{camera.path}"
                log.info(f"--- Queuing delete for camera: {camera.path} ---")
                tasks.append(client.delete(mediamtx_url, auth=auth))
                db.delete(camera)
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
        
        db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete()
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
    return {"user": "viewer", "pass": "secret"}
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