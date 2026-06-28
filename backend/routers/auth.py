from fastapi import APIRouter, HTTPException
from jose import jwt
from datetime import datetime, timedelta
import os
from passlib.context import CryptContext

from database import db, id_filter, now_iso, serialize_doc, with_ids
from schemas import AdminLogin

router = APIRouter()

SECRET_KEY = os.getenv("JWT_SECRET", "coding-assessment-secret-key-2024")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_token(admin_id: str, username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=24)
    return jwt.encode(
        {"sub": admin_id, "username": username, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

@router.post("/admin/login")
def admin_login(body: AdminLogin):
    try:
        admin = db.admins.find_one({"username": body.username})
        if admin and pwd_context.verify(body.password, admin["password_hash"]):
            admin_id = admin.get("id") or str(admin["_id"])
            token = create_token(admin_id, body.username)
            return {"token": token, "username": body.username, "id": admin_id}
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/setup-password")
def setup_admin_password(body: AdminLogin):
    """Create or update an admin account in MongoDB."""
    try:
        existing = serialize_doc(db.admins.find_one({"username": body.username}))
        password_hash = pwd_context.hash(body.password)

        if existing:
            db.admins.update_one(
                id_filter(existing["id"]),
                {"$set": {"password_hash": password_hash, "updated_at": now_iso()}},
            )
        else:
            db.admins.insert_one(
                with_ids(
                    {
                        "username": body.username,
                        "password_hash": password_hash,
                        "created_at": now_iso(),
                    }
                )
            )

        return {"message": f"Admin {body.username} configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
