from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request # <-- 1. IMPORT Request
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
from datetime import datetime, timezone

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

# ====================================================================
#                 CORS Middleware & Pydantic Schemas
# ====================================================================
# ... (Unchanged) ...
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas (Updated) ---
class CameraBase(BaseModel): name: str
class CameraCreate(BaseModel): name: str; rtsp_url: str
class Camera(CameraBase):
    id: int; owner_id: int; path: str; rtsp_url: str; display_order: int
    class Config: from_attributes = True 
class CameraUpdate(BaseModel):
    name: str
    rtsp_url: str
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
        
# --- 2. NEW: Session Schema ---
class UserSession(BaseModel):
    id: int
    jti: str
    user_agent: Optional[str]
    ip_address: Optional[str]
    created_at: datetime
    class Config: from_attributes = True
        
class User(UserBase):
    id: int; cameras: List[Camera] = []; gravatar_hash: Optional[str] = None
    # We don't include sessions here by default to keep the /me payload light
    class Config: from_attributes = True 
class UserUpdate(BaseModel):
    display_name: Optional[str] = None
class Token(BaseModel): access_token: str; token_type: str
class TokenData(BaseModel): email: str | None = None
class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)
    @validator('new_password')
    def password_byte_length(cls, v):
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long (max 72 bytes)')
        return v
# ====================================================================
#                     Startup Event
# ====================================================================
# ... (Unchanged) ...
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
            mediamtx_url = f"http://mediamtx:9997/v3/config/paths/patch/{camera.path}"
            try:
                response = await client.patch(mediamtx_url, auth=auth, json={"source": camera.rtsp_url, "sourceOnDemand": True})
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    log.warning(f"--- STARTUP: Path {camera.path} not found, creating it... ---")
                    add_url = f"http://mediamtx:9997/v3/config/paths/add/{camera.path}"
                    try:
                        add_response = await client.post(add_url, auth=auth, json={"source": camera.rtsp_url, "sourceOnDemand": True})
                        add_response.raise_for_status()
                    except httpx.HTTPStatusError as add_e: log.error(f"--- STARTUP: Failed to create path {camera.path}: {add_e} ---")
                else: log.warning(f"--- STARTUP: Failed to update camera {camera.path}: {e} ---")
            except httpx.RequestError as e: log.error(f"--- STARTUP: Could not contact mediamtx: {e} ---")
    db.close()
    log.info("--- STARTUP: mediamtx re-population complete. ---")
# ====================================================================
#                 Security & Auth
# ====================================================================
# ... (Unchanged) ...
SECRET_KEY = "oVlxx1WjIyVNfsr2WWROPcsVyBhW5L7u" 
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)
def verify_password(plain_password, hashed_password): return pwd_context.verify(plain_password, hashed_password)
def get_password_hash(password): return pwd_context.hash(password)
def create_access_token(data: dict):
    to_encode = data.copy()
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
# ====================================================================
#                 DB Functions
# ====================================================================
# ... (Unchanged) ...
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
#                 Auth Dependency (UPDATED)
# ====================================================================
async def get_token_data(token: str | None = Depends(oauth2_scheme)) -> TokenData:
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
        jti: str = payload.get("jti") # <-- 3. GET JWT ID
        
        if email is None or iat_timestamp is None or jti is None:
            raise credentials_exception
            
        token_iat = datetime.fromtimestamp(iat_timestamp, tz=timezone.utc)
        
        user = get_user_by_email(db, email=email)
        if user is None:
            raise credentials_exception
        
        # 4. CHECK 1: Check against the "kill-switch" date
        if user.tokens_valid_from and token_iat < user.tokens_valid_from.replace(tzinfo=timezone.utc):
            raise revoked_exception
        
        # 5. CHECK 2: Check if this specific token is still in the DB
        session = db.query(models.UserSession).filter(models.UserSession.jti == jti).first()
        if not session:
            raise revoked_exception
            
        return TokenData(email=email)
    except JWTError:
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
    request: Request, # <-- 6. ADD Request
    form_data: OAuth2PasswordRequestForm = Depends(), 
):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=form_data.username)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"},)
        
        # 7. Create a unique token ID
        jti = str(uuid.uuid4())
        
        access_token_data = {
            "sub": user.email,
            "iat": datetime.now(timezone.utc),
            "jti": jti, # <-- 8. Add jti to token
        }
        access_token = create_access_token(access_token_data)
        
        # 9. Log the new session in the database
        new_session = models.UserSession(
            jti=jti,
            user_id=user.id,
            user_agent=request.headers.get("User-Agent"),
            ip_address=request.client.host
        )
        db.add(new_session)
        db.commit()
        
        return {"access_token": access_token, "token_type": "bearer"}
    finally: db.close()

@app.get("/users/me", response_model=User)
async def read_users_me(token_data: TokenData = Depends(get_token_data)):
    # ... (Unchanged) ...
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if user is None: raise HTTPException(status_code=404, detail="User not found")
        return user
    finally: db.close()

# --- Camera Endpoints ---
# ... (Unchanged: GET, POST, PUT, DELETE /api/cameras) ...
@app.get("/api/cameras", response_model=List[Camera])
async def read_user_cameras(token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if user is None: raise HTTPException(status_code=404, detail="User not found")
        cameras = get_cameras_by_user(db, user_id=user.id)
        return cameras
    finally: db.close()

@app.post("/api/cameras", response_model=Camera, status_code=status.HTTP_201_CREATED)
async def create_camera_for_user(camera: CameraCreate, token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if user is None: raise HTTPException(status_code=404, detail="User not found")
        max_order = db.query(func.max(models.Camera.display_order)).filter(models.Camera.owner_id == user.id).scalar()
        new_order = (max_order or 0) + 1
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', camera.name.lower().replace(" ", "_"))
        path_name = f"user_{user.id}_{safe_name}"
        existing = db.query(models.Camera).filter(models.Camera.path == path_name, models.Camera.owner_id == user.id).first()
        if existing: raise HTTPException(status_code=400, detail="A camera with this name already exists")
        mediamtx_url = f"http://mediamtx:9997/v3/config/paths/add/{path_name}"
        try:
            auth = ("admin", "mysecretpassword")
            async with httpx.AsyncClient() as client:
                response = await client.post(mediamtx_url, auth=auth, json={"source": camera.rtsp_url, "sourceOnDemand": True})
            response.raise_for_status()
        except httpx.RequestError as e: raise HTTPException(status_code=500, detail=f"Failed to contact mediamtx: {e}")
        except httpx.HTTPStatusError as e: raise HTTPException(status_code=e.response.status_code, detail=f"mediamtx error: {e.response.text}")
        db_camera = models.Camera(name=camera.name, path=path_name, rtsp_url=camera.rtsp_url, owner_id=user.id, display_order=new_order)
        db.add(db_camera)
        db.commit()
        db.refresh(db_camera)
        return db_camera
    finally: db.close()

@app.put("/api/cameras/{camera_id}", response_model=Camera)
async def update_camera(camera_id: int, camera_update: CameraUpdate, token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user: raise HTTPException(status_code=404, detail="User not found")
        db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == user.id).first()
        if not db_camera: raise HTTPException(status_code=404, detail="Camera not found")
        old_path = db_camera.path
        new_name_changed = db_camera.name != camera_update.name
        db_camera.name = camera_update.name
        db_camera.rtsp_url = camera_update.rtsp_url
        auth = ("admin", "mysecretpassword")
        async with httpx.AsyncClient() as client:
            if new_name_changed:
                safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', camera_update.name.lower().replace(" ", "_"))
                new_path = f"user_{user.id}_{safe_name}"
                db_camera.path = new_path
                log.info(f"--- UPDATING: Deleting old path {old_path} ---")
                old_mediamtx_url = f"http://mediamtx:9997/v3/config/paths/delete/{old_path}"
                try:
                    await client.delete(old_mediamtx_url, auth=auth)
                except httpx.HTTPStatusError as e:
                     if e.response.status_code != 404: raise
                log.info(f"--- UPDATING: Adding new path {new_path} ---")
                new_mediamtx_url = f"http://mediamtx:9997/v3/config/paths/add/{new_path}"
                response = await client.post(new_mediamtx_url, auth=auth, json={"source": camera_update.rtsp_url, "sourceOnDemand": True})
                response.raise_for_status()
            else:
                log.info(f"--- UPDATING: Patching existing path {old_path} ---")
                mediamtx_url = f"http://mediamtx:9997/v3/config/paths/patch/{old_path}"
                response = await client.patch(mediamtx_url, auth=auth, json={"source": camera_update.rtsp_url, "sourceOnDemand": True})
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

@app.delete("/api/cameras/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(camera_id: int, token_data: TokenData = Depends(get_token_data)):
    # ... (Unchanged) ...
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if user is None: raise HTTPException(status_code=404, detail="User not found")
        db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id, models.Camera.owner_id == user.id).first()
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
async def reorder_cameras(req: ReorderRequest, token_data: TokenData = Depends(get_token_data)):
    # ... (Unchanged) ...
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user: raise HTTPException(status_code=404, detail="User not found")
        user_cameras = {cam.id: cam for cam in user.cameras}
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
async def test_camera_connection(req: TestCameraRequest, background_tasks: BackgroundTasks, token_data: TokenData = Depends(get_token_data)):
    # ... (Unchanged) ...
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

# ====================================================================
#                 Settings Page Endpoints
# ====================================================================
# ... (Unchanged: update_user_me, change_password, delete_account) ...
@app.put("/api/users/me", response_model=User)
async def update_user_me(user_update: UserUpdate, token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user: raise HTTPException(status_code=404, detail="User not found")
        user.display_name = user_update.display_name
        db.commit()
        db.refresh(user)
        return user
    finally: db.close()

@app.post("/api/users/change-password", status_code=status.HTTP_200_OK)
async def change_password(passwords: PasswordChange, token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user: raise HTTPException(status_code=404, detail="User not found")
        if not verify_password(passwords.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")
        new_hashed_password = get_password_hash(passwords.new_password)
        user.hashed_password = new_hashed_password
        user.tokens_valid_from = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Password updated successfully"}
    finally: db.close()

@app.delete("/api/users/delete-account", status_code=status.HTTP_200_OK)
async def delete_account(token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user: raise HTTPException(status_code=404, detail="User not found")
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
        db.delete(user)
        db.commit()
        return {"message": "Account and all associated cameras deleted successfully"}
    finally: db.close()

@app.post("/api/users/logout-all", status_code=status.HTTP_200_OK)
async def logout_all_sessions(token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # This is the "kill switch".
        user.tokens_valid_from = datetime.now(timezone.utc)
        
        # --- 10. NEW: Also clear all sessions from the DB ---
        db.query(models.UserSession).filter(models.UserSession.user_id == user.id).delete()
        
        db.commit()
        
        return {"message": "All other sessions have been logged out."}
    finally:
        db.close()

# --- 11. NEW: Session Management Endpoints ---
@app.get("/api/sessions", response_model=List[UserSession])
async def get_sessions(token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        sessions = db.query(models.UserSession).filter(models.UserSession.user_id == user.id).all()
        return sessions
    finally:
        db.close()

@app.delete("/api/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def logout_session(
    session_id: int,
    token_data: TokenData = Depends(get_token_data)
):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        session = db.query(models.UserSession).filter(
            models.UserSession.id == session_id,
            models.UserSession.user_id == user.id
        ).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        db.delete(session)
        db.commit()
        return
    finally:
        db.close()