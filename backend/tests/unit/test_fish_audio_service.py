import io
from unittest.mock import MagicMock

import msgpack
import pytest


def _response(*, status=200, payload=None, chunks=None, content_type='audio/mpeg'):
    response = MagicMock()
    response.status_code = status
    response.ok = 200 <= status < 300
    response.json.return_value = payload or {}
    response.text = ''
    response.headers = {'Content-Type': content_type}
    response.iter_content.return_value = iter(chunks or [])
    return response


def test_synthesize_uses_free_s21_model_and_native_multi_speaker(monkeypatch, tmp_path):
    from services import fish_audio_service

    response = _response(chunks=[b'ID3', b'audio'])
    request = MagicMock(return_value=response)
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)

    output = tmp_path / 'dialogue.mp3'
    fish_audio_service.synthesize(
        api_key='fish-secret',
        text='<|speaker:0|>[curious]你好<|speaker:1|>[confident]欢迎',
        output_path=str(output),
        reference_id=['voice-a', 'voice-b'],
        speed=1.05,
    )

    assert output.read_bytes() == b'ID3audio'
    kwargs = request.call_args.kwargs
    assert kwargs['headers']['Authorization'] == 'Bearer fish-secret'
    assert kwargs['headers']['model'] == 's2.1-pro-free'
    assert kwargs['headers']['Content-Type'] == 'application/msgpack'
    payload = msgpack.unpackb(kwargs['data'], raw=False)
    assert payload['reference_id'] == ['voice-a', 'voice-b']
    assert payload['prosody']['speed'] == 1.05


def test_synthesize_rejects_successful_json_error_body(monkeypatch, tmp_path):
    from services import fish_audio_service

    response = _response(payload={'message': 'quota exhausted'}, content_type='application/json')
    response.text = '{"message":"quota exhausted"}'
    request = MagicMock(return_value=response)
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)

    with pytest.raises(fish_audio_service.FishAudioAPIError, match='quota exhausted'):
        fish_audio_service.synthesize(
            api_key='fish-secret',
            text='hello',
            output_path=str(tmp_path / 'error.mp3'),
        )

    assert not (tmp_path / 'error.mp3').exists()


def test_synthesize_removes_partial_file_when_stream_fails(monkeypatch, tmp_path):
    from services import fish_audio_service

    response = _response()

    def broken_stream(**_kwargs):
        yield b'ID3'
        raise OSError('connection lost')

    response.iter_content.side_effect = broken_stream
    monkeypatch.setattr(fish_audio_service.requests, 'request', MagicMock(return_value=response))
    output = tmp_path / 'partial.mp3'

    with pytest.raises(OSError, match='connection lost'):
        fish_audio_service.synthesize(api_key='fish-secret', text='hello', output_path=str(output))

    assert not output.exists()
    assert not (tmp_path / 'partial.mp3.part').exists()
    response.close.assert_called_once()


def test_synthesize_total_timeout_stops_stream(monkeypatch, tmp_path):
    from services import fish_audio_service

    response = _response(chunks=[b'ID3', b'audio'])
    monkeypatch.setattr(fish_audio_service.requests, 'request', MagicMock(return_value=response))
    monkeypatch.setattr(fish_audio_service.time, 'monotonic', MagicMock(side_effect=[0, 0.5, 2.0]))
    output = tmp_path / 'timeout.mp3'

    with pytest.raises(TimeoutError, match='Fish Audio TTS 超过 1 秒未完成'):
        fish_audio_service.synthesize(
            api_key='fish-secret',
            text='hello',
            output_path=str(output),
            total_timeout=1,
        )

    assert not output.exists()
    assert not (tmp_path / 'timeout.mp3.part').exists()
    response.close.assert_called_once()


def test_list_voices_returns_only_safe_fields(monkeypatch):
    from services import fish_audio_service

    response = _response(payload={
        'total': 1,
        'items': [{
            '_id': 'voice-a',
            'title': 'Narrator',
            'state': 'trained',
            'languages': ['zh'],
            'visibility': 'private',
            'author': {'email': 'private@example.com'},
        }],
    })
    monkeypatch.setattr(fish_audio_service.requests, 'request', MagicMock(return_value=response))

    result = fish_audio_service.list_voices('fish-secret')

    assert result == [{
        'id': 'voice-a',
        'title': 'Narrator',
        'state': 'trained',
        'languages': ['zh'],
        'visibility': 'private',
        'author': None,
        'like_count': 0,
        'task_count': 0,
    }]


def test_list_voices_excludes_unavailable_or_non_private_tts_models(monkeypatch):
    from services import fish_audio_service

    response = _response(payload={'items': [
        {'_id': 'ready', 'title': 'Ready', 'state': 'created', 'visibility': 'private', 'type': 'tts'},
        {'_id': 'training', 'title': 'Training', 'state': 'training', 'visibility': 'private', 'type': 'tts'},
        {'_id': 'public', 'title': 'Public', 'state': 'created', 'visibility': 'public', 'type': 'tts'},
        {'_id': 'other', 'title': 'Other', 'state': 'created', 'visibility': 'private', 'type': 'svc'},
    ]})
    monkeypatch.setattr(fish_audio_service.requests, 'request', MagicMock(return_value=response))

    assert [voice['id'] for voice in fish_audio_service.list_voices('fish-secret')] == ['ready']


def test_list_voices_can_return_public_tts_models(monkeypatch):
    from services import fish_audio_service

    response = _response(payload={'items': [
        {'_id': 'public', 'title': 'Public', 'state': 'created', 'visibility': 'public', 'type': 'tts', 'like_count': 12, 'task_count': 34},
        {'_id': 'private', 'title': 'Private', 'state': 'created', 'visibility': 'private', 'type': 'tts'},
    ]})
    request = MagicMock(return_value=response)
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)

    voices = fish_audio_service.list_voices('fish-secret', scope='public', sort_by='task_count')

    assert voices == [{
        'id': 'public',
        'title': 'Public',
        'state': 'created',
        'languages': [],
        'visibility': 'public',
        'author': None,
        'like_count': 12,
        'task_count': 34,
    }]
    assert request.call_args.kwargs['params']['self'] == 'false'
    assert request.call_args.kwargs['params']['sort_by'] == 'task_count'


def test_list_voices_reads_all_pages(monkeypatch):
    from services import fish_audio_service

    first = _response(payload={
        'total': 2,
        'items': [{'_id': 'one', 'state': 'created', 'visibility': 'private', 'type': 'tts'}],
    })
    second = _response(payload={
        'total': 2,
        'items': [{'_id': 'two', 'state': 'created', 'visibility': 'private', 'type': 'tts'}],
    })
    request = MagicMock(side_effect=[first, second])
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)

    voices = fish_audio_service.list_voices('fish-secret', page_size=1)

    assert [voice['id'] for voice in voices] == ['one', 'two']
    assert request.call_args_list[1].kwargs['params']['page_number'] == 2


def test_create_voice_keeps_transcripts_aligned_with_samples(monkeypatch):
    from services import fish_audio_service

    request = MagicMock(return_value=_response(payload={'_id': 'voice-new', 'title': 'New'}))
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)

    fish_audio_service.create_private_voice('fish-secret', title='New', samples=[
        {'filename': 'one.mp3', 'content': b'one', 'text': ''},
        {'filename': 'two.mp3', 'content': b'two', 'text': '第二段文字'},
    ])

    assert [value for key, value in request.call_args.kwargs['data'] if key == 'texts'] == ['', '第二段文字']


def test_retryable_errors_back_off_without_leaking_key(monkeypatch):
    from services import fish_audio_service

    failed = _response(status=429, payload={'message': 'slow down'})
    succeeded = _response(payload={'total': 0, 'items': []})
    request = MagicMock(side_effect=[failed, succeeded])
    sleep = MagicMock()
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)
    monkeypatch.setattr(fish_audio_service.time, 'sleep', sleep)

    assert fish_audio_service.list_voices('fish-secret') == []
    assert request.call_count == 2
    sleep.assert_called_once()
    failed.close.assert_called_once()
    assert request.call_args_list[0].kwargs['timeout'] == request.call_args_list[1].kwargs['timeout'] == (15, 60)


def test_transcribe_posts_audio_and_normalizes_timestamps(monkeypatch, tmp_path):
    from services import fish_audio_service

    audio_path = tmp_path / 'page.mp3'
    audio_path.write_bytes(b'ID3audio')
    response = _response(payload={
        'text': '欢迎观看',
        'duration': 2.4,
        'segments': [
            {'text': '欢迎', 'start': 0.1, 'end': 1.0},
            {'text': '观看', 'start': 1.0, 'end': 2.3},
        ],
    }, content_type='application/json')
    request = MagicMock(return_value=response)
    monkeypatch.setattr(fish_audio_service.requests, 'request', request)

    result = fish_audio_service.transcribe(
        api_key='fish-secret',
        audio_path=str(audio_path),
        language='zh',
        include_timestamps=True,
    )

    assert result == {
        'text': '欢迎观看',
        'duration': 2.4,
        'segments': [
            {'text': '欢迎', 'start': 0.1, 'end': 1.0},
            {'text': '观看', 'start': 1.0, 'end': 2.3},
        ],
    }
    kwargs = request.call_args.kwargs
    assert request.call_args.args[1].endswith('/v1/asr')
    assert kwargs['data']['language'] == 'zh'
    assert kwargs['data']['ignore_timestamps'] == 'false'
    assert kwargs['files']['audio'][0] == 'page.mp3'
    response.close.assert_called_once()


def test_voice_clone_requires_consent(client):
    response = client.post(
        '/api/settings/fish-audio/voices',
        data={
            'title': 'Unauthorized clone',
            'voices': (io.BytesIO(b'fake-audio'), 'sample.mp3'),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 400
    assert '授权' in response.get_json()['error']['message']


def test_fish_audio_key_is_encrypted_and_not_returned(client, app):
    response = client.put('/api/settings/', json={'fish_audio_api_key': 'fish-secret-value'})
    assert response.status_code == 200
    assert response.get_json()['data']['fish_audio_api_key_length'] == len('fish-secret-value')
    assert 'fish-secret-value' not in response.get_data(as_text=True)

    with app.app_context():
        from models import db, Settings
        from sqlalchemy import text

        settings = Settings.get_settings()
        raw = db.session.execute(
            text('SELECT fish_audio_api_key FROM settings WHERE id = :id'),
            {'id': settings.id},
        ).scalar_one()
        assert raw != 'fish-secret-value'
        assert raw.startswith('dpapi:v1:')


@pytest.mark.parametrize('filename', ['sample.txt', 'sample.exe'])
def test_voice_clone_rejects_non_audio_files(client, filename):
    response = client.post(
        '/api/settings/fish-audio/voices',
        data={
            'title': 'Narrator',
            'consent_confirmed': 'true',
            'voices': (io.BytesIO(b'not-audio'), filename),
        },
        content_type='multipart/form-data',
    )

    assert response.status_code == 400
