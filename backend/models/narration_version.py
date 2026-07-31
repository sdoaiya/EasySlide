"""Versioned narration content for a page."""
import json
import logging
import uuid
from datetime import datetime

from . import db


logger = logging.getLogger(__name__)


class NarrationVersion(db.Model):
    __tablename__ = 'narration_versions'
    __table_args__ = (
        db.UniqueConstraint('page_id', 'version_number', name='uq_narration_versions_page_number'),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    page_id = db.Column(
        db.String(36),
        db.ForeignKey('pages.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    version_number = db.Column(db.Integer, nullable=False)
    mode = db.Column(
        db.Enum('single', 'dialogue', name='narration_mode', native_enum=False, create_constraint=True),
        nullable=False,
    )
    language = db.Column(db.String(16), nullable=False, default='auto')
    text = db.Column(db.Text, nullable=False)
    segments_json = db.Column(db.Text, nullable=True)
    source_type = db.Column(
        db.Enum(
            'manual', 'ai_generated', 'ai_polished', 'converted', 'legacy',
            name='narration_source_type', native_enum=False, create_constraint=True,
        ),
        nullable=False,
    )
    status = db.Column(
        db.Enum(
            'candidate', 'applied', 'archived',
            name='narration_version_status', native_enum=False, create_constraint=True,
        ),
        nullable=False,
    )
    parent_version_id = db.Column(
        db.String(36),
        db.ForeignKey('narration_versions.id', ondelete='SET NULL'),
        nullable=True,
    )
    ai_operation = db.Column(db.String(50), nullable=True)
    ai_config_json = db.Column(db.Text, nullable=True)
    content_hash = db.Column(db.String(64), nullable=False)
    created_by = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    page = db.relationship('Page', back_populates='narration_versions', foreign_keys=[page_id])
    parent_version = db.relationship(
        'NarrationVersion',
        remote_side=[id],
        foreign_keys=[parent_version_id],
        backref=db.backref('child_versions', lazy='dynamic'),
    )

    @staticmethod
    def _load_json(raw, expected_type, fallback):
        if not raw:
            return fallback
        try:
            value = json.loads(raw)
            return value if isinstance(value, expected_type) else fallback
        except (TypeError, json.JSONDecodeError):
            logger.warning('Invalid narration version JSON')
            return fallback

    def get_segments(self):
        return self._load_json(self.segments_json, list, [])

    def set_segments(self, segments):
        self.segments_json = json.dumps(segments, ensure_ascii=False) if segments else None

    def get_ai_config(self):
        return self._load_json(self.ai_config_json, dict, {})

    def set_ai_config(self, config):
        self.ai_config_json = json.dumps(config, ensure_ascii=False) if config else None

    def to_dict(self):
        return {
            'version_id': self.id,
            'page_id': self.page_id,
            'version_number': self.version_number,
            'mode': self.mode,
            'language': self.language,
            'text': self.text,
            'segments': self.get_segments(),
            'source_type': self.source_type,
            'status': self.status,
            'parent_version_id': self.parent_version_id,
            'ai_operation': self.ai_operation,
            'ai_config': self.get_ai_config(),
            'content_hash': self.content_hash,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

