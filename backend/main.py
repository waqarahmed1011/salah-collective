import logging
import traceback
import uuid
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from database import SessionLocal
from geocoder import geocode_member_batch
from matcher import run_matching
from models import Member, MemberStatus
from routers import admin, sheets
from sheets_reader import get_new_sheet_rows

logger = logging.getLogger(__name__)

# ── Scheduled job ─────────────────────────────────────────────────────────────


def _scheduled_poll_and_match() -> None:
    """
    Full ingestion + matching pipeline, called every 15 minutes.

    Steps:
      1. Pull new signups from Google Sheets
      2. Insert them as members with status='unmatched'
      3. Flush so the matcher's SQL query can see them
      4. Geocode the new batch (respects 1 req/s rate limit)
      5. Run matching on all currently unmatched members
      6. Log a summary
    """
    db = SessionLocal()
    try:
        # ── Step 1 & 2: Ingest ────────────────────────────────────────────────
        new_rows = get_new_sheet_rows(db)
        new_members = []
        for row in new_rows:
            member = Member(id=uuid.uuid4(), status=MemberStatus.unmatched, **row)
            db.add(member)
            new_members.append(member)

        if new_members:
            # Flush so run_matching's DB query sees the new rows
            db.flush()
            logger.info("Inserted %d new member(s) from sheet.", len(new_members))

        # ── Step 3: Geocode ───────────────────────────────────────────────────
        geo_summary = {"geocoded": 0, "failed": 0}
        if new_members:
            geo_summary = geocode_member_batch(new_members)

        # ── Step 4: Match (always, regardless of geocoding outcome) ───────────
        match_summary = run_matching(db, triggered_by="scheduler")

        logger.info(
            "Scheduled run complete | "
            "new=%d geocoded=%d geocode_failed=%d | "
            "groups_formed=%d matched=%d waitlisted=%d | "
            "run_id=%s",
            len(new_members),
            geo_summary["geocoded"],
            geo_summary["failed"],
            match_summary["groups_formed"],
            match_summary["members_matched"],
            match_summary["members_waitlisted"],
            match_summary["run_id"],
        )

    except Exception:
        logger.exception("Scheduled poll-and-match job failed; rolling back.")
        db.rollback()
    finally:
        db.close()


# ── Scheduler error/miss listeners ────────────────────────────────────────────


def _on_job_error(event) -> None:
    logger.error("Scheduler job %s raised an exception: %s", event.job_id, event.exception)


def _on_job_missed(event) -> None:
    logger.warning(
        "Scheduler job %s missed its fire time (previous run still in progress or "
        "server was down).",
        event.job_id,
    )


# ── Scheduler setup ───────────────────────────────────────────────────────────

_scheduler = BackgroundScheduler()
_scheduler.add_listener(_on_job_error, EVENT_JOB_ERROR)
_scheduler.add_listener(_on_job_missed, EVENT_JOB_MISSED)
_scheduler.add_job(
    _scheduled_poll_and_match,
    trigger="interval",
    minutes=15,
    id="poll_and_match",
    max_instances=1,
    # Replace on reload so a second add_job call doesn't create duplicates
    replace_existing=True,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _scheduler.start()
    logger.info("APScheduler started; poll-and-match runs every 15 minutes.")
    yield
    _scheduler.shutdown(wait=True)
    logger.info("APScheduler shut down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Salah Collective API",
    description="Carpool matching platform for Dar us Salaam masjid",
    version="0.1.0",
    lifespan=lifespan,
)

_origins = ["http://localhost:3000"]
if settings.FRONTEND_URL:
    _origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(sheets.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )


@app.get("/health", tags=["meta"])
def health_check():
    return {"status": "ok"}
