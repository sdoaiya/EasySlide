import json

from sqlalchemy import text

from models import Settings, db
from secret_storage import encrypt_portable_secret


def test_settings_secrets_are_encrypted_at_rest(app):
    secret = "unit-test-mineru-token-keep-private"

    with app.app_context():
        settings = Settings.get_settings()
        settings.mineru_token = secret
        db.session.commit()
        raw_value = db.session.execute(text("SELECT mineru_token FROM settings WHERE id = :id"), {"id": settings.id}).scalar_one()

        assert raw_value != secret
        assert raw_value.startswith("dpapi:v1:")

        db.session.expire_all()
        assert Settings.get_settings().mineru_token == secret


def test_existing_plaintext_secret_is_migrated_on_settings_load(app):
    secret = "unit-test-baidu-key-keep-private"

    with app.app_context():
        settings = Settings.get_settings()
        db.session.execute(text("UPDATE settings SET baidu_api_key = :value WHERE id = :id"), {"value": secret, "id": settings.id})
        db.session.commit()
        db.session.expire_all()

        migrated = Settings.get_settings()
        raw_value = db.session.execute(text("SELECT baidu_api_key FROM settings WHERE id = :id"), {"id": migrated.id}).scalar_one()

        assert migrated.baidu_api_key == secret
        assert raw_value != secret
        assert raw_value.startswith("dpapi:v1:")


def test_packaged_encrypted_credentials_only_import_into_empty_settings(app, tmp_path):
    from bootstrap_settings import import_packaged_credentials

    bundle_path = tmp_path / "bootstrap-settings.json"
    bundle_path.write_text(json.dumps({
        "version": 1,
        "credentials": {
            "mineru_token": encrypt_portable_secret("package-mineru-token"),
            "baidu_api_key": encrypt_portable_secret("package-baidu-key"),
            "elevenlabs_api_key": encrypt_portable_secret("package-elevenlabs-key"),
        },
    }), encoding="utf-8")

    with app.app_context():
        settings = Settings.get_settings()
        settings.mineru_token = None
        settings.baidu_api_key = None
        settings.elevenlabs_api_key = None
        db.session.commit()

        assert import_packaged_credentials(str(bundle_path)) is True
        imported = Settings.get_settings()
        assert imported.mineru_token == "package-mineru-token"
        assert imported.baidu_api_key == "package-baidu-key"
        assert imported.elevenlabs_api_key == "package-elevenlabs-key"

        imported.mineru_token = "user-managed-token"
        db.session.commit()
        assert import_packaged_credentials(str(bundle_path)) is False
        assert Settings.get_settings().mineru_token == "user-managed-token"
