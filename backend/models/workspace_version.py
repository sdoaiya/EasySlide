"""Immutable workspace document and settings snapshots."""

import uuid
from datetime import datetime

from . import db


class WorkspaceVersion(db.Model):
    __tablename__ = 'workspace_versions'
    __table_args__ = (
        db.UniqueConstraint('workspace_id', 'revision', name='uq_workspace_versions_workspace_revision'),
        db.CheckConstraint("source_type IN ('manual', 'ai', 'sync', 'migration', 'restore')", name='ck_workspace_versions_source_type'),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = db.Column(
        db.String(36), db.ForeignKey('project_workspaces.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    revision = db.Column(db.Integer, nullable=False)
    document_json = db.Column(db.Text, nullable=False)
    settings_json = db.Column(db.Text, nullable=True)
    content_hash = db.Column(db.String(64), nullable=False)
    source_type = db.Column(db.String(20), nullable=False)
    parent_version_id = db.Column(
        db.String(36), db.ForeignKey('workspace_versions.id', ondelete='SET NULL'), nullable=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    workspace = db.relationship(
        'ProjectWorkspace', back_populates='versions', foreign_keys=[workspace_id],
    )
    parent_version = db.relationship(
        'WorkspaceVersion', remote_side=[id], foreign_keys=[parent_version_id],
    )
