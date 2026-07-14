"""add native image settings

Revision ID: 021_native_image_settings
Revises: 020_native_deck_fields
Create Date: 2026-07-12
"""

from alembic import op
import sqlalchemy as sa


revision = '021_native_image_settings'
down_revision = '020_native_deck_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('native_image_settings', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'native_image_settings')
