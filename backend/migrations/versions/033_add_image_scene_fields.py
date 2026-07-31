"""Bind image scene artifacts to page image versions."""

from alembic import op
import sqlalchemy as sa


revision = '033_image_scene_fields'
down_revision = '032_narration_versions'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('page_image_versions') as batch_op:
        batch_op.add_column(sa.Column('scene_manifest_path', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('scene_manifest_sha256', sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column('scene_status', sa.String(length=20), server_default='missing', nullable=False)
        )
        batch_op.add_column(sa.Column('scene_quality_score', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('scene_schema_version', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('scene_error', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('page_image_versions') as batch_op:
        batch_op.drop_column('scene_error')
        batch_op.drop_column('scene_schema_version')
        batch_op.drop_column('scene_quality_score')
        batch_op.drop_column('scene_status')
        batch_op.drop_column('scene_manifest_sha256')
        batch_op.drop_column('scene_manifest_path')
