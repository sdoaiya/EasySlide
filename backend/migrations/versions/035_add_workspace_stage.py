"""Add the PPT workspace stage field.

Revision ID: 035_workspace_stage
Revises: 034_content_workspaces
"""

from alembic import op
import sqlalchemy as sa


revision = '035_workspace_stage'
down_revision = '034_content_workspaces'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        raw = bind.connection.driver_connection
        columns = {row[1] for row in raw.execute('PRAGMA table_info(project_workspaces)')}
        if 'stage' not in columns:
            raw.execute('ALTER TABLE project_workspaces ADD COLUMN stage TEXT')
        raw.execute(
            """UPDATE project_workspaces
               SET stage = (
                   SELECT status FROM projects WHERE projects.id = project_workspaces.project_id
               )
               WHERE kind = 'ppt' AND stage IS NULL"""
        )
        return
    op.add_column('project_workspaces', sa.Column('stage', sa.String(50), nullable=True))
    op.execute(
        """UPDATE project_workspaces
           SET stage = projects.status
           FROM projects
           WHERE project_workspaces.project_id = projects.id
             AND project_workspaces.kind = 'ppt'
             AND project_workspaces.stage IS NULL"""
    )


def downgrade():
    op.drop_column('project_workspaces', 'stage')
