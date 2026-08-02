"""
User Template model - stores user-uploaded templates
"""
import uuid
from datetime import datetime
from . import db


class UserTemplate(db.Model):
    """
    User Template model - represents a user-uploaded template
    """
    __tablename__ = 'user_templates'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=True)  # Optional template name
    file_path = db.Column(db.String(500), nullable=False)
    thumb_path = db.Column(db.String(500), nullable=True)  # Thumbnail path for faster loading
    file_size = db.Column(db.Integer, nullable=True)  # File size in bytes
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """Convert to dictionary"""
        # Use thumbnail for preview if available
        if self.thumb_path:
            thumb_url = f'/files/user-templates/{self.id}/{_resolve_template_filename(self.thumb_path, self.id, thumbnail=True)}'
        else:
            thumb_url = None

        return {
            'template_id': self.id,
            'name': self.name,
            'template_image_url': f'/files/user-templates/{self.id}/{_resolve_template_filename(self.file_path, self.id)}',
            'thumb_url': thumb_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<UserTemplate {self.id}: {self.name or "Unnamed"}>'



def _resolve_template_filename(relative_path, template_id, thumbnail=False):
    """历史记录的文件名可能缺扩展名（旧版本写入 'template'），
    探测磁盘上的实际文件保证 URL 可加载。"""
    name = str(relative_path or '').split('/')[-1]
    if '.' in name:
        return name
    try:
        import os
        from flask import current_app
        base = os.path.join(
            current_app.config['UPLOAD_FOLDER'],
            'user-templates',
            str(template_id),
        )
    except Exception:
        return name
    candidates = (
        ('template-thumb.webp', 'template-thumb.jpg', 'template-thumb.png')
        if thumbnail else
        ('template.png', 'template.jpg', 'template.webp')
    )
    for candidate in candidates:
        if os.path.exists(os.path.join(base, candidate)):
            return candidate
    return name
