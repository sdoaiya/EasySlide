"""
Project model
"""
import json
import uuid
from datetime import datetime
from sqlalchemy import event
from . import db


DEFAULT_NATIVE_IMAGE_SETTINGS = {
    'density': 'standard',
    'style': 'theme',
    'composition': 'auto',
    'palette': 'default',
    'custom_palette': {},
    'chart_theme': 'clean',
    'media_style': 'auto',
    'tone': 'strategy',
    'custom_prompt': '',
    'custom_counts': {},
}
NATIVE_IMAGE_DENSITIES = {'sparse', 'standard', 'rich', 'custom'}
NATIVE_IMAGE_STYLES = {'theme', 'photo', '3d', 'flat', 'tech', 'custom'}
NATIVE_IMAGE_COMPOSITIONS = {'auto', 'center', 'text-left', 'text-right', 'full-bleed'}
NATIVE_VISUAL_PALETTES = {'default', 'enterprise_blue', 'teal', 'black_gold', 'orange_gray', 'custom'}
NATIVE_CHART_THEMES = {'clean', 'consulting', 'contrast', 'executive'}
NATIVE_MEDIA_STYLES = {'auto', 'photo', 'illustration', 'product', 'none'}
NATIVE_TONES = {'strategy', 'sales', 'government', 'technical', 'research'}
NATIVE_CUSTOM_PALETTE_KEYS = {'accent', 'secondary', 'surface', 'text'}


def normalize_native_image_settings(value):
    if value is None:
        return dict(DEFAULT_NATIVE_IMAGE_SETTINGS)
    if not isinstance(value, dict):
        raise ValueError('native_image_settings must be an object')
    unknown = set(value) - set(DEFAULT_NATIVE_IMAGE_SETTINGS)
    if unknown:
        raise ValueError(f"native_image_settings contains unknown fields: {', '.join(sorted(unknown))}")
    settings = {**DEFAULT_NATIVE_IMAGE_SETTINGS, **value}
    if settings['density'] not in NATIVE_IMAGE_DENSITIES:
        raise ValueError('Invalid native image density')
    if settings['style'] not in NATIVE_IMAGE_STYLES:
        raise ValueError('Invalid native image style')
    if settings['composition'] not in NATIVE_IMAGE_COMPOSITIONS:
        raise ValueError('Invalid native image composition')
    if settings['palette'] not in NATIVE_VISUAL_PALETTES:
        raise ValueError('Invalid native visual palette')
    if settings['chart_theme'] not in NATIVE_CHART_THEMES:
        raise ValueError('Invalid native chart theme')
    if settings['media_style'] not in NATIVE_MEDIA_STYLES:
        raise ValueError('Invalid native media style')
    if settings['tone'] not in NATIVE_TONES:
        raise ValueError('Invalid native tone')
    if not isinstance(settings['custom_palette'], dict):
        raise ValueError('native custom_palette must be an object')
    unknown_colors = set(settings['custom_palette']) - NATIVE_CUSTOM_PALETTE_KEYS
    if unknown_colors:
        raise ValueError(f"native custom_palette contains unknown fields: {', '.join(sorted(unknown_colors))}")
    if any(not _is_hex_color(color) for color in settings['custom_palette'].values()):
        raise ValueError('native custom_palette colors must be #RRGGBB')
    if not isinstance(settings['custom_prompt'], str) or len(settings['custom_prompt']) > 2000:
        raise ValueError('native image custom_prompt must be text within 2000 characters')
    if not isinstance(settings['custom_counts'], dict) or any(
        not isinstance(page_id, str) or isinstance(count, bool) or not isinstance(count, int) or count < 0 or count > 10
        for page_id, count in settings['custom_counts'].items()
    ):
        raise ValueError('native image custom_counts must map page ids to counts from 0 to 10')
    return settings


def _is_hex_color(value):
    return (
        isinstance(value, str)
        and len(value) == 7
        and value.startswith('#')
        and all(char in '0123456789abcdefABCDEF' for char in value[1:])
    )


_LEGACY_CONTENT_PROJECT_FIELDS = {
    'idea_prompt', 'outline_text', 'description_text',
    'render_mode', 'native_theme', 'native_image_settings', 'image_aspect_ratio',
}


def _canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

class Project(db.Model):
    """
    Project model - represents a PPT project
    """
    __tablename__ = 'projects'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_title = db.Column(db.String(255), nullable=True)
    extra_requirements = db.Column(db.Text, nullable=True)  # 额外要求，应用到每个页面的AI提示词
    outline_requirements = db.Column(db.Text, nullable=True)  # 大纲生成要求
    description_requirements = db.Column(db.Text, nullable=True)  # 页面描述生成要求
    creation_type = db.Column(db.String(20), nullable=False, default='idea')  # idea|outline|descriptions
    template_image_path = db.Column(db.String(500), nullable=True)
    template_style = db.Column(db.Text, nullable=True)  # 风格描述文本（无模板图模式）
    template_pack_id = db.Column(db.String(120), nullable=True)  # 内置模板包标识，旧项目为空
    # 导出设置
    export_extractor_method = db.Column(db.String(50), nullable=True, default='hybrid')  # 组件提取方法: mineru, hybrid
    export_inpaint_method = db.Column(db.String(50), nullable=True, default='hybrid')  # 背景图获取方法: generative, baidu, hybrid
    export_allow_partial = db.Column(db.Boolean, nullable=True, default=False)  # 是否允许返回半成品（导出出错时继续而非停止）
    export_high_fidelity_editable = db.Column(db.Boolean, nullable=False, default=False)  # 高保真可编辑导出（高级开关，默认关闭）
    enable_icon_subject_extraction = db.Column(db.Boolean, nullable=True, default=False)  # 已废弃
    schema_version = db.Column(db.Integer, nullable=False, server_default='1', default=1)
    last_workspace = db.Column(db.String(20), nullable=True)
    migration_state = db.Column(db.String(30), nullable=True)
    project_settings_json = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), nullable=False, default='DRAFT')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    # 使用 'select' 策略支持 eager loading，同时保持灵活性
    pages = db.relationship('Page', back_populates='project', lazy='select', 
                           cascade='all, delete-orphan', order_by='Page.order_index')
    tasks = db.relationship('Task', back_populates='project', lazy='select',
                           cascade='all, delete-orphan')
    materials = db.relationship('Material', back_populates='project', lazy='select',
                           cascade='all, delete-orphan')
    content_spine = db.relationship(
        'ContentSpine', back_populates='project', uselist=False, cascade='all, delete-orphan',
    )
    workspaces = db.relationship(
        'ProjectWorkspace', back_populates='project', cascade='all, delete-orphan',
    )
    sync_proposals = db.relationship(
        'ContentSyncProposal', back_populates='project', cascade='all, delete-orphan',
    )

    def __init__(self, **kwargs):
        legacy = {key: kwargs.pop(key) for key in list(kwargs) if key in _LEGACY_CONTENT_PROJECT_FIELDS}
        for key, value in kwargs.items():
            if not hasattr(type(self), key):
                raise TypeError(f"'{key}' is an invalid keyword argument for Project")
            setattr(self, key, value)
        if legacy:
            self._legacy_content_project = legacy
    def _get_legacy_source_field(self, key):
        if self.content_spine:
            try:
                document = json.loads(self.content_spine.document_json)
            except (TypeError, json.JSONDecodeError):
                return ''
            kind = {
                'idea_prompt': 'prompt',
                'outline_text': 'outline',
                'description_text': 'description',
            }[key]
            source = next(
                (item for item in document.get('sources', []) if item.get('kind') == kind),
                None,
            )
            return source.get('content', '') if source else ''
        return getattr(self, '_legacy_content_project', {}).get(key, '')

    def _set_legacy_source_field(self, key, value):
        legacy = dict(getattr(self, '_legacy_content_project', {}))
        legacy[key] = value
        self._legacy_content_project = legacy

    @property
    def idea_prompt(self):
        return self._get_legacy_source_field('idea_prompt')

    @idea_prompt.setter
    def idea_prompt(self, value):
        self._set_legacy_source_field('idea_prompt', value)

    @property
    def outline_text(self):
        return self._get_legacy_source_field('outline_text')

    @outline_text.setter
    def outline_text(self, value):
        self._set_legacy_source_field('outline_text', value)

    @property
    def description_text(self):
        return self._get_legacy_source_field('description_text')

    @description_text.setter
    def description_text(self, value):
        self._set_legacy_source_field('description_text', value)
    def _get_legacy_ppt_setting(self, key, default=None):
        workspace = next((item for item in self.workspaces if item.kind == 'ppt'), None)
        if workspace and workspace.settings_json:
            try:
                return json.loads(workspace.settings_json).get(key, default)
            except (TypeError, json.JSONDecodeError):
                return default
        return getattr(self, '_legacy_content_project', {}).get(key, default)

    def _set_legacy_ppt_setting(self, key, value):
        workspace = next((item for item in self.workspaces if item.kind == 'ppt'), None)
        if workspace:
            try:
                settings = json.loads(workspace.settings_json or '{}')
            except (TypeError, json.JSONDecodeError):
                settings = {}
            if key == 'render_mode' and settings.get('render_mode') and value != settings.get('render_mode'):
                return
            if key == 'native_theme' and value is None and settings.get('native_theme'):
                return
            settings[key] = value
            workspace.settings_json = _canonical_json(settings)
            return
        legacy = dict(getattr(self, '_legacy_content_project', {}))
        legacy[key] = value
        self._legacy_content_project = legacy

    @property
    def render_mode(self):
        return self._get_legacy_ppt_setting('render_mode', 'image')

    @render_mode.setter
    def render_mode(self, value):
        self._set_legacy_ppt_setting('render_mode', value)

    @property
    def native_theme(self):
        return self._get_legacy_ppt_setting('native_theme')

    @native_theme.setter
    def native_theme(self, value):
        self._set_legacy_ppt_setting('native_theme', value)

    @property
    def native_image_settings(self):
        return self._get_legacy_ppt_setting('native_image_settings')

    @native_image_settings.setter
    def native_image_settings(self, value):
        self._set_legacy_ppt_setting('native_image_settings', value)

    @property
    def image_aspect_ratio(self):
        return self._get_legacy_ppt_setting('image_aspect_ratio', '16:9')

    @image_aspect_ratio.setter
    def image_aspect_ratio(self, value):
        self._set_legacy_ppt_setting('image_aspect_ratio', value)
    def set_native_image_settings(self, value):
        self.native_image_settings = normalize_native_image_settings(value)
    def _get_project_settings(self):
        try:
            value = json.loads(self.project_settings_json or '{}')
            return value if isinstance(value, dict) else {}
        except (TypeError, json.JSONDecodeError):
            return {}

    def _set_project_setting(self, key, value):
        settings = self._get_project_settings()
        settings[key] = value
        self.project_settings_json = json.dumps(
            settings, ensure_ascii=False, sort_keys=True, separators=(',', ':')
        )

    def get_pronunciation_lexicon(self):
        from services.narration_service import normalize_pronunciation_entries

        try:
            return normalize_pronunciation_entries(
                self._get_project_settings().get('pronunciation_lexicon', [])
            )
        except ValueError:
            return []

    def set_pronunciation_lexicon(self, value):
        from services.narration_service import normalize_pronunciation_entries

        self._set_project_setting(
            'pronunciation_lexicon', normalize_pronunciation_entries(value)
        )

    def get_narration_preferences(self):
        from services.narration_service import normalize_narration_preferences

        try:
            return normalize_narration_preferences(
                self._get_project_settings().get('narration_preferences', {})
            )
        except ValueError:
            return normalize_narration_preferences({})

    def set_narration_preferences(self, value):
        from services.narration_service import normalize_narration_preferences

        self._set_project_setting(
            'narration_preferences', normalize_narration_preferences(value)
        )
    
    def to_dict(self, include_pages=False):
        """Convert to dictionary"""
        # Format created_at and updated_at with UTC timezone indicator for proper frontend parsing
        created_at_str = None
        if self.created_at:
            created_at_str = self.created_at.isoformat() + 'Z' if not self.created_at.tzinfo else self.created_at.isoformat()
        
        updated_at_str = None
        if self.updated_at:
            updated_at_str = self.updated_at.isoformat() + 'Z' if not self.updated_at.tzinfo else self.updated_at.isoformat()
        
        def workspace_summary(workspace):
            cover_url = None
            if workspace.document_json:
                try:
                    document = json.loads(workspace.document_json)
                    if workspace.kind == 'video':
                        scenes = document.get('scenes') or []
                        cover_url = scenes[0].get('visual', {}).get('source_ref') if scenes else None
                    elif workspace.kind == 'podcast':
                        cover_url = document.get('cover', {}).get('asset_ref')
                except (TypeError, json.JSONDecodeError):
                    pass
            return {
                'id': workspace.id,
                'project_id': workspace.project_id,
                'kind': workspace.kind,
                'state': workspace.state,
                'stage': workspace.stage,
                'revision': workspace.revision,
                'current_version_id': workspace.current_version_id,
                'source_kind': workspace.source_kind,
                'source_revision': workspace.source_revision,
                'settings': json.loads(workspace.settings_json or '{}'),
                'cover_url': cover_url,
            }

        from services.content_spine_service import get_spine_source_fields
        from services.ppt_workspace_service import get_ppt_settings, get_ppt_status

        ppt_settings = get_ppt_settings(self)
        spine_fields = get_spine_source_fields(self)
        data = {
            'project_id': self.id,
            'project_title': self.project_title,
            'idea_prompt': spine_fields['idea_prompt'],
            'outline_text': spine_fields['outline_text'],
            'description_text': spine_fields['description_text'],
            'extra_requirements': self.extra_requirements,
            'outline_requirements': self.outline_requirements,
            'description_requirements': self.description_requirements,
            'creation_type': self.creation_type,
            'render_mode': ppt_settings['render_mode'],
            'native_theme': ppt_settings['native_theme'],
            'native_image_settings': ppt_settings['native_image_settings'],
            'pronunciation_lexicon': self.get_pronunciation_lexicon(),
            'narration_preferences': self.get_narration_preferences(),
            'template_image_url': f'/files/{self.id}/template/{self.template_image_path.split("/")[-1]}' if self.template_image_path else None,
            'template_style': self.template_style,
            'template_pack_id': self.template_pack_id,
            'export_extractor_method': self.export_extractor_method or 'hybrid',
            'export_inpaint_method': self.export_inpaint_method or 'hybrid',
            'export_allow_partial': self.export_allow_partial or False,
            'export_high_fidelity_editable': self.export_high_fidelity_editable or False,
            'enable_icon_subject_extraction': False,
            'image_aspect_ratio': ppt_settings['image_aspect_ratio'],
            'schema_version': self.schema_version,
            'last_workspace': self.last_workspace,
            'workspaces': [workspace_summary(workspace) for workspace in sorted(
                self.workspaces, key=lambda item: item.kind,
            )],
            'status': get_ppt_status(self),
            'created_at': created_at_str,
            'updated_at': updated_at_str,
        }
        
        if include_pages:
            # pages 现在是列表，不需要 order_by（已在 relationship 中定义）
            data['pages'] = [page.to_dict() for page in self.pages]
            active_image_tasks = [
                task for task in self.tasks
                if task.task_type == 'GENERATE_IMAGES'
                and task.status in {'PENDING', 'PROCESSING', 'RUNNING', 'PAUSED'}
            ]
            active_image_tasks.sort(key=lambda task: task.created_at or datetime.min, reverse=True)
            data['active_image_tasks'] = [task.to_dict() for task in active_image_tasks]
        
        return data
    
    def __repr__(self):
        return f'<Project {self.id}: {self.status}>'


@event.listens_for(db.session, 'before_commit')
def _materialize_legacy_content_project(session):
    from .content_spine import ContentSpine
    from .project_workspace import ProjectWorkspace
    from .workspace_version import WorkspaceVersion
    from services.content_spine_service import build_initial_spine_document, document_hash

    projects = list(session.new) + [
        item for item in session.identity_map.values()
        if isinstance(item, Project)
    ]
    for project in projects:
        if not isinstance(project, Project) or not hasattr(project, '_legacy_content_project'):
            continue
        legacy = project._legacy_content_project
        if not project.id:
            project.id = str(uuid.uuid4())
        if not project.content_spine:
            spine_document = build_initial_spine_document({
                'project_title': project.project_title,
                'idea_prompt': legacy.get('idea_prompt'),
                'outline_text': legacy.get('outline_text'),
                'description_text': legacy.get('description_text'),
            })
            project.content_spine = ContentSpine(
                revision=1,
                confirmed_revision=0,
                status='draft',
                document_json=_canonical_json(spine_document),
                content_hash=document_hash(spine_document),
            )
        if not any(workspace.kind == 'ppt' for workspace in project.workspaces):
            settings = {
                'render_mode': legacy.get('render_mode', 'image'),
                'native_theme': legacy.get('native_theme'),
                'image_aspect_ratio': legacy.get('image_aspect_ratio', '16:9'),
                'native_image_settings': normalize_native_image_settings(
                    legacy.get('native_image_settings')
                ),
            }
            document = {
                'schema_version': 1,
                'page_refs': [page.id for page in project.pages if page.id],
            }
            workspace = ProjectWorkspace(
                project=project,
                kind='ppt',
                state='draft',
                stage=project.status or 'DRAFT',
                revision=1,
                source_kind='migration',
                settings_json=_canonical_json(settings),
                document_json=_canonical_json(document),
            )
            version = WorkspaceVersion(
                workspace=workspace,
                revision=1,
                document_json=workspace.document_json,
                settings_json=workspace.settings_json,
                content_hash=document_hash({'document': document, 'settings': settings}),
                source_type='migration',
            )
            workspace.current_version = version
            session.add_all([workspace, version])
