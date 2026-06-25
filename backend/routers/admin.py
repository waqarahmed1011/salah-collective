from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from geopy.distance import geodesic

from database import get_db
from geocoder import geocode_address
from matcher import run_matching, run_batch
from models import Member, MemberStatus, SalahGroup, MatchingRun
from routers.deps import verify_admin_key
from schemas import (
    AdminMemberUpdate,
    DashboardStats,
    MatchingRunRead,
    MemberRead,
    MoveMemberBody,
    RenameGroupBody,
    RetryGeocodeBody,
    SalahGroupRead,
    SalahGroupWithMembersFull,
    SalahGroupWithMembersLight,
    WaitlistedMemberRead,
)


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(verify_admin_key)],
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_member_or_404(member_id: uuid.UUID, db: Session) -> Member:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def _get_group_or_404(group_id: uuid.UUID, db: Session) -> SalahGroup:
    group = db.query(SalahGroup).filter(SalahGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _nearest_group(
    member: Member, groups: List[SalahGroup]
) -> tuple:
    """Return (group_name, distance_miles) for the nearest group centroid."""
    if not groups or member.latitude is None or member.longitude is None:
        return None, None
    point = (member.latitude, member.longitude)
    closest = min(
        groups,
        key=lambda g: geodesic(point, (g.centroid_lat, g.centroid_lng)).miles,
    )
    dist = round(geodesic(point, (closest.centroid_lat, closest.centroid_lng)).miles, 2)
    return closest.name, dist


def _recalculate_group(group: SalahGroup, db: Session) -> None:
    """Recompute size and centroid from current group members."""
    members = db.query(Member).filter(Member.group_id == group.id).all()
    geocoded = [m for m in members if m.latitude is not None]
    group.size = len(members)
    if geocoded:
        group.centroid_lat = sum(m.latitude for m in geocoded) / len(geocoded)
        group.centroid_lng = sum(m.longitude for m in geocoded) / len(geocoded)


# ── Dashboard ─────────────────────────────────────────────────────────────────


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db)):
    status_counts = dict(
        db.query(Member.status, func.count(Member.id)).group_by(Member.status).all()
    )
    total_members = sum(status_counts.values())
    total_groups = db.query(func.count(SalahGroup.id)).scalar() or 0
    last_run = (
        db.query(MatchingRun).order_by(MatchingRun.run_at.desc()).first()
    )
    return DashboardStats(
        total_members=total_members,
        unmatched=status_counts.get(MemberStatus.unmatched, 0),
        matched=status_counts.get(MemberStatus.matched, 0),
        waitlisted=status_counts.get(MemberStatus.waitlisted, 0),
        geocode_failed=status_counts.get(MemberStatus.geocode_failed, 0),
        total_groups=total_groups,
        last_run=MatchingRunRead.model_validate(last_run) if last_run else None,
    )


# ── Groups ────────────────────────────────────────────────────────────────────


@router.get("/groups", response_model=List[SalahGroupWithMembersLight])
def list_groups(db: Session = Depends(get_db)):
    groups = db.query(SalahGroup).order_by(SalahGroup.created_at).all()
    return [SalahGroupWithMembersLight.model_validate(g) for g in groups]


@router.get("/groups/{group_id}", response_model=SalahGroupWithMembersFull)
def get_group(group_id: uuid.UUID, db: Session = Depends(get_db)):
    group = _get_group_or_404(group_id, db)
    return SalahGroupWithMembersFull.model_validate(group)


@router.post("/groups/{group_id}/rename", response_model=SalahGroupRead)
def rename_group(
    group_id: uuid.UUID, body: RenameGroupBody, db: Session = Depends(get_db)
):
    group = _get_group_or_404(group_id, db)
    group.name = body.name.strip()
    db.commit()
    db.refresh(group)
    return SalahGroupRead.model_validate(group)


@router.delete("/groups/{group_id}")
def disband_group(group_id: uuid.UUID, db: Session = Depends(get_db)):
    group = _get_group_or_404(group_id, db)
    db.query(Member).filter(Member.group_id == group_id).update(
        {Member.group_id: None, Member.status: MemberStatus.unmatched},
        synchronize_session="fetch",
    )
    db.delete(group)
    db.commit()
    return {"detail": f"Group '{group.name}' disbanded; members returned to unmatched."}


# ── Members ───────────────────────────────────────────────────────────────────


@router.get("/members", response_model=List[MemberRead])
def list_members(
    status: Optional[MemberStatus] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Member)
    if status is not None:
        q = q.filter(Member.status == status)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(Member.full_name.ilike(term), Member.email.ilike(term))
        )
    return q.order_by(Member.signed_up_at).all()


@router.get("/members/{member_id}", response_model=MemberRead)
def get_member(member_id: uuid.UUID, db: Session = Depends(get_db)):
    return _get_member_or_404(member_id, db)


@router.put("/members/{member_id}", response_model=MemberRead)
def update_member(
    member_id: uuid.UUID,
    body: AdminMemberUpdate,
    db: Session = Depends(get_db),
):
    member = _get_member_or_404(member_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{member_id}")
def delete_member(member_id: uuid.UUID, db: Session = Depends(get_db)):
    member = _get_member_or_404(member_id, db)
    old_group_id = member.group_id
    db.delete(member)
    db.flush()
    if old_group_id:
        group = db.query(SalahGroup).filter(SalahGroup.id == old_group_id).first()
        if group:
            _recalculate_group(group, db)
    db.commit()
    return {"detail": "Member deleted."}


@router.post("/members/{member_id}/move", response_model=MemberRead)
def move_member(
    member_id: uuid.UUID,
    body: MoveMemberBody,
    db: Session = Depends(get_db),
):
    member = _get_member_or_404(member_id, db)
    new_group = _get_group_or_404(body.group_id, db)

    if new_group.size >= 4:
        raise HTTPException(status_code=400, detail="Target group is already at capacity (4 members).")

    old_group_id = member.group_id
    member.group_id = new_group.id
    member.status = MemberStatus.matched
    db.flush()

    # Update old group stats
    if old_group_id and old_group_id != new_group.id:
        old_group = db.query(SalahGroup).filter(SalahGroup.id == old_group_id).first()
        if old_group:
            _recalculate_group(old_group, db)

    _recalculate_group(new_group, db)
    db.commit()
    db.refresh(member)
    return member


@router.post("/members/{member_id}/unmatch", response_model=MemberRead)
def unmatch_member(member_id: uuid.UUID, db: Session = Depends(get_db)):
    member = _get_member_or_404(member_id, db)
    old_group_id = member.group_id
    member.group_id = None
    member.status = MemberStatus.unmatched
    db.flush()
    if old_group_id:
        group = db.query(SalahGroup).filter(SalahGroup.id == old_group_id).first()
        if group:
            _recalculate_group(group, db)
    db.commit()
    db.refresh(member)
    return member


# ── Waitlist ──────────────────────────────────────────────────────────────────


@router.get("/waitlist", response_model=List[WaitlistedMemberRead])
def get_waitlist(db: Session = Depends(get_db)):
    waitlisted = (
        db.query(Member)
        .filter(Member.status == MemberStatus.waitlisted)
        .order_by(Member.signed_up_at)
        .all()
    )
    all_groups = db.query(SalahGroup).all()
    result = []
    for member in waitlisted:
        name, dist = _nearest_group(member, all_groups)
        result.append(
            WaitlistedMemberRead(
                member=MemberRead.model_validate(member),
                nearest_group_name=name,
                nearest_group_distance_miles=dist,
            )
        )
    return result


# ── Geocode failures ──────────────────────────────────────────────────────────


@router.get("/geocode-failures", response_model=List[MemberRead])
def get_geocode_failures(db: Session = Depends(get_db)):
    return (
        db.query(Member)
        .filter(Member.status == MemberStatus.geocode_failed)
        .order_by(Member.signed_up_at)
        .all()
    )


@router.post("/geocode-failures/{member_id}/retry", response_model=MemberRead)
def retry_geocode(
    member_id: uuid.UUID,
    body: RetryGeocodeBody,
    db: Session = Depends(get_db),
):
    member = _get_member_or_404(member_id, db)
    member.address_raw = body.address.strip()

    coords = geocode_address(member.address_raw)
    if coords:
        member.latitude, member.longitude = coords
        member.status = MemberStatus.unmatched
    else:
        member.status = MemberStatus.geocode_failed

    db.commit()
    db.refresh(member)
    return member


# ── Matching triggers ─────────────────────────────────────────────────────────


@router.post("/run-matching")
def trigger_matching(db: Session = Depends(get_db)):
    result = run_matching(db, triggered_by="admin")
    return result


@router.post("/run-batch")
def trigger_batch(db: Session = Depends(get_db)):
    result = run_batch(db)
    return result


# ── Run history ───────────────────────────────────────────────────────────────


@router.get("/runs", response_model=List[MatchingRunRead])
def list_runs(db: Session = Depends(get_db)):
    return (
        db.query(MatchingRun).order_by(MatchingRun.run_at.desc()).all()
    )
