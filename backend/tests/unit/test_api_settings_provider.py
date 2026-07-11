"""
Settings controller tests for provider format handling.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import requests
from flask import Flask

from controllers import settings_controller
from controllers.settings_controller import update_settings, verify_api_key


NEW_OPENAI_AUTH_COPY = (
    'OpenAI OAuth is not connected. Please reconnect OpenAI authorization in Settings.'
)


def _build_settings(**overrides):
    defaults = {
        'ai_provider_format': 'gemini',
        'api_key': None,
        'api_base_url': None,
        'text_model': None,
    }
    defaults.update(overrides)

    settings = SimpleNamespace(**defaults)
    settings.to_dict = lambda: {
        'ai_provider_format': settings.ai_provider_format,
        'api_key_length': len(settings.api_key) if settings.api_key else 0,
    }
    return settings


def test_update_settings_accepts_lazyllm_provider():
    """`lazyllm` should be accepted as a valid provider format."""
    app = Flask(__name__)

    settings = _build_settings()
    with app.app_context():
        with app.test_request_context('/api/settings/', method='PUT', json={'ai_provider_format': 'lazyllm'}):
            with patch('controllers.settings_controller.Settings.get_settings', return_value=settings):
                with patch('controllers.settings_controller.db.session.commit'):
                    with patch('controllers.settings_controller._sync_settings_to_config'):
                        response, status_code = update_settings()

    assert status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['data']['ai_provider_format'] == 'lazyllm'


def test_verify_uses_configured_text_model():
    """Verify endpoint should use configured text model, not a hardcoded gemini model."""
    app = Flask(__name__)
    app.config.update(
        TEXT_MODEL='gemini-3-flash-preview',
        AI_PROVIDER_FORMAT='lazyllm',
    )

    settings = _build_settings(ai_provider_format='lazyllm', text_model='deepseek-chat')
    mock_provider = MagicMock()
    mock_provider.generate_text.return_value = 'OK'

    with app.app_context():
        with app.test_request_context('/api/settings/verify', method='POST'):
            with patch('controllers.settings_controller.Settings.get_settings', return_value=settings):
                with patch('services.ai_providers.get_text_provider', return_value=mock_provider) as mock_get_provider:
                    response, status_code = verify_api_key()

    assert status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert data['data']['available'] is True
    mock_get_provider.assert_called_once_with(model='deepseek-chat')
    mock_provider.generate_text.assert_called_once()


def test_codex_provider_missing_oauth_uses_authorization_copy(app):
    """Missing Codex OAuth should ask for authorization, not account login."""
    from services import ai_providers

    app.config['AI_PROVIDER_FORMAT'] = 'codex'
    with app.app_context():
        with patch('services.ai_providers._get_openai_oauth_token', return_value=None):
            with pytest.raises(ValueError) as exc:
                ai_providers._build_provider_config()

    message = str(exc.value)
    assert message == NEW_OPENAI_AUTH_COPY
    assert 'log in' not in message
    assert 'OpenAI account' not in message


def test_openai_provider_defaults_to_openai_platform_api(app):
    """OpenAI provider should default to OpenAI's own API endpoint."""
    from services import ai_providers

    app.config['AI_PROVIDER_FORMAT'] = 'openai'
    app.config['OPENAI_API_KEY'] = 'sk-test'
    app.config.pop('OPENAI_API_BASE', None)

    with app.app_context():
        config = ai_providers._build_provider_config()

    assert config['api_base'] == 'https://api.openai.com/v1'
    assert 'aihubmix' not in config['api_base'].lower()


def test_model_options_lists_openai_models_from_request_config(client):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        'data': [
            {'id': 'gpt-4o-mini'},
            {'id': 'gpt-4.1-mini'},
        ],
    }

    with patch('controllers.settings_controller.http_requests.get', return_value=response) as get:
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': 'text',
            'api_key': 'sk-test',
            'api_base_url': 'https://api.openai.com/v1',
        })

    assert result.status_code == 200
    data = result.get_json()
    assert data['success'] is True
    assert data['data']['models'] == ['gpt-4.1-mini', 'gpt-4o-mini']
    get.assert_called_once_with(
        'https://api.openai.com/v1/models',
        headers={'Authorization': 'Bearer sk-test'},
        timeout=15,
    )


def test_model_options_empty_request_base_ignores_saved_base_url(client, app):
    with app.app_context():
        from models import Settings, db

        settings = Settings.get_settings()
        settings.api_base_url = 'https://sub.kedaya.xyz/v1'
        db.session.commit()

    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {'data': [{'id': 'gpt-4o-mini'}]}

    with patch('controllers.settings_controller.http_requests.get', return_value=response) as get:
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': 'text',
            'api_key': 'sk-test',
            'api_base_url': '',
        })

    assert result.status_code == 200
    assert result.get_json()['data']['models'] == ['gpt-4o-mini']
    assert get.call_args.args[0] == 'https://api.openai.com/v1/models'


def test_model_options_rejects_unsupported_provider(client):
    result = client.post('/api/settings/model-options', json={
        'provider': 'deepseek',
        'model_type': 'text',
    })

    assert result.status_code == 400
    data = result.get_json()
    assert data['error']['code'] == 'MODEL_OPTIONS_UNSUPPORTED_PROVIDER'


def test_model_options_falls_back_when_provider_model_list_gateway_fails(client):
    with patch(
        'controllers.settings_controller.http_requests.get',
        side_effect=requests.exceptions.ProxyError('proxy failed'),
    ):
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': 'text',
            'api_key': 'sk-test',
        })

    assert result.status_code == 200
    data = result.get_json()
    assert data['success'] is True
    assert 'gpt-4o-mini' in data['data']['models']
    assert 'warning' in data['data']


def test_model_options_falls_back_on_auth_failure(client):
    response = requests.Response()
    response.status_code = 401
    error = requests.exceptions.HTTPError('401 Client Error', response=response)

    failed_response = MagicMock()
    failed_response.raise_for_status.side_effect = error

    with patch('controllers.settings_controller.http_requests.get', return_value=failed_response):
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': 'text',
            'api_key': 'bad-key',
        })

    assert result.status_code == 200
    data = result.get_json()
    assert data['success'] is True
    assert 'gpt-4o-mini' in data['data']['models']
    assert 'warning' in data['data']


def test_model_options_gemini_uses_api_key_header(client):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        'models': [{
            'name': 'models/gemini-2.5-flash',
            'supportedGenerationMethods': ['generateContent'],
        }],
    }

    with patch('controllers.settings_controller.http_requests.get', return_value=response) as get:
        result = client.post('/api/settings/model-options', json={
            'provider': 'gemini',
            'model_type': 'text',
            'api_key': 'gemini-secret',
        })

    assert result.status_code == 200
    get.assert_called_once_with(
        'https://generativelanguage.googleapis.com/v1beta/models',
        headers={'x-goog-api-key': 'gemini-secret'},
        timeout=15,
    )


def test_model_options_gemini_image_models_use_model_name_capability(client):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        'models': [
            {
                'name': 'models/gemini-2.5-flash-image',
                'supportedGenerationMethods': ['generateContent'],
            },
            {
                'name': 'models/gemini-2.5-flash',
                'supportedGenerationMethods': ['generateContent'],
            },
        ],
    }

    with patch('controllers.settings_controller.http_requests.get', return_value=response):
        result = client.post('/api/settings/model-options', json={
            'provider': 'gemini',
            'model_type': 'image',
            'api_key': 'gemini-secret',
        })

    assert result.status_code == 200
    assert result.get_json()['data']['models'] == ['gemini-2.5-flash-image']


def test_model_options_failure_does_not_expose_secret_or_exception(client, caplog):
    secret = 'gemini-secret-value'
    response = requests.Response()
    response.status_code = 401
    response.url = f'https://generativelanguage.googleapis.com/v1beta/models?key={secret}'
    error = requests.exceptions.HTTPError(
        f'401 Client Error: Unauthorized for url: {response.url}',
        response=response,
    )
    failed_response = MagicMock()
    failed_response.raise_for_status.side_effect = error

    with patch('controllers.settings_controller.http_requests.get', return_value=failed_response):
        result = client.post('/api/settings/model-options', json={
            'provider': 'gemini',
            'model_type': 'text',
            'api_key': secret,
        })

    payload = result.get_json()
    exposed_text = result.get_data(as_text=True) + caplog.text
    assert result.status_code == 200
    assert payload['data']['warning'] == '模型列表在线读取失败，已显示常用模型（HTTP 401）'
    assert secret not in exposed_text
    assert response.url not in exposed_text
    assert 'Unauthorized' not in exposed_text


def test_model_options_unexpected_failure_does_not_log_exception_text(client, caplog):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.side_effect = ValueError('unexpected-secret-value')

    with patch('controllers.settings_controller.http_requests.get', return_value=response):
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': 'text',
            'api_key': 'sk-test',
        })

    assert result.status_code == 500
    assert result.get_json()['error']['message'] == '模型列表读取失败'
    assert 'unexpected-secret-value' not in caplog.text


@pytest.mark.parametrize(
    ('model_type', 'key_field', 'base_field'),
    [
        ('text', 'text_api_key', 'text_api_base_url'),
        ('image', 'image_api_key', 'image_api_base_url'),
        ('image_caption', 'image_caption_api_key', 'image_caption_api_base_url'),
    ],
)
def test_model_options_prefers_saved_model_credentials(
    client,
    app,
    model_type,
    key_field,
    base_field,
):
    with app.app_context():
        from models import Settings, db

        settings = Settings.get_settings()
        settings.api_key = 'global-key'
        settings.api_base_url = 'https://global.example/v1'
        setattr(settings, f'{model_type}_model_source', 'openai')
        setattr(settings, key_field, f'{model_type}-key')
        setattr(settings, base_field, f'https://{model_type}.example/v1')
        db.session.commit()

    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {'data': [{'id': 'gpt-4.1-mini'}]}

    with patch('controllers.settings_controller.http_requests.get', return_value=response) as get:
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': model_type,
        })

    assert result.status_code == 200
    get.assert_called_once_with(
        f'https://{model_type}.example/v1/models',
        headers={'Authorization': f'Bearer {model_type}-key'},
        timeout=15,
    )


def test_model_options_does_not_reuse_credentials_from_previous_provider(client, app):
    with app.app_context():
        from models import Settings, db

        settings = Settings.get_settings()
        settings.ai_provider_format = 'gemini'
        settings.text_model_source = 'gemini'
        settings.text_api_key = 'old-gemini-key'
        settings.text_api_base_url = 'https://old-gemini.example/v1'
        db.session.commit()

    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {'data': [{'id': 'gpt-4.1-mini'}]}

    with patch('controllers.settings_controller.http_requests.get', return_value=response) as get:
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': 'text',
            'api_key': 'new-openai-key',
        })

    assert result.status_code == 200
    get.assert_called_once_with(
        'https://api.openai.com/v1/models',
        headers={'Authorization': 'Bearer new-openai-key'},
        timeout=15,
    )


@pytest.mark.parametrize(
    ('model_type', 'expected'),
    [
        ('text', ['gpt-4.1-mini']),
        ('image_caption', ['gpt-4.1-mini']),
        ('image', ['dall-e-3', 'gpt-image-1']),
    ],
)
def test_model_options_filters_openai_models_by_type(client, model_type, expected):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        'data': [
            {'id': 'gpt-4.1-mini'},
            {'id': 'gpt-image-1'},
            {'id': 'dall-e-3'},
            {'id': 'text-embedding-3-small'},
            {'id': 'omni-moderation-latest'},
            {'id': 'gpt-4o-mini-tts'},
            {'id': 'whisper-1'},
        ],
    }

    with patch('controllers.settings_controller.http_requests.get', return_value=response):
        result = client.post('/api/settings/model-options', json={
            'provider': 'openai',
            'model_type': model_type,
            'api_key': 'sk-test',
        })

    assert result.status_code == 200
    assert result.get_json()['data']['models'] == expected


def test_codex_per_model_missing_oauth_uses_authorization_copy(app):
    """Per-model Codex OAuth errors should avoid account-login wording."""
    from services import ai_providers

    app.config['TEXT_MODEL_SOURCE'] = 'codex'
    with app.app_context():
        with patch('services.ai_providers._get_openai_oauth_token', return_value=None):
            with pytest.raises(ValueError) as exc:
                ai_providers._get_model_type_provider_config('text')

    message = str(exc.value)
    assert 'reconnect OpenAI authorization in Settings' in message
    assert 'log in' not in message
    assert 'OpenAI account' not in message


def test_codex_401_settings_test_disconnects_oauth_and_reports_state(client, app):
    """A Codex 401 during settings tests should clear stale OAuth state."""
    with app.app_context():
        from models import Settings, Task, db

        settings = Settings.get_settings()
        settings.openai_oauth_access_token = 'expired-access-token'
        settings.openai_oauth_refresh_token = 'expired-refresh-token'
        settings.openai_oauth_account_id = 'user@example.com'
        task = Task(
            project_id='settings-test',
            task_type='TEST_TEXT_MODEL',
            status='PENDING',
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id

        response = requests.Response()
        response.status_code = 401
        response.url = 'https://chatgpt.com/backend-api/codex/responses'
        error = requests.exceptions.HTTPError(
            '401 Client Error: Unauthorized for url: https://chatgpt.com/backend-api/codex/responses',
            response=response,
        )

        def fail_with_codex_401():
            raise error

        with patch.dict(settings_controller.TEST_FUNCTIONS, {'text-model': fail_with_codex_401}):
            settings_controller._run_test_async(
                task_id,
                'text-model',
                {'text_model_source': 'codex'},
                app,
            )

        db.session.expire_all()
        settings = Settings.get_settings()
        assert settings.openai_oauth_access_token is None
        assert settings.openai_oauth_refresh_token is None
        assert settings.openai_oauth_account_id is None

    status_response = client.get(f'/api/settings/tests/{task_id}/status')
    assert status_response.status_code == 200
    data = status_response.get_json()
    assert data['success'] is True
    assert data['data']['status'] == 'FAILED'
    assert data['data']['openai_oauth_disconnected'] is True
    assert '重新连接 OpenAI 授权' in data['data']['error']
    assert '登录' not in data['data']['error']
    assert '账号' not in data['data']['error']


@pytest.mark.parametrize(
    ('test_name', 'source_key', 'task_type'),
    [
        ('text-model', 'text_model_source', 'TEST_TEXT_MODEL'),
        ('image-model', 'image_model_source', 'TEST_IMAGE_MODEL'),
        ('caption-model', 'image_caption_model_source', 'TEST_CAPTION_MODEL'),
    ],
)
def test_codex_oauth_not_connected_settings_test_disconnects_oauth_and_reports_state(
    client,
    app,
    test_name,
    source_key,
    task_type,
):
    """A Codex settings test should sync OAuth state when no token can be loaded."""
    with app.app_context():
        from models import Settings, Task, db

        settings = Settings.get_settings()
        settings.openai_oauth_access_token = 'stale-access-token'
        settings.openai_oauth_refresh_token = 'stale-refresh-token'
        settings.openai_oauth_account_id = 'user@example.com'
        task = Task(
            project_id='settings-test',
            task_type=task_type,
            status='PENDING',
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id

        def fail_with_missing_codex_oauth():
            raise ValueError(NEW_OPENAI_AUTH_COPY)

        with patch.dict(settings_controller.TEST_FUNCTIONS, {test_name: fail_with_missing_codex_oauth}):
            settings_controller._run_test_async(
                task_id,
                test_name,
                {source_key: 'codex'},
                app,
            )

        db.session.expire_all()
        settings = Settings.get_settings()
        assert settings.openai_oauth_access_token is None
        assert settings.openai_oauth_refresh_token is None
        assert settings.openai_oauth_account_id is None

    status_response = client.get(f'/api/settings/tests/{task_id}/status')
    assert status_response.status_code == 200
    data = status_response.get_json()
    assert data['success'] is True
    assert data['data']['status'] == 'FAILED'
    assert data['data']['openai_oauth_disconnected'] is True
    assert '重新连接 OpenAI 授权' in data['data']['error']
    assert '登录' not in data['data']['error']
    assert '账号' not in data['data']['error']


def test_non_codex_oauth_not_connected_error_does_not_disconnect_codex_oauth(client, app):
    """The local OAuth-not-connected text should only clear OAuth for Codex tests."""
    with app.app_context():
        from models import Settings, Task, db

        settings = Settings.get_settings()
        settings.openai_oauth_access_token = 'still-valid-access-token'
        settings.openai_oauth_refresh_token = 'still-valid-refresh-token'
        settings.openai_oauth_account_id = 'user@example.com'
        task = Task(
            project_id='settings-test',
            task_type='TEST_TEXT_MODEL',
            status='PENDING',
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id

        def fail_with_missing_oauth_text():
            raise ValueError(NEW_OPENAI_AUTH_COPY)

        with patch.dict(settings_controller.TEST_FUNCTIONS, {'text-model': fail_with_missing_oauth_text}):
            settings_controller._run_test_async(
                task_id,
                'text-model',
                {'text_model_source': 'gemini'},
                app,
            )

        db.session.expire_all()
        settings = Settings.get_settings()
        assert settings.openai_oauth_access_token == 'still-valid-access-token'
        assert settings.openai_oauth_refresh_token == 'still-valid-refresh-token'
        assert settings.openai_oauth_account_id == 'user@example.com'

    status_response = client.get(f'/api/settings/tests/{task_id}/status')
    assert status_response.status_code == 200
    data = status_response.get_json()
    assert data['success'] is True
    assert data['data']['status'] == 'FAILED'
    assert 'openai_oauth_disconnected' not in data['data']


def test_unrelated_401_settings_test_does_not_disconnect_codex_oauth(client, app):
    """A non-Codex service test should not clear OAuth just because Codex is configured globally."""
    with app.app_context():
        from models import Settings, Task, db

        settings = Settings.get_settings()
        settings.openai_oauth_access_token = 'still-valid-access-token'
        settings.openai_oauth_refresh_token = 'still-valid-refresh-token'
        settings.openai_oauth_account_id = 'user@example.com'
        task = Task(
            project_id='settings-test',
            task_type='TEST_BAIDU_OCR',
            status='PENDING',
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id

        response = requests.Response()
        response.status_code = 401
        error = requests.exceptions.HTTPError(
            '401 Client Error: Unauthorized for url: https://example.com/ocr',
            response=response,
        )

        def fail_with_unrelated_401():
            raise error

        with patch.dict(settings_controller.TEST_FUNCTIONS, {'baidu-ocr': fail_with_unrelated_401}):
            settings_controller._run_test_async(
                task_id,
                'baidu-ocr',
                {'ai_provider_format': 'codex'},
                app,
            )

        db.session.expire_all()
        settings = Settings.get_settings()
        assert settings.openai_oauth_access_token == 'still-valid-access-token'
        assert settings.openai_oauth_refresh_token == 'still-valid-refresh-token'
        assert settings.openai_oauth_account_id == 'user@example.com'

    status_response = client.get(f'/api/settings/tests/{task_id}/status')
    assert status_response.status_code == 200
    data = status_response.get_json()
    assert data['success'] is True
    assert data['data']['status'] == 'FAILED'
    assert 'openai_oauth_disconnected' not in data['data']


def test_codex_test_error_text_with_4010_does_not_disconnect_oauth(client, app):
    """A non-401 number in error text should not be treated as an OAuth 401."""
    with app.app_context():
        from models import Settings, Task, db

        settings = Settings.get_settings()
        settings.openai_oauth_access_token = 'still-valid-access-token'
        settings.openai_oauth_refresh_token = 'still-valid-refresh-token'
        settings.openai_oauth_account_id = 'user@example.com'
        task = Task(
            project_id='settings-test',
            task_type='TEST_TEXT_MODEL',
            status='PENDING',
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id

        def fail_with_port_number():
            raise ValueError('Connection failed to http://localhost:4010/codex-proxy')

        with patch.dict(settings_controller.TEST_FUNCTIONS, {'text-model': fail_with_port_number}):
            settings_controller._run_test_async(
                task_id,
                'text-model',
                {'text_model_source': 'codex'},
                app,
            )

        db.session.expire_all()
        settings = Settings.get_settings()
        assert settings.openai_oauth_access_token == 'still-valid-access-token'
        assert settings.openai_oauth_refresh_token == 'still-valid-refresh-token'
        assert settings.openai_oauth_account_id == 'user@example.com'

    status_response = client.get(f'/api/settings/tests/{task_id}/status')
    data = status_response.get_json()
    assert data['data']['status'] == 'FAILED'
    assert 'openai_oauth_disconnected' not in data['data']
