"""add page template auto match fields"""

from alembic import op
import sqlalchemy as sa


revision = '029_page_template_match'
down_revision = '028_page_template_binding'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pages', sa.Column('template_selection_role', sa.String(length=40), nullable=True))
    op.add_column('pages', sa.Column('template_selection_layout', sa.String(length=40), nullable=True))
    op.add_column('pages', sa.Column('template_selection_source', sa.String(length=40), nullable=True))
    op.add_column('pages', sa.Column('template_match_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pages', 'template_match_reason')
    op.drop_column('pages', 'template_selection_source')
    op.drop_column('pages', 'template_selection_layout')
    op.drop_column('pages', 'template_selection_role')
