from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from routers.deps import verify_admin_key
from geocoder import geocode_member_batch
from models import Member, MemberStatus
from schemas import PollSheetsResult
from sheets_reader import get_new_sheet_rows

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[Depends(verify_admin_key)],
)


@router.post("/poll-sheets", response_model=PollSheetsResult)
def poll_sheets(db: Session = Depends(get_db)):
    """
    Pull new form submissions from Google Sheets, insert them as members,
    and immediately geocode their addresses.
    """
    new_rows = get_new_sheet_rows(db)

    if not new_rows:
        return PollSheetsResult(
            inserted=0,
            geocoded=0,
            geocode_failed=0,
            message="No new members found in sheet.",
        )

    new_members = []
    for row in new_rows:
        member = Member(id=uuid.uuid4(), status=MemberStatus.unmatched, **row)
        db.add(member)
        new_members.append(member)
    db.flush()

    summary = geocode_member_batch(new_members)
    db.commit()

    return PollSheetsResult(
        inserted=len(new_members),
        geocoded=summary["geocoded"],
        geocode_failed=summary["failed"],
        message=f"Inserted {len(new_members)} new member(s): "
                f"{summary['geocoded']} geocoded, {summary['failed']} failed.",
    )
