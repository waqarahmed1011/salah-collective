from __future__ import annotations

import logging
import time
from typing import Optional, Tuple

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderServiceError, GeocoderTimedOut

from models import Member, MemberStatus

logger = logging.getLogger(__name__)

_RATE_LIMIT_SECONDS = 1.1
_geocoder = Nominatim(user_agent="salah_collective_v1")


# ── Core geocode call ─────────────────────────────────────────────────────────


def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """
    Geocode a single address string using Nominatim.

    Sleeps 1.1 s before each call to respect the 1 req/s rate limit.
    Returns (latitude, longitude), or None if geocoding fails.
    """
    time.sleep(_RATE_LIMIT_SECONDS)
    try:
        location = _geocoder.geocode(address, timeout=10)
    except GeocoderTimedOut:
        logger.warning("Nominatim timed out for address: %r", address)
        return None
    except GeocoderServiceError as exc:
        logger.warning("Nominatim service error for address %r: %s", address, exc)
        return None

    if location is None:
        logger.warning("Geocoding returned no result for address: %r", address)
        return None

    return (location.latitude, location.longitude)


# ── Batch geocoding ───────────────────────────────────────────────────────────


def geocode_member_batch(members: list[Member]) -> dict[str, int]:
    """
    Geocode a list of SQLAlchemy Member ORM instances in place.

    For each member:
    - On success: sets .latitude, .longitude; leaves .status unchanged.
    - On failure: sets .status = MemberStatus.geocode_failed.

    Does NOT commit to the database — the caller is responsible for flushing/committing.

    Returns a summary dict: {"geocoded": N, "failed": N}.
    """
    geocoded = 0
    failed = 0

    for member in members:
        result = geocode_address(member.address_raw)
        if result is not None:
            member.latitude, member.longitude = result
            geocoded += 1
            logger.info(
                "Geocoded %r → (%.6f, %.6f)",
                member.address_raw,
                member.latitude,
                member.longitude,
            )
        else:
            member.status = MemberStatus.geocode_failed
            failed += 1
            logger.warning(
                "Geocoding failed for member %s (%r); marked geocode_failed.",
                member.id,
                member.address_raw,
            )

    logger.info("Batch complete: %d geocoded, %d failed.", geocoded, failed)
    return {"geocoded": geocoded, "failed": failed}
