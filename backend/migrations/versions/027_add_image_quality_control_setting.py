"""add image quality control setting"""

from alembic import op
import sqlalchemy as sa


revision = '027_image_quality_control'
down_revision = '026_multi_speaker_narration'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'settings',
        sa.Column('enable_image_quality_control', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('settings', 'enable_image_quality_control')
