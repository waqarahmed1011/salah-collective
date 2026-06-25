from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from config import settings
from models import Member

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# Maps lowercase keywords to member dict field names.
# First matching keyword wins, so order matters for ambiguous headers.
COLUMN_KEYWORDS: list[tuple[str, str]] = [
    ("timestamp", "timestamp"),
    ("email", "email"),
    ("name", "full_name"),
    ("address", "address_raw"),
    ("salah", "salah_raw"),
    ("phone", "phone"),
    ("note", "notes"),  # covers "note" and "notes"
]

# Alternate spellings for prayer names → canonical DB field name
SALAH_ALIASES: dict[str, str] = {"dhuhr": "zuhr", "duhr": "zuhr", "jumu'ah": "zuhr"}

TIMESTAMP_FORMATS: list[str] = [
    "%m/%d/%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
]


# ── Auth / service ────────────────────────────────────────────────────────────


def _build_service():
    creds = service_account.Credentials.from_service_account_file(
        settings.GOOGLE_SHEETS_CREDENTIALS_JSON, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)


# ── Column detection ──────────────────────────────────────────────────────────


def _detect_columns(headers: list[str]) -> dict[str, int]:
    """
    Map member field names → column indices via flexible keyword matching.
    Each header is checked against COLUMN_KEYWORDS in order; first match wins.
    """
    mapping: dict[str, int] = {}
    for idx, header in enumerate(headers):
        lower = header.lower()
        for keyword, field in COLUMN_KEYWORDS:
            if keyword in lower and field not in mapping:
                mapping[field] = idx
                break
    return mapping


# ── Row parsing helpers ───────────────────────────────────────────────────────


def _parse_timestamp(raw: str) -> Optional[datetime]:
    for fmt in TIMESTAMP_FORMATS:
        try:
            return datetime.strptime(raw.strip(), fmt)
        except ValueError:
            continue
    logger.warning("Could not parse timestamp %r; using utcnow", raw)
    return None


def _parse_salah(raw: str) -> dict[str, bool]:
    """
    Turn a comma-separated salah string (e.g. "Fajr, Maghrib, Isha") into
    per-prayer booleans. Case-insensitive; handles alternate spellings via SALAH_ALIASES.
    """
    tokens = {t.strip().lower() for t in raw.split(",") if t.strip()}
    normalized = {SALAH_ALIASES.get(t, t) for t in tokens}
    return {
        "fajr": "fajr" in normalized,
        "zuhr": "zuhr" in normalized,
        "asr": "asr" in normalized,
        "maghrib": "maghrib" in normalized,
        "isha": "isha" in normalized,
    }


def _get_cell(row: list[str], col_map: dict[str, int], field: str) -> str:
    idx = col_map.get(field)
    if idx is None or idx >= len(row):
        return ""
    return row[idx].strip()


def _row_to_member(
    row: list[str], col_map: dict[str, int]
) -> Optional[dict[str, Any]]:
    """
    Convert a raw sheet row to a member dict.
    Returns None for rows that are empty or missing required fields.
    """
    email = _get_cell(row, col_map, "email").lower()
    full_name = _get_cell(row, col_map, "full_name")
    address_raw = _get_cell(row, col_map, "address_raw")

    if not email or not full_name or not address_raw:
        return None

    timestamp_raw = _get_cell(row, col_map, "timestamp")
    signed_up_at = (
        _parse_timestamp(timestamp_raw) if timestamp_raw else None
    ) or datetime.utcnow()

    salah_raw = _get_cell(row, col_map, "salah_raw")

    return {
        "email": email,
        "full_name": full_name,
        "address_raw": address_raw,
        "phone": _get_cell(row, col_map, "phone") or None,
        "notes": _get_cell(row, col_map, "notes") or None,
        "has_car": True,
        "signed_up_at": signed_up_at,
        **_parse_salah(salah_raw),
    }


# ── Public API ────────────────────────────────────────────────────────────────


def read_sheet_rows() -> list[dict[str, Any]]:
    """
    Fetch all rows from the configured Google Sheet.

    Deduplicates by email address, keeping the row with the latest Timestamp
    when the same email appears more than once (resubmission case).

    Returns a list of member dicts with cleaned field names ready for DB insertion.
    """
    service = _build_service()
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=settings.SHEET_ID, range=settings.SHEET_TAB_NAME)
        .execute()
    )
    values: list[list[str]] = result.get("values", [])

    if len(values) < 2:
        logger.info("Sheet has no data rows.")
        return []

    headers, data_rows = values[0], values[1:]
    col_map = _detect_columns(headers)

    if "email" not in col_map:
        logger.error(
            "Could not detect an email column in sheet headers: %s", headers
        )
        return []

    # Deduplicate: keep latest submission per email
    by_email: dict[str, dict[str, Any]] = {}
    skipped = 0
    for row in data_rows:
        member = _row_to_member(row, col_map)
        if member is None:
            skipped += 1
            continue
        existing = by_email.get(member["email"])
        if existing is None or member["signed_up_at"] > existing["signed_up_at"]:
            by_email[member["email"]] = member

    if skipped:
        logger.debug("Skipped %d empty/incomplete rows.", skipped)
    logger.info("Read %d unique members from sheet.", len(by_email))
    return list(by_email.values())


def get_new_sheet_rows(db: Session) -> list[dict[str, Any]]:
    """
    Return only sheet rows whose email address is not already in the members table.
    """
    all_rows = read_sheet_rows()
    if not all_rows:
        return []

    existing_emails: set[str] = {
        email for (email,) in db.query(Member.email).all()
    }

    new_rows = [r for r in all_rows if r["email"] not in existing_emails]
    logger.info(
        "%d new members out of %d total sheet rows.",
        len(new_rows),
        len(all_rows),
    )
    return new_rows
