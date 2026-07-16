"""allow encrypted settings credentials

Revision ID: 024_encrypt_settings_secrets
Revises: 023_native_page_versions
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = "024_encrypt_settings_secrets"
down_revision = "023_native_page_versions"
branch_labels = None
depends_on = None


STRING_COLUMNS = (
    "api_key",
    "mineru_token",
    "baidu_api_key",
    "elevenlabs_api_key",
    "text_api_key",
    "image_api_key",
    "image_caption_api_key",
)

TEXT_COLUMNS = (
    "lazyllm_api_keys",
    "openai_oauth_access_token",
    "openai_oauth_refresh_token",
)


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        for column in STRING_COLUMNS:
            batch.alter_column(column, existing_type=sa.String(length=500), type_=sa.Text(), existing_nullable=True)
        for column in TEXT_COLUMNS:
            batch.alter_column(column, existing_type=sa.Text(), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        for column in STRING_COLUMNS:
            batch.alter_column(column, existing_type=sa.Text(), type_=sa.String(length=500), existing_nullable=True)
        for column in TEXT_COLUMNS:
            batch.alter_column(column, existing_type=sa.Text(), type_=sa.Text(), existing_nullable=True)
