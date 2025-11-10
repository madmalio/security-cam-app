from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from typing import List
import re
import httpx
import logging

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
#                     Startup Event
# ====================================================================
# We are back to sourceOnDemand: True for low CPU
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
                response = await client.patch(
                    mediamtx_url,
                    auth=auth,
                    json={
                        "source": camera.rtsp_url, 
                        "sourceOnDemand": True
                    }
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    log.warning(f"--- STARTUP: Path {camera.path} not found, creating it... ---")
                    add_url = f"http://mediamtx:9997/v3/config/paths/add/{camera.path}"
                    try:
                        add_response = await client.post(
                            add_url,
                            auth=auth,
                            json={
                                "source": camera.rtsp_url,
                                "sourceOnDemand": True
                            }
                        )
                        add_response.raise_for_status()
                    except httpx.HTTPStatusError as add_e:
                        log.error(f"--- STARTUP: Failed to create path {camera.path}: {add_e} ---")
                else:
                    log.warning(f"--- STARTUP: Failed to update camera {camera.path}: {e} ---")
            except httpx.RequestError as e:
                log.error(f"--- STARTUP: Could not contact mediamtx: {e} ---")

    db.close()
    log.info("--- STARTUP: mediamtx re-population complete. ---")


# ====================================================================
#                 CORS Middleware & Pydantic Schemas
# ====================================================================
# ... (Unchanged) ...
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CameraBase(BaseModel): name: str
class CameraCreate(BaseModel): name: str; rtsp_url: str
class Camera(CameraBase):
    id: int; owner_id: int; path: str; rtsp_url: str
    class Config: from_attributes = True 
class UserBase(BaseModel): email: str
class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    @validator('password')
    def password_byte_length(cls, v):
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long (max 72 bytes)')
        return v
class User(UserBase):
    id: int; cameras: List[Camera] = []
    class Config: from_attributes = True 
class Token(BaseModel): access_token: str; token_type: str
class TokenData(BaseModel): email: str | None = None
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
def create_user_db(db: Session, user: UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    return get_user_by_email(db, user.email)
def get_cameras_by_user(db: Session, user_id: int):
    return db.query(models.Camera).filter(models.Camera.owner_id == user_id).all()
# ====================================================================
#                 Auth Dependency
# ====================================================================
# ... (Unchanged) ...
async def get_token_data(token: str | None = Depends(oauth2_scheme)) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None: raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise credentials_exception
        return TokenData(email=email)
    except JWTError: raise credentials_exception
# ====================================================================
#                 API Endpoints
# ====================================================================
# ... (Root, register, token, users/me, api/cameras GET are unchanged) ...
@app.get("/")
def read_root(): return {"message": "Security Camera API is running!"}

@app.post("/register", response_model=User)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = get_user_by_email(db, email=user.email)
    if db_user: raise HTTPException(status_code=400, detail="Email already registered")
    return create_user_db(db=db, user=user)

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=form_data.username)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"},)
        access_token_data = {"sub": user.email}
        access_token = create_access_token(access_token_data)
        return {"access_token": access_token, "token_type": "bearer"}
    finally: db.close()

@app.get("/users/me", response_model=User)
async def read_users_me(token_data: TokenData = Depends(get_token_data)):
    db = SessionLocal()
    try:
        user = get_user_by_email(db, email=token_data.email)
        if user is None: raise HTTPException(status_code=404, detail="User not found")
        return user
    finally: db.close()

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
        db_camera = models.Camera(name=camera.name, path=path_name, rtsp_url=camera.rtsp_url, owner_id=user.id)
        db.add(db_camera)
        db.commit()
        db.refresh(db_camera)
        return db_camera
    finally: db.close()

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

# ALL REFRESH ENDPOINTS ARE GONE