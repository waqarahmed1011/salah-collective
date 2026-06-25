import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from models import MemberStatus


# ── SalahGroup ────────────────────────────────────────────────────────────────

class SalahGroupBase(BaseModel):
    name: str
    centroid_lat: float
    centroid_lng: float
    size: int


class SalahGroupCreate(SalahGroupBase):
    pass


class SalahGroupRead(SalahGroupBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Member ────────────────────────────────────────────────────────────────────

class MemberBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    address_raw: str
    fajr: bool = False
    zuhr: bool = False
    asr: bool = False
    maghrib: bool = False
    isha: bool = False
    has_car: bool = False
    notes: Optional[str] = None


class MemberCreate(MemberBase):
    pass


class MemberRead(MemberBase):
    id: uuid.UUID
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: MemberStatus
    group_id: Optional[uuid.UUID] = None
    signed_up_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberUpdate(BaseModel):
    status: Optional[MemberStatus] = None
    group_id: Optional[uuid.UUID] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None


# Admin-level member update — all editable fields
class AdminMemberUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address_raw: Optional[str] = None
    fajr: Optional[bool] = None
    zuhr: Optional[bool] = None
    asr: Optional[bool] = None
    maghrib: Optional[bool] = None
    isha: Optional[bool] = None
    has_car: Optional[bool] = None
    notes: Optional[str] = None


# ── MatchingRun ───────────────────────────────────────────────────────────────

class MatchingRunRead(BaseModel):
    id: uuid.UUID
    run_type: str
    triggered_by: str
    members_processed: int
    groups_formed: int
    members_matched: int
    members_waitlisted: int
    run_at: datetime

    model_config = {"from_attributes": True}


# ── Group response shapes ─────────────────────────────────────────────────────

# Used in GET /admin/groups (list view — no PII)
class MemberInGroupLight(BaseModel):
    id: uuid.UUID
    full_name: str
    status: MemberStatus
    fajr: bool
    zuhr: bool
    asr: bool
    maghrib: bool
    isha: bool

    model_config = {"from_attributes": True}


class SalahGroupWithMembersLight(SalahGroupRead):
    members: List[MemberInGroupLight]

    model_config = {"from_attributes": True}


# Used in GET /admin/groups/{id} (full detail view)
class SalahGroupWithMembersFull(SalahGroupRead):
    members: List[MemberRead]

    model_config = {"from_attributes": True}


# ── Waitlist ──────────────────────────────────────────────────────────────────

class WaitlistedMemberRead(BaseModel):
    member: MemberRead
    nearest_group_name: Optional[str] = None
    nearest_group_distance_miles: Optional[float] = None


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_members: int
    unmatched: int
    matched: int
    waitlisted: int
    geocode_failed: int
    total_groups: int
    last_run: Optional[MatchingRunRead] = None


# ── Request bodies ────────────────────────────────────────────────────────────

class RenameGroupBody(BaseModel):
    name: str


class MoveMemberBody(BaseModel):
    group_id: uuid.UUID


class RetryGeocodeBody(BaseModel):
    address: str


# ── Sheets poll response ──────────────────────────────────────────────────────

class PollSheetsResult(BaseModel):
    inserted: int
    geocoded: int
    geocode_failed: int
    message: str
