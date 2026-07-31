"""Reviewable, revision-bound content synchronization proposal."""

import uuid
from datetime import datetime

from . import db


class ContentSyncProposal(db.Model):
    __tablename__ = 'content_sync_proposals'
    __table_args__ = (
        db.CheckConstraint("source_kind IN ('spine', 'ppt', 'video', 'podcast')", name='ck_sync_proposals_source_kind'),
        db.CheckConstraint("target_kind IN ('spine', 'ppt', 'video', 'podcast')", name='ck_sync_proposals_target_kind'),
        db.CheckConstraint("status IN ('pending', 'partially_applied', 'applied', 'rejected', 'stale')", name='ck_sync_proposals_status'),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(
        db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    source_kind = db.Column(db.String(20), nullable=False)
    target_kind = db.Column(db.String(20), nullable=False)
    source_revision = db.Column(db.Integer, nullable=False)
    target_base_revision = db.Column(db.Integer, nullable=False)
    diff_json = db.Column(db.Text, nullable=False)
    resolution_json = db.Column(db.Text, nullable=False, default='{}')
    reason = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(24), nullable=False, default='pending')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)

    project = db.relationship('Project', back_populates='sync_proposals')
