"""add optional template pack identity to projects

Revision ID: 022_template_pack_id
Revises: 021_native_image_settings
Create Date: 2026-07-15
"""

from alembic import op
import sqlalchemy as sa


revision = '022_template_pack_id'
down_revision = '021_native_image_settings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('template_pack_id', sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'template_pack_id')
