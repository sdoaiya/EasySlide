"""persist native editable page versions

Revision ID: 023_native_page_versions
Revises: 022_template_pack_id
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = '023_native_page_versions'
down_revision = '022_template_pack_id'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pages', sa.Column('native_versions', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pages', 'native_versions')
