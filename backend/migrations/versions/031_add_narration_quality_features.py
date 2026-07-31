"""Add project narration preferences and reusable Fish Audio voice assets."""

from alembic import op
import sqlalchemy as sa


revision = '031_narration_quality'
down_revision = '030_fish_audio_key'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('pronunciation_lexicon', sa.Text(), nullable=True))
    op.add_column('projects', sa.Column('narration_preferences', sa.Text(), nullable=True))
    op.add_column('settings', sa.Column('fish_audio_voice_assets', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('settings', 'fish_audio_voice_assets')
    op.drop_column('projects', 'narration_preferences')
    op.drop_column('projects', 'pronunciation_lexicon')
