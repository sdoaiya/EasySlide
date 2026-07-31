import hashlib
import json
import os
import re
from html.parser import HTMLParser
from pathlib import Path


TOP_LEVEL_FIELDS = {
    'schema_version', 'page_id', 'scene_manifest_sha256', 'width', 'height',
    'html', 'css', 'assets', 'warnings',
}
ASSET_FIELDS = {'asset_id', 'source', 'data_url', 'mime_type'}
SHA256_PATTERN = re.compile(r'^[0-9a-f]{64}$')
REMOTE_OR_SCRIPT_PATTERN = re.compile(r'(?i)(?:https?:)?//|javascript:')
DANGEROUS_TAGS = {'script', 'iframe', 'object', 'embed'}
VOID_TAGS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
RESOURCE_ATTRIBUTES = {'src', 'srcset', 'poster', 'href', 'xlink:href'}
CSS_URL_PATTERN = re.compile(r'url\(\s*(["\']?)(.*?)\1\s*\)', re.IGNORECASE)


def _require_exact_fields(payload, fields, label):
    missing = fields - set(payload)
    if missing:
        raise ValueError(f'{label} 缺少必填字段: {sorted(missing)[0]}')
    unexpected = set(payload) - fields
    if unexpected:
        raise ValueError(f'{label} 包含未知字段: {sorted(unexpected)[0]}')


class _BundleHTMLValidator(HTMLParser):
    def __init__(self, page_id):
        super().__init__(convert_charrefs=True)
        self.page_id = page_id
        self.depth = 0
        self.root_count = 0
        self.motion_ids = []

    def handle_starttag(self, tag, attrs):
        self._handle_tag(tag, attrs, closes=False)

    def handle_startendtag(self, tag, attrs):
        self._handle_tag(tag, attrs, closes=True)

    def handle_endtag(self, _tag):
        if self.depth:
            self.depth -= 1

    def _handle_tag(self, tag, attrs, *, closes):
        tag = tag.lower()
        attributes = {str(name).lower(): value or '' for name, value in attrs}
        if tag in DANGEROUS_TAGS:
            raise ValueError(f'原生场景包包含可执行标签: {tag}')
        if any(name.startswith('on') or name == 'srcdoc' for name in attributes):
            raise ValueError('原生场景包包含事件或可执行属性')
        if any(
            REMOTE_OR_SCRIPT_PATTERN.search(value)
            for name, value in attributes.items()
            if not (name in RESOURCE_ATTRIBUTES and value.strip().lower().startswith('data:'))
        ):
            raise ValueError('原生场景包 HTML 包含远程或危险资源')
        for name in RESOURCE_ATTRIBUTES & set(attributes):
            _validate_resource_value(attributes[name], name)
        if self.depth == 0:
            self.root_count += 1
            classes = set(attributes.get('class', '').split())
            if 'native-slide' not in classes or attributes.get('data-page-id') != self.page_id:
                raise ValueError('原生场景包 HTML 根节点与页面不匹配')
        motion_id = attributes.get('data-motion-id')
        if motion_id is not None:
            if not motion_id:
                raise ValueError('原生场景包 data-motion-id 不能为空')
            self.motion_ids.append(motion_id)
        if not closes and tag not in VOID_TAGS:
            self.depth += 1


def _validate_resource_value(value, attribute):
    normalized = value.strip()
    if not normalized:
        return
    candidates = (
        re.split(r',\s+(?=\S)', normalized)
        if attribute == 'srcset'
        else [normalized]
    )
    for candidate in candidates:
        source = candidate.strip().split(None, 1)[0]
        if not source.lower().startswith('data:') and not source.startswith('#'):
            raise ValueError('原生场景包 HTML 包含未内联资源')


def _validate_css(css):
    if re.search(r'(?i)@import\b|expression\s*\(|javascript\s*:|</style\s*>', css):
        raise ValueError('原生场景包 CSS 包含远程或危险资源')
    for match in CSS_URL_PATTERN.finditer(css):
        value = match.group(2).strip()
        if value and not value.lower().startswith('data:') and not value.startswith('#'):
            raise ValueError('原生场景包 CSS 包含未内联资源')


def validate_native_scene_bundle(
    payload,
    expected_page_id=None,
    expected_scene_manifest_sha256=None,
):
    if not isinstance(payload, dict):
        raise ValueError('原生场景包必须是 JSON 对象')
    _require_exact_fields(payload, TOP_LEVEL_FIELDS, '原生场景包')
    if payload.get('schema_version') != 1:
        raise ValueError('原生场景包 schema_version 必须为 1')
    page_id = payload.get('page_id')
    if not isinstance(page_id, str) or not page_id:
        raise ValueError('原生场景包缺少 page_id')
    if expected_page_id is not None and page_id != expected_page_id:
        raise ValueError(f'原生场景包页面不匹配: {page_id}')
    scene_digest = payload.get('scene_manifest_sha256')
    if not isinstance(scene_digest, str) or not SHA256_PATTERN.fullmatch(scene_digest):
        raise ValueError('原生场景包缺少有效 Scene Manifest SHA-256')
    if expected_scene_manifest_sha256 is not None and scene_digest != expected_scene_manifest_sha256:
        raise ValueError('原生场景包与场景清单哈希不一致')
    if payload.get('width') != 1920 or payload.get('height') != 1080:
        raise ValueError('原生场景包尺寸必须为 1920x1080')

    html = payload.get('html')
    css = payload.get('css')
    if not isinstance(html, str) or not html:
        raise ValueError('原生场景包 html 必须是非空文本')
    if not isinstance(css, str):
        raise ValueError('原生场景包 css 必须是文本')
    _validate_css(css)
    parser = _BundleHTMLValidator(page_id)
    parser.feed(html)
    parser.close()
    if parser.root_count != 1 or parser.depth != 0:
        raise ValueError('原生场景包 HTML 必须只有一个完整根节点')
    if not parser.motion_ids:
        raise ValueError('原生场景包至少需要一个 data-motion-id')
    if len(parser.motion_ids) != len(set(parser.motion_ids)):
        raise ValueError('原生场景包 data-motion-id 不允许重复')

    assets = payload.get('assets')
    if not isinstance(assets, list):
        raise ValueError('原生场景包 assets 必须是数组')
    asset_ids = set()
    for asset in assets:
        if not isinstance(asset, dict):
            raise ValueError('原生场景包 asset 必须是 JSON 对象')
        _require_exact_fields(asset, ASSET_FIELDS, '原生场景包 asset')
        asset_id = asset.get('asset_id')
        if not isinstance(asset_id, str) or not asset_id or asset_id in asset_ids:
            raise ValueError(f'原生场景包 asset_id 重复或为空: {asset_id}')
        asset_ids.add(asset_id)
        mime_type = asset.get('mime_type')
        data_url = asset.get('data_url')
        if not isinstance(asset.get('source'), str):
            raise ValueError('原生场景包 asset.source 必须是文本')
        if not isinstance(mime_type, str) or not mime_type:
            raise ValueError('原生场景包 asset.mime_type 必须是非空文本')
        if not isinstance(data_url, str) or not data_url.startswith(f'data:{mime_type}'):
            raise ValueError('原生场景包 asset 只能包含匹配 MIME 的 Data URL')

    warnings = payload.get('warnings')
    if (
        not isinstance(warnings, list)
        or any(not isinstance(warning, str) for warning in warnings)
        or len(warnings) != len(set(warnings))
    ):
        raise ValueError('原生场景包 warnings 必须是无重复文本数组')
    return payload


def _canonical_bytes(payload):
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).encode('utf-8')


def save_native_scene_bundles(bundles, directory, scene_manifest_refs, page_ids):
    if not isinstance(bundles, list) or len(bundles) != len(page_ids):
        raise ValueError('原生场景包数量与导出页面不一致')
    if not isinstance(scene_manifest_refs, list) or len(scene_manifest_refs) != len(page_ids):
        raise ValueError('原生场景包缺少对应的场景清单')
    target_dir = Path(directory)
    target_dir.mkdir(parents=True, exist_ok=True)
    references = []
    for index, (bundle, scene_ref, page_id) in enumerate(
        zip(bundles, scene_manifest_refs, page_ids)
    ):
        if not isinstance(scene_ref, dict) or scene_ref.get('page_id') != page_id:
            raise ValueError('原生场景包与场景清单页面顺序不一致')
        validated = validate_native_scene_bundle(
            bundle,
            page_id,
            scene_ref.get('sha256'),
        )
        content = _canonical_bytes(validated)
        digest = hashlib.sha256(content).hexdigest()
        safe_page = hashlib.sha256(page_id.encode('utf-8')).hexdigest()[:16]
        path = target_dir / f'native_scene_{index:04d}_{safe_page}.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(content)
        os.replace(temporary, path)
        references.append({
            'page_id': page_id,
            'path': str(path.resolve()),
            'sha256': digest,
        })
    return references


def load_native_scene_bundle(
    reference,
    expected_page_id=None,
    expected_scene_manifest_sha256=None,
):
    if not isinstance(reference, dict):
        raise ValueError('原生场景包引用无效')
    path = Path(str(reference.get('path') or ''))
    content = path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if digest != reference.get('sha256'):
        raise ValueError('原生场景包校验失败，请重新创建导出任务')
    payload = json.loads(content.decode('utf-8'))
    return validate_native_scene_bundle(
        payload,
        expected_page_id or reference.get('page_id'),
        expected_scene_manifest_sha256,
    )
