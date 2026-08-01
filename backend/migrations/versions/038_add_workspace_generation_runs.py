"""Add workspace generation runs.

Revision ID: 038_workspace_generation_runs
Revises: 037_remove_legacy_project_fields
"""

from alembic import op
import sqlalchemy as sa

revision = '038_workspace_generation_runs'
down_revision = '037_remove_legacy_project_fields'
branch_labels = None
depends_on = None

_STATUSES = (
    'PENDING', 'RUNNING', 'PAUSED', 'REVIEW_READY', 'PUBLISHING',
    'PUBLISHED', 'FAILED', 'CANCELLED', 'STALE',
)


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        # SQLite schema lives in the idempotent offline migration service.
        from services.content_project_migration import ensure_sqlite_content_project_schema

        raw_connection = bind.connection.driver_connection
        with raw_connection:
            ensure_sqlite_content_project_schema(raw_connection)
        return
    op.create_table(
        'workspace_generation_runs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_workspace_kind', sa.String(20), nullable=False),
        sa.Column('source_kind', sa.String(20), nullable=False),
        sa.Column('source_workspace_id', sa.String(36), nullable=True),
        sa.Column('source_version_id', sa.String(36), nullable=True),
        sa.Column('source_revision', sa.Integer(), nullable=False),
        sa.Column('source_snapshot_json', sa.Text(), nullable=False),
        sa.Column('source_snapshot_hash', sa.String(64), nullable=False),
        sa.Column('parent_run_id', sa.String(36), nullable=True),
        sa.Column('mode', sa.String(20), nullable=False),
        sa.Column('operation', sa.String(20), nullable=False),
        sa.Column('options_json', sa.Text(), nullable=True),
        sa.Column('candidate_document_json', sa.Text(), nullable=True),
        sa.Column('candidate_hash', sa.String(64), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('task_id', sa.String(36), nullable=True),
        sa.Column('target_workspace_id', sa.String(36), nullable=False),
        sa.Column('published_version_id', sa.String(36), nullable=True),
        sa.Column('error_code', sa.String(60), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "target_workspace_kind IN ('video', 'podcast')",
            name='ck_workspace_generation_runs_target_kind',
        ),
        sa.CheckConstraint(
            "source_kind IN ('brief', 'ppt')",
            name='ck_workspace_generation_runs_source_kind',
        ),
        sa.CheckConstraint(
            "mode IN ('direct', 'preserve', 'ai_adapt')",
            name='ck_workspace_generation_runs_mode',
        ),
        sa.CheckConstraint(
            "operation IN ('generate', 'polish', 'shorten', 'expand', 'regenerate')",
            name='ck_workspace_generation_runs_operation',
        ),
        sa.CheckConstraint(
            f"status IN {_STATUSES}",
            name='ck_workspace_generation_runs_status',
        ),
    )
    op.create_index(
        'ix_workspace_generation_runs_project_id',
        'workspace_generation_runs', ['project_id'],
    )
    op.create_index(
        'ix_workspace_generation_runs_task_id',
        'workspace_generation_runs', ['task_id'],
    )
    op.create_index(
        'ix_workspace_generation_runs_parent_run_id',
        'workspace_generation_runs', ['parent_run_id'],
    )
    op.create_index(
        'ix_workspace_generation_runs_project_target_status',
        'workspace_generation_runs', ['project_id', 'target_workspace_kind', 'status'],
    )


def downgrade():
    raise RuntimeError(
        'workspace_generation_runs 迁移不可逆：候选与发布关系属于历史记录，'
        '回滚请使用迁移前的时间戳备份。'
    )
