import os
import uuid

from fastapi import HTTPException, UploadFile, status

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/bmp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB, matches frontend copy ("up to 10MB")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
REPORTS_DIR = os.path.join(BASE_DIR, "generated_reports")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)


def safe_filename(original_name: str) -> str:
    """Generates a random, collision-free filename while preserving the
    (validated) extension, and stripping any path components -- prevents
    path traversal and header-injection via user-controlled filenames."""
    ext = os.path.splitext(original_name or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"
    return f"{uuid.uuid4().hex}{ext}"


async def read_and_validate_image(file: UploadFile, field_name: str = "image") -> bytes:
    if file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Missing required file: {field_name}")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type for {field_name}. Allowed: JPG, PNG, WEBP, BMP.",
            )

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} file is empty")
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} exceeds the 10MB size limit",
        )
    return contents


def user_upload_subdir(user_id: int) -> str:
    """Returns a per-user upload directory, created on demand. Using a
    numeric user_id (not user input) avoids path traversal."""
    path = os.path.join(UPLOADS_DIR, str(int(user_id)))
    os.makedirs(path, exist_ok=True)
    return path


def user_reports_subdir(user_id: int) -> str:
    path = os.path.join(REPORTS_DIR, str(int(user_id)))
    os.makedirs(path, exist_ok=True)
    return path
