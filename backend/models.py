import uuid
import enum
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Boolean, Float, Integer, Text, ForeignKey, DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class MemberStatus(str, enum.Enum):
    unmatched = "unmatched"
    matched = "matched"
    waitlisted = "waitlisted"
    geocode_failed = "geocode_failed"


class SalahGroup(Base):
    __tablename__ = "salah_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lng: Mapped[float] = mapped_column(Float, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    members: Mapped[List["Member"]] = relationship("Member", back_populates="group")


class Member(Base):
    __tablename__ = "members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    address_raw: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fajr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    zuhr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    asr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    maghrib: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    isha: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_car: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[MemberStatus] = mapped_column(
        SAEnum(MemberStatus, native_enum=False),
        nullable=False,
        default=MemberStatus.unmatched,
    )
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("salah_groups.id"), nullable=True
    )
    signed_up_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    group: Mapped[Optional["SalahGroup"]] = relationship(
        "SalahGroup", back_populates="members"
    )


class MatchingRun(Base):
    __tablename__ = "matching_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_type: Mapped[str] = mapped_column(String, nullable=False)
    triggered_by: Mapped[str] = mapped_column(String, nullable=False)
    members_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    groups_formed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    members_matched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    members_waitlisted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
