from __future__ import annotations

import logging
import re
import uuid
from typing import Optional

import numpy as np
from sklearn.neighbors import NearestNeighbors
from sqlalchemy.orm import Session

from models import Member, MemberStatus, SalahGroup, MatchingRun

logger = logging.getLogger(__name__)

RADIUS_MILES = 2.0
EARTH_RADIUS_MILES = 3958.8
RADIUS_RAD = RADIUS_MILES / EARTH_RADIUS_MILES
MAX_GROUP_SIZE = 4
PRAYERS = ("fajr", "zuhr", "asr", "maghrib", "isha")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _shares_prayer(a: Member, b: Member) -> bool:
    return any(getattr(a, p) and getattr(b, p) for p in PRAYERS)


def _group_prayers(members: list) -> set:
    """Union of all prayers attended by anyone in the group."""
    return {p for p in PRAYERS for m in members if getattr(m, p)}


def _centroid(members: list) -> tuple:
    lats = [m.latitude for m in members]
    lngs = [m.longitude for m in members]
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def _next_group_number(db: Session) -> int:
    """Parse the highest trailing integer from existing group names and return next."""
    names = [n for (n,) in db.query(SalahGroup.name).all()]
    max_n = 0
    for name in names:
        match = re.search(r"\d+$", name)
        if match:
            max_n = max(max_n, int(match.group()))
    return max_n + 1


def _fill_from_pool(
    group_members: list,
    centroid_lat: float,
    centroid_lng: float,
    pool: list,
    assigned: set,
) -> list:
    """
    Find up to (MAX_GROUP_SIZE - len(group_members)) candidates from pool
    that are within RADIUS_RAD of the centroid.

    Sorting priority:
      1. Shares at least one prayer with the group  (ascending flag: False < True)
      2. Distance (ascending)

    Modifies `assigned` in place. Returns newly added Member objects.
    """
    slots = MAX_GROUP_SIZE - len(group_members)
    if slots <= 0:
        return []

    available = [m for m in pool if m.id not in assigned]
    if not available:
        return []

    coords = np.radians([[m.latitude, m.longitude] for m in available])
    nn = NearestNeighbors(algorithm="ball_tree", metric="haversine")
    nn.fit(coords)

    query = np.radians([[centroid_lat, centroid_lng]])
    dists, idxs = nn.radius_neighbors(query, radius=RADIUS_RAD)

    if len(idxs[0]) == 0:
        return []

    gp = _group_prayers(group_members)
    candidates = sorted(
        [(dists[0][k], available[idxs[0][k]]) for k in range(len(idxs[0]))],
        # False (shares prayer) sorts before True (no shared prayer)
        key=lambda x: (not any(getattr(x[1], p) for p in gp), x[0]),
    )

    added = []
    for _, candidate in candidates:
        if len(added) >= slots:
            break
        if candidate.id not in assigned:
            assigned.add(candidate.id)
            added.append(candidate)

    return added


def _record_run(
    db: Session,
    run_type: str,
    triggered_by: str,
    members_processed: int,
    groups_formed: int,
    members_matched: int,
    members_waitlisted: int,
) -> MatchingRun:
    run = MatchingRun(
        id=uuid.uuid4(),
        run_type=run_type,
        triggered_by=triggered_by,
        members_processed=members_processed,
        groups_formed=groups_formed,
        members_matched=members_matched,
        members_waitlisted=members_waitlisted,
    )
    db.add(run)
    db.flush()
    return run


# ── Core algorithm ────────────────────────────────────────────────────────────


def _run(db: Session, run_type: str, triggered_by: str) -> dict:
    # ── Step 1: Load unmatched members with valid coordinates ─────────────────
    unmatched: list[Member] = (
        db.query(Member)
        .filter(
            Member.status == MemberStatus.unmatched,
            Member.latitude.isnot(None),
            Member.longitude.isnot(None),
        )
        .order_by(Member.signed_up_at)
        .all()
    )

    if not unmatched:
        logger.info("No unmatched members to process.")
        run = _record_run(db, run_type, triggered_by, 0, 0, 0, 0)
        db.commit()
        return {
            "groups_formed": 0,
            "members_matched": 0,
            "members_waitlisted": 0,
            "run_id": str(run.id),
        }

    logger.info("Starting matching run: %d unmatched members.", len(unmatched))

    # ── Step 2: Build NearestNeighbors over all unmatched members ─────────────
    coords_rad = np.radians([[m.latitude, m.longitude] for m in unmatched])
    nn = NearestNeighbors(algorithm="ball_tree", metric="haversine")
    nn.fit(coords_rad)
    dist_arr, idx_arr = nn.radius_neighbors(coords_rad, radius=RADIUS_RAD)

    # ── Step 3: Greedy group assignment ───────────────────────────────────────
    # members are already sorted by signed_up_at (earliest first)
    assigned: set = set()
    new_groups: list[list[Member]] = []

    for i, member in enumerate(unmatched):
        if member.id in assigned:
            continue

        # Collect unassigned neighbors (excluding self)
        neighbors = [
            (dist_arr[i][k], unmatched[idx_arr[i][k]])
            for k in range(len(idx_arr[i]))
            if idx_arr[i][k] != i
            and unmatched[idx_arr[i][k]].id not in assigned
        ]

        if not neighbors:
            # No eligible neighbors — member will be handled in Step 4 or waitlisted
            continue

        # Prayer-sharing neighbors preferred; fall back to all proximity neighbors
        prayer_neighbors = [(d, m) for d, m in neighbors if _shares_prayer(member, m)]
        candidates = prayer_neighbors if prayer_neighbors else neighbors
        candidates.sort(key=lambda x: x[0])

        group = [member] + [m for _, m in candidates[: MAX_GROUP_SIZE - 1]]
        for gm in group:
            assigned.add(gm.id)
        new_groups.append(group)
        logger.debug(
            "Formed preliminary group of %d starting with %s.", len(group), member.id
        )

    # ── Step 4: Fill under-full groups ────────────────────────────────────────
    # Pool = unmatched members not yet assigned (left over from Step 3)
    #      + members already waitlisted in the DB from prior runs
    prior_waitlisted: list[Member] = (
        db.query(Member)
        .filter(
            Member.status == MemberStatus.waitlisted,
            Member.latitude.isnot(None),
            Member.longitude.isnot(None),
        )
        .all()
    )

    # Deduplicate pool by ID to guard against any overlap
    seen_in_pool: set = set()
    fill_pool: list[Member] = []
    for m in [m for m in unmatched if m.id not in assigned] + prior_waitlisted:
        if m.id not in seen_in_pool:
            seen_in_pool.add(m.id)
            fill_pool.append(m)

    # 4a — fill new groups formed in Step 3
    for group in new_groups:
        if len(group) >= MAX_GROUP_SIZE or not fill_pool:
            continue
        clat, clng = _centroid(group)
        added = _fill_from_pool(group, clat, clng, fill_pool, assigned)
        group.extend(added)
        if added:
            fill_pool = [m for m in fill_pool if m.id not in assigned]

    # 4b — fill existing DB groups (from previous runs) that are under capacity
    existing_db_groups: list[SalahGroup] = (
        db.query(SalahGroup)
        .filter(SalahGroup.size < MAX_GROUP_SIZE)
        .all()
    )

    # Maps db_group.id -> list of newly added Member objects
    existing_group_additions: dict = {}

    for db_group in existing_db_groups:
        if not fill_pool:
            break
        current_members: list[Member] = (
            db.query(Member).filter(Member.group_id == db_group.id).all()
        )
        added = _fill_from_pool(
            current_members,
            db_group.centroid_lat,
            db_group.centroid_lng,
            fill_pool,
            assigned,
        )
        if added:
            existing_group_additions[db_group.id] = added
            fill_pool = [m for m in fill_pool if m.id not in assigned]

    # ── Step 5: Persist ───────────────────────────────────────────────────────
    next_n = _next_group_number(db)
    groups_formed = 0
    members_matched = 0

    # 5a — create new SalahGroup rows and update their members
    for group in new_groups:
        clat, clng = _centroid(group)
        sg = SalahGroup(
            id=uuid.uuid4(),
            name=f"Salah Collective Group {next_n}",
            centroid_lat=clat,
            centroid_lng=clng,
            size=len(group),
        )
        db.add(sg)
        db.flush()  # populate sg.id before assigning to members

        for gm in group:
            gm.group_id = sg.id
            gm.status = MemberStatus.matched
            members_matched += 1

        groups_formed += 1
        next_n += 1
        logger.info(
            "Created '%s' with %d members (centroid %.4f, %.4f).",
            sg.name, len(group), clat, clng,
        )

    # 5b — update existing groups that received new members
    for db_group in existing_db_groups:
        added = existing_group_additions.get(db_group.id)
        if not added:
            continue

        current_members = db.query(Member).filter(Member.group_id == db_group.id).all()
        all_members = current_members + added

        for gm in added:
            gm.group_id = db_group.id
            gm.status = MemberStatus.matched
            members_matched += 1

        clat, clng = _centroid(all_members)
        db_group.centroid_lat = clat
        db_group.centroid_lng = clng
        db_group.size = len(all_members)
        logger.info(
            "Expanded '%s' by %d → now %d members.",
            db_group.name, len(added), db_group.size,
        )

    # 5c — waitlist all remaining unassigned members
    members_waitlisted = 0
    for member in unmatched + prior_waitlisted:
        if member.id not in assigned:
            member.status = MemberStatus.waitlisted
            members_waitlisted += 1

    # 5d — record matching run
    run = _record_run(
        db,
        run_type=run_type,
        triggered_by=triggered_by,
        members_processed=len(unmatched),
        groups_formed=groups_formed,
        members_matched=members_matched,
        members_waitlisted=members_waitlisted,
    )

    db.commit()

    summary = {
        "groups_formed": groups_formed,
        "members_matched": members_matched,
        "members_waitlisted": members_waitlisted,
        "run_id": str(run.id),
    }
    logger.info("Matching complete: %s", summary)
    return summary


# ── Public API ────────────────────────────────────────────────────────────────


def run_matching(db: Session, triggered_by: str = "scheduler") -> dict:
    """Run the proximity + prayer-preference matching algorithm."""
    return _run(db, run_type="scheduled", triggered_by=triggered_by)


def run_batch(db: Session) -> dict:
    """Same algorithm as run_matching but recorded as a manual batch run."""
    return _run(db, run_type="batch", triggered_by="manual")
