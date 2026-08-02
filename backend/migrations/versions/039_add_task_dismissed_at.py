"""Add persistent task dismissal.

Revision ID: 039_task_dismissed_at
Revises: 038_workspace_generation_runs
"""

from alembic import op
import sqlalchemy as sa


revision = '039_task_dismissed_at'
down_revision = '038_workspace_generation_runs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('dismissed_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('tasks') as batch_op:
        batch_op.drop_column('dismissed_at')
