"""add page template binding fields"""

from alembic import op
import sqlalchemy as sa


revision = '028_page_template_binding'
down_revision = '027_image_quality_control'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pages', sa.Column('template_image_path', sa.String(length=500), nullable=True))
    op.add_column('pages', sa.Column('template_style_text', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pages', 'template_style_text')
    op.drop_column('pages', 'template_image_path')
