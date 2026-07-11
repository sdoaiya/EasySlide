"""add export_high_fidelity_editable to projects

Revision ID: 019_export_high_fidelity
Revises: 018_add_project_title
Create Date: 2026-07-10
"""

from alembic import op
import sqlalchemy as sa


revision = '019_export_high_fidelity'
down_revision = '018_add_project_title'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column(
            'export_high_fidelity_editable',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column('projects', 'export_high_fidelity_editable')
