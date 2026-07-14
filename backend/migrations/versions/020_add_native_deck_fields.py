"""add native deck fields

Revision ID: 020_native_deck_fields
Revises: 019_export_high_fidelity
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa


revision = '020_native_deck_fields'
down_revision = '019_export_high_fidelity'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column('render_mode', sa.String(length=20), nullable=False, server_default='image'),
    )
    op.add_column('projects', sa.Column('native_theme', sa.String(length=100), nullable=True))
    op.add_column('pages', sa.Column('native_layout', sa.String(length=100), nullable=True))
    op.add_column('pages', sa.Column('native_props', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pages', 'native_props')
    op.drop_column('pages', 'native_layout')
    op.drop_column('projects', 'native_theme')
    op.drop_column('projects', 'render_mode')
