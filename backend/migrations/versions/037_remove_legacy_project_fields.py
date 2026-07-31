"""Remove Project columns replaced by Spine and workspace settings.

Revision ID: 037_remove_legacy_project_fields
Revises: 036_orphan_task_archive
"""

from alembic import op


revision = '037_remove_legacy_project_fields'
down_revision = '036_orphan_task_archive'
branch_labels = None
depends_on = None

LEGACY_COLUMNS = (
    'idea_prompt', 'outline_text', 'description_text',
    'render_mode', 'native_theme', 'native_image_settings',
    'pronunciation_lexicon', 'narration_preferences', 'image_aspect_ratio',
)


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == 'sqlite':
        columns = {row[1] for row in bind.exec_driver_sql('PRAGMA table_info(projects)')}
        for name in LEGACY_COLUMNS:
            if name in columns:
                bind.exec_driver_sql(f'ALTER TABLE projects DROP COLUMN {name}')
        return
    for name in LEGACY_COLUMNS:
        op.drop_column('projects', name)


def downgrade():
    raise RuntimeError(
        'Legacy Project fields cannot be reconstructed. Restore the pre-cutover backup.'
    )
