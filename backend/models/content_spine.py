"""Shared semantic content spine for a content project."""

import uuid
from datetime import datetime

from . import db


class ContentSpine(db.Model):
    __tablename__ = 'content_spines'
    __table_args__ = (
        db.CheckConstraint("status IN ('draft', 'confirmed', 'stale')", name='ck_content_spines_status'),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(
        db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'),
        nullable=False, unique=True, index=True,
    )
    revision = db.Column(db.Integer, nullable=False, default=1)
    confirmed_revision = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default='draft')
    document_json = db.Column(db.Text, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = db.relationship('Project', back_populates='content_spine')
