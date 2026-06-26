from __future__ import annotations

import logging
import time
from typing import Optional, Tuple

import requests
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderServiceError, GeocoderTimedOut

from config import settings
from models import Member, MemberStatus

logger = logging.getLogger(__name__)

_RATE_LIMIT_SECONDS = 1.1
_geocoder = Nominatim(user_agent="salah_collective_v1")


# ── Nominatim (primary) ───────────────────────────────────────────────────────


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


# ── Geocodio (fallback) ───────────────────────────────────────────────────────


def _geocode_via_geocodio(address: str) -> Optional[Tuple[float, float]]:
    """
    Geocode via the Geocodio API (no rate-limit delay needed at pay-as-you-go tier).
    Returns (latitude, longitude), or None on failure.
    """
    if not settings.GEOCODIO_API_KEY:
        logger.warning("GEOCODIO_API_KEY not configured; skipping Geocodio fallback.")
        return None

    try:
        response = requests.get(
            "https://api.geocod.io/v1.7/geocode",
            params={"q": address, "api_key": settings.GEOCODIO_API_KEY},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        logger.warning("Geocodio request failed for address %r: %s", address, exc)
        return None
    except ValueError as exc:
        logger.warning("Geocodio response parse error for address %r: %s", address, exc)
        return None

    results = data.get("results", [])
    if not results:
        return None

    try:
        loc = results[0]["location"]
        return (loc["lat"], loc["lng"])
    except (KeyError, IndexError) as exc:
        logger.warning("Geocodio unexpected response structure for %r: %s", address, exc)
        return None


# ── Batch geocoding ───────────────────────────────────────────────────────────


def geocode_member_batch(members: list) -> dict:
    """
    Geocode a list of SQLAlchemy Member ORM instances in place.

    For each member, tries Nominatim first then Geocodio as fallback.

    - On success (either service): sets .latitude, .longitude; leaves .status unchanged.
    - On failure (both services fail): sets .status = MemberStatus.geocode_failed.

    Does NOT commit to the database — the caller is responsible for flushing/committing.

    Returns a summary dict: {"geocoded": N, "failed": N}.
    """
    geocoded = 0
    failed = 0

    for member in members:
        address = member.address_raw

        # ── Attempt 1: Nominatim ──────────────────────────────────────────────
        result = geocode_address(address)
        if result is not None:
            member.latitude, member.longitude = result
            geocoded += 1
            logger.info(
                "Geocoded via Nominatim: %r → (%.6f, %.6f)",
                address, member.latitude, member.longitude,
            )
            continue

        # ── Attempt 2: Geocodio fallback ──────────────────────────────────────
        result = _geocode_via_geocodio(address)
        if result is not None:
            member.latitude, member.longitude = result
            geocoded += 1
            logger.info(
                "Geocoded via Geocodio fallback: %r → (%.6f, %.6f)",
                address, member.latitude, member.longitude,
            )
            continue

        # ── Both failed ───────────────────────────────────────────────────────
        member.status = MemberStatus.geocode_failed
        failed += 1
        logger.warning(
            "Both Nominatim and Geocodio failed for address: %r (member %s); "
            "marked geocode_failed.",
            address, member.id,
        )

    logger.info("Batch complete: %d geocoded, %d failed.", geocoded, failed)
    return {"geocoded": geocoded, "failed": failed}
