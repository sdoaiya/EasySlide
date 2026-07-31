"""Add unified content spine and project workspaces.

Revision ID: 034_content_workspaces
Revises: 033_image_scene_fields
"""

from alembic import op
import sqlalchemy as sa

revision = '034_content_workspaces'
down_revision = '033_image_scene_fields'
branch_labels = None
depends_on = None


def upgrade():
    from services.content_project_migration import (
        migrate_connection,
        migrate_sqlalchemy_connection,
    )

    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        raw_connection = bind.connection.driver_connection
        with raw_connection:
            migrate_connection(raw_connection, update_alembic=False)
        return
    _upgrade_non_sqlite()
    migrate_sqlalchemy_connection(bind)


def _upgrade_non_sqlite():
    op.add_column('projects', sa.Column(
        'schema_version', sa.Integer(), nullable=False, server_default='1',
    ))
    op.add_column('projects', sa.Column('last_workspace', sa.String(20), nullable=True))
    op.add_column('projects', sa.Column('migration_state', sa.String(30), nullable=True))
    op.add_column('projects', sa.Column('project_settings_json', sa.Text(), nullable=True))
    op.add_column('materials', sa.Column(
        'media_kind', sa.String(20), nullable=False, server_default='image',
    ))
    op.add_column('materials', sa.Column(
        'purpose', sa.String(30), nullable=False, server_default='image',
    ))
    op.add_column('materials', sa.Column('mime_type', sa.String(100), nullable=True))
    op.add_column('materials', sa.Column('duration_ms', sa.Integer(), nullable=True))
    op.add_column('materials', sa.Column('source_note', sa.Text(), nullable=True))
    op.add_column('materials', sa.Column('license_status', sa.String(30), nullable=True))

    op.create_table(
        'content_spines',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('confirmed_revision', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('document_json', sa.Text(), nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'confirmed', 'stale')",
            name='ck_content_spines_status',
        ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('project_id', name='uq_content_spines_project_id'),
    )
    op.create_index('ix_content_spines_project_id', 'content_spines', ['project_id'])

    op.create_table(
        'project_workspaces',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('state', sa.String(20), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('current_version_id', sa.String(36), nullable=True),
        sa.Column('source_kind', sa.String(20), nullable=False),
        sa.Column('source_revision', sa.Integer(), nullable=True),
        sa.Column('source_ref', sa.String(255), nullable=True),
        sa.Column('settings_json', sa.Text(), nullable=True),
        sa.Column('document_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('ppt', 'video', 'podcast')",
            name='ck_project_workspaces_kind',
        ),
        sa.CheckConstraint(
            "state IN ('uninitialized', 'draft', 'ready', 'stale')",
            name='ck_project_workspaces_state',
        ),
        sa.CheckConstraint(
            "source_kind IN ('spine', 'ppt', 'migration', 'manual')",
            name='ck_project_workspaces_source_kind',
        ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.UniqueConstraint(
            'project_id', 'kind', name='uq_project_workspaces_project_kind',
        ),
    )
    op.create_index('ix_project_workspaces_project_id', 'project_workspaces', ['project_id'])

    op.create_table(
        'workspace_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workspace_id', sa.String(36), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('document_json', sa.Text(), nullable=False),
        sa.Column('settings_json', sa.Text(), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('source_type', sa.String(20), nullable=False),
        sa.Column('parent_version_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "source_type IN ('manual', 'ai', 'sync', 'migration', 'restore')",
            name='ck_workspace_versions_source_type',
        ),
        sa.ForeignKeyConstraint(
            ['workspace_id'], ['project_workspaces.id'], ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['parent_version_id'], ['workspace_versions.id'], ondelete='SET NULL',
        ),
        sa.UniqueConstraint(
            'workspace_id', 'revision',
            name='uq_workspace_versions_workspace_revision',
        ),
    )
    op.create_index('ix_workspace_versions_workspace_id', 'workspace_versions', ['workspace_id'])
    op.create_foreign_key(
        'fk_project_workspaces_current_version_id',
        'project_workspaces',
        'workspace_versions',
        ['current_version_id'],
        ['id'],
        ondelete='SET NULL',
    )

    op.create_table(
        'content_sync_proposals',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), nullable=False),
        sa.Column('source_kind', sa.String(20), nullable=False),
        sa.Column('target_kind', sa.String(20), nullable=False),
        sa.Column('source_revision', sa.Integer(), nullable=False),
        sa.Column('target_base_revision', sa.Integer(), nullable=False),
        sa.Column('diff_json', sa.Text(), nullable=False),
        sa.Column('resolution_json', sa.Text(), nullable=False),
        sa.Column('reason', sa.String(255), nullable=True),
        sa.Column('status', sa.String(24), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "source_kind IN ('spine', 'ppt', 'video', 'podcast')",
            name='ck_sync_proposals_source_kind',
        ),
        sa.CheckConstraint(
            "target_kind IN ('spine', 'ppt', 'video', 'podcast')",
            name='ck_sync_proposals_target_kind',
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'partially_applied', 'applied', 'rejected', 'stale')",
            name='ck_sync_proposals_status',
        ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    op.create_index(
        'ix_content_sync_proposals_project_id',
        'content_sync_proposals',
        ['project_id'],
    )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        op.drop_table('content_sync_proposals')
        op.drop_constraint(
            'fk_project_workspaces_current_version_id',
            'project_workspaces',
            type_='foreignkey',
        )
        op.drop_table('workspace_versions')
        op.drop_table('project_workspaces')
        op.drop_table('content_spines')
        for column in (
            'license_status', 'source_note', 'duration_ms', 'mime_type',
            'purpose', 'media_kind',
        ):
            op.drop_column('materials', column)
        for column in (
            'project_settings_json', 'migration_state', 'last_workspace',
            'schema_version',
        ):
            op.drop_column('projects', column)
        return
    raw_connection = bind.connection.driver_connection
    raw_connection.execute('PRAGMA foreign_keys = OFF')
    try:
        raw_connection.executescript(
            """
            DROP TABLE IF EXISTS content_sync_proposals;
            DROP TABLE IF EXISTS workspace_versions;
            DROP TABLE IF EXISTS project_workspaces;
            DROP TABLE IF EXISTS content_spines;
            """
        )
    finally:
        raw_connection.execute('PRAGMA foreign_keys = ON')
