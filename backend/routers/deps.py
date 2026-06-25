import secrets
from typing import Optional

from fastapi import Header, HTTPException
from config import settings


def verify_admin_key(x_admin_key: Optional[str] = Header(None)) -> None:
    """
    Require a valid X-Admin-Key header on every protected route.

    Uses secrets.compare_digest for constant-time comparison to prevent
    timing-based key enumeration. Also rejects requests when ADMIN_SECRET_KEY
    is empty so a misconfigured deployment doesn't silently accept anything.
    """
    if not settings.ADMIN_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server is missing ADMIN_SECRET_KEY configuration.")
    if not x_admin_key or not secrets.compare_digest(x_admin_key, settings.ADMIN_SECRET_KEY):
        raise HTTPException(status_code=403, detail="Invalid or missing admin key.")
