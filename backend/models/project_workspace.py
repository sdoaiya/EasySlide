"""PPT, video, and podcast workspace state."""

import uuid
from datetime import datetime

from . import db


class ProjectWorkspace(db.Model):
    __tablename__ = 'project_workspaces'
    __table_args__ = (
        db.UniqueConstraint('project_id', 'kind', name='uq_project_workspaces_project_kind'),
        db.CheckConstraint("kind IN ('ppt', 'video', 'podcast')", name='ck_project_workspaces_kind'),
        db.CheckConstraint("state IN ('uninitialized', 'draft', 'ready', 'stale')", name='ck_project_workspaces_state'),
        db.CheckConstraint("source_kind IN ('spine', 'ppt', 'migration', 'manual')", name='ck_project_workspaces_source_kind'),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(
        db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    kind = db.Column(db.String(20), nullable=False)
    state = db.Column(db.String(20), nullable=False, default='uninitialized')
    stage = db.Column(db.String(50), nullable=True)
    revision = db.Column(db.Integer, nullable=False, default=0)
    current_version_id = db.Column(
        db.String(36),
        db.ForeignKey('workspace_versions.id', name='fk_project_workspaces_current_version_id', ondelete='SET NULL', use_alter=True),
        nullable=True,
    )
    source_kind = db.Column(db.String(20), nullable=False, default='manual')
    source_revision = db.Column(db.Integer, nullable=True)
    source_ref = db.Column(db.String(255), nullable=True)
    settings_json = db.Column(db.Text, nullable=True)
    document_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = db.relationship('Project', back_populates='workspaces')
    versions = db.relationship(
        'WorkspaceVersion',
        back_populates='workspace',
        foreign_keys='WorkspaceVersion.workspace_id',
        cascade='all, delete-orphan',
        order_by='WorkspaceVersion.revision',
    )
    current_version = db.relationship(
        'WorkspaceVersion',
        foreign_keys=[current_version_id],
        post_update=True,
    )
