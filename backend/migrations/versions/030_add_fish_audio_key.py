"""add encrypted Fish Audio API key setting"""

from alembic import op
import sqlalchemy as sa


revision = '030_fish_audio_key'
down_revision = '029_page_template_match'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('settings', sa.Column('fish_audio_api_key', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('settings', 'fish_audio_api_key')
