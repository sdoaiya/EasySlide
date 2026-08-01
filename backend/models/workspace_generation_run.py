"""Persistent workspace generation runs (reconstruction plan §3.3).

One table carries the frozen source snapshot, generation parameters,
candidate document and publish relationship for direct video/podcast
generation and PPT-derived video. Formal workspace versions continue to
live in ``WorkspaceVersion``; ``ProjectWorkspace.current_version_id`` only
ever points to user-published versions.
"""

import uuid
from datetime import datetime

from . import db

GENERATION_RUN_STATUSES = (
    'PENDING', 'RUNNING', 'PAUSED', 'REVIEW_READY', 'PUBLISHING',
    'PUBLISHED', 'FAILED', 'CANCELLED', 'STALE',
)


class WorkspaceGenerationRun(db.Model):
    __tablename__ = 'workspace_generation_runs'
    __table_args__ = (
        db.CheckConstraint(
            "target_workspace_kind IN ('video', 'podcast')",
            name='ck_workspace_generation_runs_target_kind',
        ),
        db.CheckConstraint(
            "source_kind IN ('brief', 'ppt')",
            name='ck_workspace_generation_runs_source_kind',
        ),
        db.CheckConstraint(
            "mode IN ('direct', 'preserve', 'ai_adapt')",
            name='ck_workspace_generation_runs_mode',
        ),
        db.CheckConstraint(
            "operation IN ('generate', 'polish', 'shorten', 'expand', 'regenerate')",
            name='ck_workspace_generation_runs_operation',
        ),
        db.CheckConstraint(
            f"status IN {GENERATION_RUN_STATUSES}",
            name='ck_workspace_generation_runs_status',
        ),
        db.Index(
            'ix_workspace_generation_runs_project_target_status',
            'project_id', 'target_workspace_kind', 'status',
        ),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(
        db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    target_workspace_kind = db.Column(db.String(20), nullable=False)
    source_kind = db.Column(db.String(20), nullable=False)
    source_workspace_id = db.Column(db.String(36), nullable=True)
    source_version_id = db.Column(db.String(36), nullable=True)
    source_revision = db.Column(db.Integer, nullable=False, default=0)
    source_snapshot_json = db.Column(db.Text, nullable=False)
    source_snapshot_hash = db.Column(db.String(64), nullable=False)
    parent_run_id = db.Column(db.String(36), nullable=True, index=True)
    mode = db.Column(db.String(20), nullable=False)
    operation = db.Column(db.String(20), nullable=False)
    options_json = db.Column(db.Text, nullable=True)
    candidate_document_json = db.Column(db.Text, nullable=True)
    candidate_hash = db.Column(db.String(64), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='PENDING')
    task_id = db.Column(db.String(36), nullable=True, index=True)
    target_workspace_id = db.Column(db.String(36), nullable=False)
    published_version_id = db.Column(db.String(36), nullable=True)
    error_code = db.Column(db.String(60), nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = db.Column(db.DateTime, nullable=True)

    project = db.relationship('Project', back_populates='generation_runs')

    def to_dict(self) -> dict:
        return {
            'run_id': self.id,
            'project_id': self.project_id,
            'target_workspace_kind': self.target_workspace_kind,
            'source_kind': self.source_kind,
            'source_workspace_id': self.source_workspace_id,
            'source_version_id': self.source_version_id,
            'source_revision': self.source_revision,
            'source_snapshot_hash': self.source_snapshot_hash,
            'source_summary': _source_summary(self.source_snapshot_json),
            'parent_run_id': self.parent_run_id,
            'mode': self.mode,
            'operation': self.operation,
            'options': _loads(self.options_json),
            'candidate_hash': self.candidate_hash,
            'status': self.status,
            'task_id': self.task_id,
            'target_workspace_id': self.target_workspace_id,
            'published_version_id': self.published_version_id,
            'error_code': self.error_code,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
        }


def _loads(value):
    if not value:
        return None
    import json
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _source_summary(snapshot_json: str) -> dict:
    """Expose a bounded summary of the frozen source without dumping the document."""
    import json
    try:
        snapshot = json.loads(snapshot_json)
    except (TypeError, ValueError):
        return {}
    source_kind = snapshot.get('source_kind')
    if source_kind == 'ppt':
        pages = snapshot.get('pages') or []
        return {
            'workspace_id': snapshot.get('workspace_id'),
            'workspace_revision': snapshot.get('workspace_revision'),
            'page_count': len(pages),
            'page_ids': [page.get('page_id') for page in pages][:200],
            'project_title': snapshot.get('project_title'),
        }
    return {
        'title': snapshot.get('title'),
        'topic': snapshot.get('topic'),
        'revision': snapshot.get('revision'),
        'source_text_length': len(str(snapshot.get('source_text') or '')),
    }
