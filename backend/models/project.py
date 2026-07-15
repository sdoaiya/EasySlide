"""
Project model
"""
import json
import uuid
from datetime import datetime
from . import db


DEFAULT_NATIVE_IMAGE_SETTINGS = {
    'density': 'standard',
    'style': 'theme',
    'custom_prompt': '',
    'custom_counts': {},
}
NATIVE_IMAGE_DENSITIES = {'sparse', 'standard', 'rich', 'custom'}
NATIVE_IMAGE_STYLES = {'theme', 'photo', '3d', 'flat', 'tech', 'custom'}


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
    if not isinstance(settings['custom_prompt'], str) or len(settings['custom_prompt']) > 2000:
        raise ValueError('native image custom_prompt must be text within 2000 characters')
    if not isinstance(settings['custom_counts'], dict) or any(
        not isinstance(page_id, str) or isinstance(count, bool) or not isinstance(count, int) or count < 0 or count > 10
        for page_id, count in settings['custom_counts'].items()
    ):
        raise ValueError('native image custom_counts must map page ids to counts from 0 to 10')
    return settings


class Project(db.Model):
    """
    Project model - represents a PPT project
    """
    __tablename__ = 'projects'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_title = db.Column(db.String(255), nullable=True)
    idea_prompt = db.Column(db.Text, nullable=True)
    outline_text = db.Column(db.Text, nullable=True)  # 用户输入的大纲文本（用于outline类型）
    description_text = db.Column(db.Text, nullable=True)  # 用户输入的描述文本（用于description类型）
    extra_requirements = db.Column(db.Text, nullable=True)  # 额外要求，应用到每个页面的AI提示词
    outline_requirements = db.Column(db.Text, nullable=True)  # 大纲生成要求
    description_requirements = db.Column(db.Text, nullable=True)  # 页面描述生成要求
    creation_type = db.Column(db.String(20), nullable=False, default='idea')  # idea|outline|descriptions
    render_mode = db.Column(db.String(20), nullable=False, default='image', server_default='image')  # image|native
    native_theme = db.Column(db.String(100), nullable=True)
    native_image_settings = db.Column(db.Text, nullable=True)
    template_image_path = db.Column(db.String(500), nullable=True)
    template_style = db.Column(db.Text, nullable=True)  # 风格描述文本（无模板图模式）
    template_pack_id = db.Column(db.String(120), nullable=True)  # 内置模板包标识，旧项目为空
    # 导出设置
    export_extractor_method = db.Column(db.String(50), nullable=True, default='hybrid')  # 组件提取方法: mineru, hybrid
    export_inpaint_method = db.Column(db.String(50), nullable=True, default='hybrid')  # 背景图获取方法: generative, baidu, hybrid
    export_allow_partial = db.Column(db.Boolean, nullable=True, default=False)  # 是否允许返回半成品（导出出错时继续而非停止）
    export_high_fidelity_editable = db.Column(db.Boolean, nullable=False, default=False)  # 高保真可编辑导出（高级开关，默认关闭）
    enable_icon_subject_extraction = db.Column(db.Boolean, nullable=True, default=False)  # 已废弃
    image_aspect_ratio = db.Column(db.String(10), nullable=False, server_default='16:9', default='16:9')
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

    def get_native_image_settings(self):
        if not self.native_image_settings:
            return dict(DEFAULT_NATIVE_IMAGE_SETTINGS)
        try:
            return normalize_native_image_settings(json.loads(self.native_image_settings))
        except (TypeError, ValueError, json.JSONDecodeError):
            return dict(DEFAULT_NATIVE_IMAGE_SETTINGS)

    def set_native_image_settings(self, value):
        self.native_image_settings = json.dumps(normalize_native_image_settings(value), ensure_ascii=False)
    
    def to_dict(self, include_pages=False):
        """Convert to dictionary"""
        # Format created_at and updated_at with UTC timezone indicator for proper frontend parsing
        created_at_str = None
        if self.created_at:
            created_at_str = self.created_at.isoformat() + 'Z' if not self.created_at.tzinfo else self.created_at.isoformat()
        
        updated_at_str = None
        if self.updated_at:
            updated_at_str = self.updated_at.isoformat() + 'Z' if not self.updated_at.tzinfo else self.updated_at.isoformat()
        
        data = {
            'project_id': self.id,
            'project_title': self.project_title,
            'idea_prompt': self.idea_prompt,
            'outline_text': self.outline_text,
            'description_text': self.description_text,
            'extra_requirements': self.extra_requirements,
            'outline_requirements': self.outline_requirements,
            'description_requirements': self.description_requirements,
            'creation_type': self.creation_type,
            'render_mode': self.render_mode or 'image',
            'native_theme': self.native_theme,
            'native_image_settings': self.get_native_image_settings(),
            'template_image_url': f'/files/{self.id}/template/{self.template_image_path.split("/")[-1]}' if self.template_image_path else None,
            'template_style': self.template_style,
            'template_pack_id': self.template_pack_id,
            'export_extractor_method': self.export_extractor_method or 'hybrid',
            'export_inpaint_method': self.export_inpaint_method or 'hybrid',
            'export_allow_partial': self.export_allow_partial or False,
            'export_high_fidelity_editable': self.export_high_fidelity_editable or False,
            'enable_icon_subject_extraction': False,
            'image_aspect_ratio': self.image_aspect_ratio,
            'status': self.status,
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
