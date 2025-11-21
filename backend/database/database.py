import firebase_admin
from firebase_admin import credentials, db
from supabase import create_client
from dotenv import load_dotenv
import uuid
from datetime import datetime
import os

load_dotenv()

# =========================== Firebase Setup ===========================
FIREBASE_KEY_PATH = os.getenv("FIREBASE_KEY_PATH", "firebase-key.json")
if not os.path.isfile(FIREBASE_KEY_PATH):
    raise RuntimeError(f"Firebase service account file not found: {FIREBASE_KEY_PATH}")

cred = credentials.Certificate(FIREBASE_KEY_PATH)
firebase_admin.initialize_app(cred, {
    "databaseURL": "https://spanisami-3fba1-default-rtdb.firebaseio.com/"
})

# =========================== Supabase Setup ===========================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Constants
DEFAULT_BUCKET = "uploads"

# =========================== Firebase Helpers ===========================
def _profile_ref(profile_id: str):
    return db.reference(f"profiles/{profile_id}")

def save_profile(profile_json_text: str) -> str:
    profile_id = str(uuid.uuid4())
    _profile_ref(profile_id).set({
        "profile": profile_json_text,
        "created_at": datetime.utcnow().isoformat(),
    })
    return profile_id

from typing import Optional  # add at the top if not present

def get_profile(profile_id: str) -> Optional[dict]:
    return db.reference(f"profiles/{profile_id}").get()

def update_cv(profile_id: str, cv_text: str) -> None:
    _profile_ref(profile_id).update({
        "cv": cv_text,
        "cv_generated_at": datetime.utcnow().isoformat(),
    })

def get_all_profiles() -> dict:
    snapshot = db.reference("profiles").get()
    return snapshot or {}

# =========================== Supabase Storage ===========================
def upload_file_supabase(local_path: str, bucket_name: str = DEFAULT_BUCKET) -> str:
    file_name = f"{uuid.uuid4()}_{os.path.basename(local_path)}"
    with open(local_path, "rb") as f:
        file_bytes = f.read()

    res = supabase.storage.from_(bucket_name).upload(
        path=file_name,
        file=file_bytes,
        file_options={"content-type": "application/octet-stream", "upsert": False}
    )

    if res.status_code not in (200, 201):
        raise RuntimeError(f"Supabase upload failed: {res.json()}")

    return supabase.storage.from_(bucket_name).get_public_url(file_name)


def upload_file_and_sync(local_path: str, profile_id: str, bucket_name: str = DEFAULT_BUCKET) -> str:
    file_url = upload_file_supabase(local_path, bucket_name)

    file_name = file_url.split(f"/{bucket_name}/")[-1].split("?")[0]

    _profile_ref(profile_id).update({
        "media_files": {
            "file_name": file_name,
            "file_url": file_url,
        },
        "last_media_upload": datetime.utcnow().isoformat(),
    })

    return file_url


def get_signed_url_supabase(file_name: str, bucket_name: str = DEFAULT_BUCKET, expires_in: int = 3600) -> str:
    response = supabase.storage.from_(bucket_name).create_signed_url(file_name, expires_in)
    if response.get("error"):
        raise RuntimeError(f"Failed to create signed URL: {response['error']}")
    return response["signedURL"]