"""
Material model - stores material images
"""
import uuid
from datetime import datetime
from . import db


class Material(db.Model):
    """
    Material model - represents a material image
    """
    __tablename__ = 'materials'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=True)  # Can be null, for global materials not belonging to a project
    filename = db.Column(db.String(500), nullable=False)
    relative_path = db.Column(db.String(500), nullable=False)  # Path relative to the upload_folder
    url = db.Column(db.String(500), nullable=False)  # URL accessible by the frontend
    caption = db.Column(db.String(500), nullable=True)  # AI-generated image description
    original_filename = db.Column(db.String(500), nullable=True)  # Original filename before renaming
    media_kind = db.Column(db.String(20), nullable=False, default='image', server_default='image')
    purpose = db.Column(db.String(30), nullable=False, default='image', server_default='image')
    mime_type = db.Column(db.String(100), nullable=True)
    duration_ms = db.Column(db.Integer, nullable=True)
    source_note = db.Column(db.Text, nullable=True)
    license_status = db.Column(db.String(30), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = db.relationship('Project', back_populates='materials')
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'filename': self.filename,
            'url': self.url,
            'relative_path': self.relative_path,
            'caption': self.caption,
            'original_filename': self.original_filename,
            'media_kind': self.media_kind or 'image',
            'purpose': self.purpose or 'image',
            'mime_type': self.mime_type,
            'duration_ms': self.duration_ms,
            'source_note': self.source_note,
            'license_status': self.license_status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def __repr__(self):
        return f'<Material {self.id}: {self.filename} (project={self.project_id or "None"})>'

