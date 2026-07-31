"""remove retired TTS provider settings

Revision ID: 025_remove_retired_tts
Revises: 024_encrypt_settings_secrets
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa


revision = "025_remove_retired_tts"
down_revision = "024_encrypt_settings_secrets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        batch.drop_column("elevenlabs_voice_id")
        batch.drop_column("elevenlabs_api_key")
        batch.drop_column("elevenlabs_enabled")


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        batch.add_column(sa.Column("elevenlabs_enabled", sa.Boolean(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("elevenlabs_api_key", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("elevenlabs_voice_id", sa.String(length=100), nullable=True))
