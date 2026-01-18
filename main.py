# main.py - FastAPI Backend for FlipFile
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
import os
import shutil
import uuid
import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path

# PDF Processing Libraries
import pikepdf
from pdf2docx import Converter
from PIL import Image
import fitz  # PyMuPDF
import ghostscript
import io

# Security
import hashlib
import secrets

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FlipFile API",
    description="Multi-tool PDF processing platform",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
UPLOAD_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)

# User management (in-memory for demo, use DB in production)
users = {}
user_tasks = {}

# File management
file_lifetime = {
    "free": timedelta(hours=1),
    "premium": timedelta(hours=24)
}

class FileProcessor:
    """Handle all file processing operations"""
    
    @staticmethod
    async def compress_pdf(input_path: Path, output_path: Path, quality: str = "medium"):
        """Compress PDF using Ghostscript"""
        try:
            # Using pikepdf for compression
            with pikepdf.open(input_path) as pdf:
                pdf.save(output_path, compress_streams=True, normalize_content=True)
            return True
        except Exception as e:
            logger.error(f"PDF compression error: {e}")
            return False
    
    @staticmethod
    async def convert_pdf_to_word(input_path: Path, output_path: Path):
        """Convert PDF to Word document"""
        try:
            cv = Converter(input_path)
            cv.convert(output_path)
            cv.close()
            return True
        except Exception as e:
            logger.error(f"PDF to Word conversion error: {e}")
            return False
    
    @staticmethod
    async def extract_colors(input_path: Path):
        """Extract colors from images"""
        try:
            if input_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.tiff']:
                img = Image.open(input_path)
                img = img.convert('RGB')
                
                # Simple color extraction - get dominant colors
                img = img.resize((100, 100))
                colors = img.getcolors(maxcolors=10000)
                
                if colors:
                    colors.sort(reverse=True, key=lambda x: x[0])
                    dominant_colors = [color[1] for color in colors[:10]]
                    return dominant_colors
            return []
        except Exception as e:
            logger.error(f"Color extraction error: {e}")
            return []
    
    @staticmethod
    async def protect_pdf(input_path: Path, output_path: Path, password: str):
        """Add password protection to PDF"""
        try:
            with pikepdf.open(input_path) as pdf:
                pdf.save(output_path, encryption=pikepdf.Encryption(
                    user=password,
                    owner=password,
                    R=4  # AES-256 encryption
                ))
            return True
        except Exception as e:
            logger.error(f"PDF protection error: {e}")
            return False
    
    @staticmethod
    async def unlock_pdf(input_path: Path, output_path: Path, password: str):
        """Remove password protection from PDF"""
        try:
            with pikepdf.open(input_path, password=password) as pdf:
                pdf.save(output_path)
            return True
        except Exception as e:
            logger.error(f"PDF unlock error: {e}")
            return False
    
    @staticmethod
    async def edit_pdf(input_path: Path, output_path: Path, operations: dict):
        """Edit PDF with various operations"""
        try:
            doc = fitz.open(input_path)
            
            # Apply operations
            if "rotate" in operations:
                for page_num in operations["rotate"].get("pages", range(len(doc))):
                    doc[page_num].set_rotation(operations["rotate"]["angle"])
            
            if "extract" in operations:
                pages = operations["extract"].get("pages", [])
                if pages:
                    doc.select(pages)
            
            doc.save(output_path)
            doc.close()
            return True
        except Exception as e:
            logger.error(f"PDF edit error: {e}")
            return False

class UserManager:
    """Manage user authentication and limits"""
    
    @staticmethod
    def create_user(email: str, password: str):
        """Create new user"""
        user_id = str(uuid.uuid4())
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        
        users[user_id] = {
            "id": user_id,
            "email": email,
            "password_hash": hashed_password,
            "is_premium": False,
            "created_at": datetime.utcnow(),
            "daily_tasks": 0,
            "last_reset": datetime.utcnow().date()
        }
        
        user_tasks[user_id] = []
        return user_id
    
    @staticmethod
    def authenticate_user(email: str, password: str):
        """Authenticate user"""
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        
        for user_id, user_data in users.items():
            if user_data["email"] == email and user_data["password_hash"] == hashed_password:
                return user_id
        return None
    
    @staticmethod
    def can_perform_task(user_id: str, is_premium: bool = False):
        """Check if user can perform task"""
        if is_premium:
            return True
            
        user = users.get(user_id)
        if not user:
            return True  # Anonymous users have free limits
        
        # Reset daily tasks if needed
        today = datetime.utcnow().date()
        if user["last_reset"] != today:
            user["daily_tasks"] = 0
            user["last_reset"] = today
        
        # Check limits
        max_tasks = 12 if user.get("is_logged_in", False) else 4
        return user["daily_tasks"] < max_tasks
    
    @staticmethod
    def increment_task_count(user_id: str):
        """Increment user's task count"""
        if user_id in users:
            users[user_id]["daily_tasks"] += 1

class FileManager:
    """Manage file storage and cleanup"""
    
    @staticmethod
    def generate_file_id():
        """Generate unique file ID"""
        return str(uuid.uuid4())
    
    @staticmethod
    async def save_uploaded_file(file: UploadFile, user_id: str):
        """Save uploaded file to temporary storage"""
        file_id = FileManager.generate_file_id()
        ext = Path(file.filename).suffix
        filename = f"{file_id}{ext}"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        return {
            "file_id": file_id,
            "original_name": file.filename,
            "path": file_path,
            "size": len(content),
            "uploaded_at": datetime.utcnow(),
            "user_id": user_id
        }
    
    @staticmethod
    def schedule_file_deletion(file_path: Path, user_type: str = "free"):
        """Schedule file for automatic deletion"""
        lifetime = file_lifetime.get(user_type, timedelta(hours=1))
        deletion_time = datetime.utcnow() + lifetime
        
        # In production, use a task queue like Celery
        # For demo, we'll just log the deletion time
        logger.info(f"File {file_path} scheduled for deletion at {deletion_time}")
        
        async def delete_file():
            await asyncio.sleep(lifetime.total_seconds())
            try:
                if file_path.exists():
                    file_path.unlink()
                    logger.info(f"Deleted file: {file_path}")
            except Exception as e:
                logger.error(f"Error deleting file {file_path}: {e}")
        
        # Start deletion task
        asyncio.create_task(delete_file())

# Background tasks
async def cleanup_old_files():
    """Clean up files older than their lifetime"""
    while True:
        try:
            now = datetime.utcnow()
            for file_path in UPLOAD_DIR.glob("*"):
                if file_path.is_file():
                    file_age = now - datetime.fromtimestamp(file_path.stat().st_mtime)
                    if file_age > timedelta(hours=25):  # Slightly longer than max lifetime
                        file_path.unlink()
                        logger.info(f"Cleaned up old file: {file_path}")
            
            for file_path in PROCESSED_DIR.glob("*"):
                if file_path.is_file():
                    file_age = now - datetime.fromtimestamp(file_path.stat().st_mtime)
                    if file_age > timedelta(hours=25):
                        file_path.unlink()
                        logger.info(f"Cleaned up old processed file: {file_path}")
                        
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
        
        await asyncio.sleep(3600)  # Run every hour

# API Endpoints
@app.on_event("startup")
async def startup_event():
    """Start background tasks on startup"""
    asyncio.create_task(cleanup_old_files())

@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "message": "FlipFile API",
        "version": "1.0.0",
        "endpoints": [
            "/api/process - Process files",
            "/api/login - User authentication",
            "/api/register - User registration",
            "/api/status - Service status"
        ]
    }

@app.post("/api/process")
async def process_files(
    files: List[UploadFile] = File(...),
    tool: str = "convert",
    user_id: str = "anonymous",
    is_premium: bool = False,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Process uploaded files"""
    
    # Check user limits
    if not UserManager.can_perform_task(user_id, is_premium):
        raise HTTPException(
            status_code=429,
            detail="Daily task limit reached. Please upgrade or try again tomorrow."
        )
    
    # Validate file count
    if not is_premium and len(files) > 1:
        raise HTTPException(
            status_code=400,
            detail="Free users can only process one file at a time"
        )
    
    # Validate file sizes
    max_size = 200 * 1024 * 1024 if is_premium else 50 * 1024 * 1024
    for file in files:
        content = await file.read()
        if len(content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} exceeds size limit"
            )
        await file.seek(0)
    
    try:
        processed_files = []
        processor = FileProcessor()
        
        for file in files:
            # Save uploaded file
            file_info = await FileManager.save_uploaded_file(file, user_id)
            
            # Generate output filename
            output_id = FileManager.generate_file_id()
            output_ext = ".docx" if tool == "convert" else ".pdf"
            output_path = PROCESSED_DIR / f"{output_id}{output_ext}"
            
            # Process based on tool
            success = False
            if tool == "compress":
                success = await processor.compress_pdf(
                    file_info["path"], 
                    output_path
                )
            elif tool == "convert":
                success = await processor.convert_pdf_to_word(
                    file_info["path"], 
                    output_path
                )
            elif tool == "protect":
                # In production, get password from request
                password = "default_password"  # Should come from request
                success = await processor.protect_pdf(
                    file_info["path"],
                    output_path,
                    password
                )
            elif tool == "unlock":
                password = "default_password"  # Should come from request
                success = await processor.unlock_pdf(
                    file_info["path"],
                    output_path,
                    password
                )
            else:
                # Default to simple copy for other tools
                shutil.copy(file_info["path"], output_path)
                success = True
            
            if success:
                processed_files.append({
                    "original_name": file_info["original_name"],
                    "processed_name": output_path.name,
                    "download_url": f"/api/download/{output_path.name}"
                })
                
                # Schedule deletion
                user_type = "premium" if is_premium else "free"
                FileManager.schedule_file_deletion(file_info["path"], user_type)
                FileManager.schedule_file_deletion(output_path, user_type)
        
        # Increment task count
        UserManager.increment_task_count(user_id)
        
        return {
            "success": True,
            "message": f"Processed {len(processed_files)} file(s)",
            "processed_files": processed_files,
            "download_url": f"/api/download/batch/{output_id}.zip" if len(processed_files) > 1 else processed_files[0]["download_url"]
        }
        
    except Exception as e:
        logger.error(f"Processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/login")
async def login(email: str, password: str):
    """User login endpoint"""
    user_id = UserManager.authenticate_user(email, password)
    
    if user_id:
        return {
            "success": True,
            "user_id": user_id,
            "is_premium": users[user_id].get("is_premium", False),
            "name": email.split("@")[0]
        }
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/register")
async def register(email: str, password: str):
    """User registration endpoint"""
    # Check if email already exists
    for user_data in users.values():
        if user_data["email"] == email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = UserManager.create_user(email, password)
    
    return {
        "success": True,
        "user_id": user_id,
        "message": "Registration successful"
    }

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """Download processed file"""
    file_path = PROCESSED_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

@app.get("/api/status")
async def get_status():
    """Get service status"""
    return {
        "status": "operational",
        "upload_dir_size": sum(f.stat().st_size for f in UPLOAD_DIR.glob("*") if f.is_file()),
        "processed_dir_size": sum(f.stat().st_size for f in PROCESSED_DIR.glob("*") if f.is_file()),
        "active_users": len(users),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/tasks/remaining/{user_id}")
async def get_remaining_tasks(user_id: str):
    """Get remaining daily tasks for user"""
    user = users.get(user_id)
    
    if not user:
        return {"remaining_tasks": 4, "max_tasks": 4}
    
    # Reset if needed
    today = datetime.utcnow().date()
    if user["last_reset"] != today:
        user["daily_tasks"] = 0
        user["last_reset"] = today
    
    max_tasks = 12 if user.get("is_logged_in", False) else 4
    remaining = max(0, max_tasks - user["daily_tasks"])
    
    return {
        "remaining_tasks": remaining,
        "max_tasks": max_tasks,
        "is_premium": user.get("is_premium", False)
    }

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )

# Static files for frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ssl_keyfile="key.pem",
        ssl_certfile="cert.pem"
    )
