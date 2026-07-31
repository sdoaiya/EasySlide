"""Add narration versions and page version state."""

from alembic import op
import sqlalchemy as sa


revision = '032_narration_versions'
down_revision = '031_narration_quality'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'narration_versions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('page_id', sa.String(length=36), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column(
            'mode',
            sa.Enum('single', 'dialogue', name='narration_mode', native_enum=False, create_constraint=True),
            nullable=False,
        ),
        sa.Column('language', sa.String(length=16), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('segments_json', sa.Text(), nullable=True),
        sa.Column(
            'source_type',
            sa.Enum(
                'manual', 'ai_generated', 'ai_polished', 'converted', 'legacy',
                name='narration_source_type', native_enum=False, create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.Enum(
                'candidate', 'applied', 'archived',
                name='narration_version_status', native_enum=False, create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column('parent_version_id', sa.String(length=36), nullable=True),
        sa.Column('ai_operation', sa.String(length=50), nullable=True),
        sa.Column('ai_config_json', sa.Text(), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('created_by', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['page_id'], ['pages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_version_id'], ['narration_versions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('page_id', 'version_number', name='uq_narration_versions_page_number'),
    )
    op.create_index('ix_narration_versions_page_id', 'narration_versions', ['page_id'], unique=False)

    with op.batch_alter_table('pages') as batch_op:
        batch_op.add_column(sa.Column('current_narration_version_id', sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column('narration_locked', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('narration_revision', sa.Integer(), server_default='0', nullable=False))
        batch_op.create_foreign_key(
            'fk_pages_current_narration_version_id',
            'narration_versions',
            ['current_narration_version_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade():
    with op.batch_alter_table('pages') as batch_op:
        batch_op.drop_constraint('fk_pages_current_narration_version_id', type_='foreignkey')
        batch_op.drop_column('narration_revision')
        batch_op.drop_column('narration_locked')
        batch_op.drop_column('current_narration_version_id')

    op.drop_index('ix_narration_versions_page_id', table_name='narration_versions')
    op.drop_table('narration_versions')
