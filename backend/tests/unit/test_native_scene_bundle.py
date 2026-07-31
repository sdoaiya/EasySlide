import json
from pathlib import Path

import pytest

from services.native_scene_bundle import (
    load_native_scene_bundle,
    save_native_scene_bundles,
    validate_native_scene_bundle,
)


def _bundle(page_id='page-1', scene_sha='a' * 64):
    return {
        'schema_version': 1,
        'page_id': page_id,
        'scene_manifest_sha256': scene_sha,
        'width': 1920,
        'height': 1080,
        'html': (
            f'<div class="native-slide" data-page-id="{page_id}">'
            '<h1 data-motion-id="title">标题</h1></div>'
        ),
        'css': '.native-slide{background:#fff}',
        'assets': [{
            'asset_id': 'asset-1',
            'source': '/local/image.png',
            'data_url': 'data:image/png;base64,AA==',
            'mime_type': 'image/png',
        }],
        'warnings': [],
    }


def _scene_ref(page_id='page-1', digest='a' * 64):
    return {'page_id': page_id, 'path': '/scene.json', 'sha256': digest}


def test_save_load_is_canonical_and_bound_to_scene_manifest(tmp_path):
    refs = save_native_scene_bundles(
        [_bundle()],
        tmp_path,
        [_scene_ref()],
        ['page-1'],
    )

    assert set(refs[0]) == {'page_id', 'path', 'sha256'}
    assert Path(refs[0]['path']).name.startswith('native_scene_0000_')
    assert load_native_scene_bundle(refs[0], 'page-1', 'a' * 64)['html'].startswith('<div')
    saved = Path(refs[0]['path']).read_text(encoding='utf-8')
    assert saved == json.dumps(_bundle(), ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def test_page_id_cannot_escape_target_directory(tmp_path):
    page_id = '../../escape'
    refs = save_native_scene_bundles(
        [_bundle(page_id)],
        tmp_path,
        [_scene_ref(page_id)],
        [page_id],
    )

    assert Path(refs[0]['path']).parent == tmp_path.resolve()
    assert '..' not in Path(refs[0]['path']).name


@pytest.mark.parametrize(
    ('mutate', 'message'),
    [
        (lambda value: value.update(html='<script>alert(1)</script>'), '可执行标签'),
        (lambda value: value.update(html='<div class="native-slide" data-page-id="page-1" onclick="x()" data-motion-id="title"></div>'), '事件或可执行属性'),
        (lambda value: value.update(html='<div class="native-slide" data-page-id="page-1"><img src="https://example.com/a.png" data-motion-id="title"></div>'), '远程或危险资源'),
        (lambda value: value.update(html='<div class="native-slide" data-page-id="page-1"><img src="/local/a.png" data-motion-id="title"></div>'), '未内联资源'),
        (lambda value: value.update(css='@import url(https://example.com/a.css)'), '远程或危险资源'),
        (lambda value: value.update(html='<div class="native-slide" data-page-id="page-1"><i data-motion-id="x"></i><b data-motion-id="x"></b></div>'), '不允许重复'),
    ],
)
def test_rejects_executable_or_nondeterministic_content(mutate, message):
    bundle = _bundle()
    mutate(bundle)

    with pytest.raises(ValueError, match=message):
        validate_native_scene_bundle(bundle, 'page-1', 'a' * 64)


def test_rejects_scene_hash_divergence(tmp_path):
    with pytest.raises(ValueError, match='场景清单哈希不一致'):
        save_native_scene_bundles(
            [_bundle(scene_sha='b' * 64)],
            tmp_path,
            [_scene_ref(digest='a' * 64)],
            ['page-1'],
        )


def test_allows_inline_base64_containing_double_slashes():
    bundle = _bundle()
    bundle['html'] = (
        '<div class="native-slide" data-page-id="page-1">'
        '<img src="data:image/png;base64,////" data-motion-id="title"></div>'
    )

    assert validate_native_scene_bundle(bundle, 'page-1', 'a' * 64) == bundle


def test_loader_rejects_tampering(tmp_path):
    refs = save_native_scene_bundles(
        [_bundle()],
        tmp_path,
        [_scene_ref()],
        ['page-1'],
    )
    Path(refs[0]['path']).write_text('{}', encoding='utf-8')

    with pytest.raises(ValueError, match='校验失败'):
        load_native_scene_bundle(refs[0], 'page-1', 'a' * 64)
