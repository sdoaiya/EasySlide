"""
Page model
"""
import uuid
import json
import logging
from pathlib import Path
from datetime import datetime
from . import db


logger = logging.getLogger(__name__)


class Page(db.Model):
    """
    Page model - represents a single PPT page/slide
    """
    __tablename__ = 'pages'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    order_index = db.Column(db.Integer, nullable=False)
    part = db.Column(db.String(200), nullable=True)  # Optional section name
    outline_content = db.Column(db.Text, nullable=True)  # JSON string
    description_content = db.Column(db.Text, nullable=True)  # JSON string
    generated_image_path = db.Column(db.String(500), nullable=True)  # Original PNG image path
    cached_image_path = db.Column(db.String(500), nullable=True)  # Compressed JPG thumbnail path
    template_image_path = db.Column(db.String(500), nullable=True)
    template_style_text = db.Column(db.Text, nullable=True)
    template_selection_role = db.Column(db.String(40), nullable=True)
    template_selection_layout = db.Column(db.String(40), nullable=True)
    template_selection_source = db.Column(db.String(40), nullable=True)
    template_match_reason = db.Column(db.Text, nullable=True)
    narration_text = db.Column(db.Text, nullable=True)  # Plain text narration for TTS video export
    narration_segments = db.Column(db.Text, nullable=True)  # JSON segments for multi-speaker narration
    narration_source_hash = db.Column(db.String(64), nullable=True)
    narration_config_hash = db.Column(db.String(64), nullable=True)
    narration_status = db.Column(db.String(32), nullable=True)
    narration_audio_manifest = db.Column(db.Text, nullable=True)
    narration_error = db.Column(db.Text, nullable=True)
    current_narration_version_id = db.Column(
        db.String(36),
        db.ForeignKey(
            'narration_versions.id',
            name='fk_pages_current_narration_version_id',
            ondelete='SET NULL',
            use_alter=True,
        ),
        nullable=True,
    )
    narration_locked = db.Column(db.Boolean, nullable=False, default=False)
    narration_revision = db.Column(db.Integer, nullable=False, default=0)
    native_layout = db.Column(db.String(100), nullable=True)
    native_props = db.Column(db.Text, nullable=True)
    native_versions = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), nullable=False, default='DRAFT')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = db.relationship('Project', back_populates='pages')
    image_versions = db.relationship('PageImageVersion', back_populates='page', 
                                     lazy='dynamic', cascade='all, delete-orphan',
                                     order_by='PageImageVersion.version_number.desc()')
    narration_versions = db.relationship(
        'NarrationVersion',
        back_populates='page',
        foreign_keys='NarrationVersion.page_id',
        lazy='dynamic',
        cascade='all, delete-orphan',
        order_by='NarrationVersion.version_number.desc()',
    )
    current_narration_version = db.relationship(
        'NarrationVersion',
        foreign_keys=[current_narration_version_id],
        post_update=True,
    )
    
    def get_outline_content(self):
        """Parse outline_content from JSON string"""
        if self.outline_content:
            try:
                return json.loads(self.outline_content)
            except json.JSONDecodeError:
                return None
        return None
    
    def set_outline_content(self, data):
        """Set outline_content as JSON string"""
        if data:
            self.outline_content = json.dumps(data, ensure_ascii=False)
        else:
            self.outline_content = None
    
    def get_description_content(self):
        """Parse description_content from JSON string"""
        if self.description_content:
            try:
                return json.loads(self.description_content)
            except json.JSONDecodeError:
                return None
        return None
    
    def set_description_content(self, data):
        """Set description_content as JSON string"""
        if data:
            self.description_content = json.dumps(data, ensure_ascii=False)
        else:
            self.description_content = None
    
    def get_narration_text(self):
        """Get narration text for TTS"""
        return self.narration_text

    def set_narration_text(self, text):
        """Set narration text for TTS"""
        self.narration_text = text if text else None

    def get_narration_segments(self):
        if not self.narration_segments:
            return []
        try:
            data = json.loads(self.narration_segments)
            return data if isinstance(data, list) else []
        except (TypeError, json.JSONDecodeError):
            logger.warning('Invalid narration_segments on page %s', self.id)
            return []

    def set_narration_segments(self, segments):
        self.narration_segments = json.dumps(segments, ensure_ascii=False) if segments else None

    def get_native_props(self):
        """Parse native slide properties without breaking legacy projects."""
        if not self.native_props:
            return {}
        try:
            data = json.loads(self.native_props)
            return data if isinstance(data, dict) else {}
        except (TypeError, json.JSONDecodeError):
            logger.warning('Invalid native_props on page %s', self.id)
            return {}

    def set_native_props(self, data):
        """Store native slide properties as JSON."""
        self.native_props = json.dumps(data, ensure_ascii=False) if data else None

    def get_native_versions(self):
        if not self.native_versions:
            return []
        try:
            data = json.loads(self.native_versions)
            return data if isinstance(data, list) else []
        except (TypeError, json.JSONDecodeError):
            logger.warning('Invalid native_versions on page %s', self.id)
            return []

    def set_native_versions(self, versions):
        self.native_versions = json.dumps(versions, ensure_ascii=False) if versions else None

    def snapshot_native_version(self):
        if not self.native_layout:
            return None
        versions = self.get_native_versions()
        version = {
            'version_id': str(uuid.uuid4()),
            'layout': self.native_layout,
            'props': self.get_native_props(),
            'created_at': datetime.utcnow().isoformat(),
        }
        versions.append(version)
        self.set_native_versions(versions)
        return version

    def native_version_list(self):
        versions = list(reversed(self.get_native_versions()))
        current = {
            'version_id': 'current',
            'layout': self.native_layout,
            'props': self.get_native_props(),
            'created_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_current': True,
        }
        return [
            {**current, 'version_number': len(versions) + 1},
            *[
                {**version, 'version_number': len(versions) - index, 'is_current': False}
                for index, version in enumerate(versions)
            ],
        ]

    def restore_native_version(self, version_id):
        versions = self.get_native_versions()
        index = next((item for item, version in enumerate(versions) if version.get('version_id') == version_id), None)
        if index is None:
            return False
        selected = versions.pop(index)
        if self.native_layout:
            versions.append({
                'version_id': str(uuid.uuid4()),
                'layout': self.native_layout,
                'props': self.get_native_props(),
                'created_at': datetime.utcnow().isoformat(),
            })
        self.native_layout = selected.get('layout')
        self.set_native_props(selected.get('props'))
        self.set_native_versions(versions)
        return True

    def to_dict(self, include_versions=False):
        """Convert to dictionary"""
        # Use cached image for frontend display, fallback to original if no cache
        display_image_path = self.cached_image_path or self.generated_image_path
        if not display_image_path:
            current_version = self.image_versions.filter_by(is_current=True).first()
            display_image_path = current_version.image_path if current_version else None
        display_image_url = None
        if display_image_path:
            filename = Path(display_image_path).name
            display_image_url = f'/files/{self.project_id}/pages/{filename}'
        template_image_url = None
        if self.template_image_path:
            filename = Path(self.template_image_path).name
            template_image_url = f'/files/{self.project_id}/template/{filename}'

        data = {
            'page_id': self.id,
            'order_index': self.order_index,
            'part': self.part,
            'outline_content': self.get_outline_content(),
            'description_content': self.get_description_content(),
            'narration_text': self.narration_text,
            'narration_segments': self.get_narration_segments(),
            'narration_status': self.narration_status,
            'current_narration_version_id': self.current_narration_version_id,
            'narration_locked': self.narration_locked,
            'narration_revision': self.narration_revision,
            'native_layout': self.native_layout,
            'native_props': self.get_native_props(),
            'generated_image_url': display_image_url,
            'template_image_url': template_image_url,
            'template_style_text': self.template_style_text,
            'template_selection_role': self.template_selection_role,
            'template_selection_layout': self.template_selection_layout,
            'template_selection_source': self.template_selection_source,
            'template_match_reason': self.template_match_reason,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_versions:
            data['image_versions'] = [v.to_dict() for v in self.image_versions.all()]
            data['narration_versions'] = [v.to_dict() for v in self.narration_versions.all()]

        return data
    
    def __repr__(self):
        return f'<Page {self.id}: {self.order_index} - {self.status}>'

