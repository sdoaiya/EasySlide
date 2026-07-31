"""Add lossless archive for tasks whose projects were already deleted.

Revision ID: 036_orphan_task_archive
Revises: 035_workspace_stage
"""

from alembic import op
import sqlalchemy as sa


revision = '036_orphan_task_archive'
down_revision = '035_workspace_stage'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        existing = {
            row[0] for row in bind.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        if 'orphan_task_archive' in existing:
            return
    op.create_table(
        'orphan_task_archive',
        sa.Column('original_task_id', sa.String(36), primary_key=True),
        sa.Column('original_project_id', sa.String(36), nullable=False),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('progress', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('archived_at', sa.DateTime(), nullable=False),
        sa.Column('reason', sa.String(50), nullable=False),
    )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        existing = {
            row[0] for row in bind.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        if 'orphan_task_archive' not in existing:
            return
    op.drop_table('orphan_task_archive')
