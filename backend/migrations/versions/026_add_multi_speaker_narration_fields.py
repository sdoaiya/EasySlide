"""add structured narration and audio cache metadata to pages"""

from alembic import op
import sqlalchemy as sa


revision = '026_multi_speaker_narration'
down_revision = '025_remove_retired_tts'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pages', sa.Column('narration_segments', sa.Text(), nullable=True))
    op.add_column('pages', sa.Column('narration_source_hash', sa.String(length=64), nullable=True))
    op.add_column('pages', sa.Column('narration_config_hash', sa.String(length=64), nullable=True))
    op.add_column('pages', sa.Column('narration_status', sa.String(length=32), nullable=True))
    op.add_column('pages', sa.Column('narration_audio_manifest', sa.Text(), nullable=True))
    op.add_column('pages', sa.Column('narration_error', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pages', 'narration_error')
    op.drop_column('pages', 'narration_audio_manifest')
    op.drop_column('pages', 'narration_status')
    op.drop_column('pages', 'narration_config_hash')
    op.drop_column('pages', 'narration_source_hash')
    op.drop_column('pages', 'narration_segments')
