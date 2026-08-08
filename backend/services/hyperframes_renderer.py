import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath


EFFECTS = {
    'fade_in', 'fade_up', 'slide_in', 'scale_in', 'mask_reveal',
    'chart_reveal', 'count_up', 'highlight', 'drift',
}
CAMERA_PRESETS = {'static', 'subtle_push', 'pan_left', 'pan_right'}
RESOURCE_ATTRIBUTES = {
    'src', 'srcset', 'poster', 'href', 'xlink:href', 'action', 'formaction',
}
DANGEROUS_TAGS = {'script', 'iframe', 'object', 'embed', 'base', 'link'}
CSS_URL_RE = re.compile(r'url\(\s*(["\']?)(.*?)\1\s*\)', re.IGNORECASE)


class HyperframesRendererError(RuntimeError):
    def __init__(self, message, *, category):
        super().__init__(message)
        self.category = category


class HyperframesCompositionError(HyperframesRendererError):
    def __init__(self, message):
        super().__init__(message, category='composition')


class HyperframesRuntimeError(HyperframesRendererError):
    def __init__(self, message):
        super().__init__(message, category='runtime')


class HyperframesTimeoutError(HyperframesRendererError):
    def __init__(self, message):
        super().__init__(message, category='timeout')


class HyperframesProcessError(HyperframesRendererError):
    def __init__(self, message, *, category='nonzero_exit'):
        super().__init__(message, category=category)


class HyperframesEmptyOutputError(HyperframesRendererError):
    def __init__(self, message):
        super().__init__(message, category='empty_output')


@dataclass(frozen=True)
class HyperframesRuntime:
    mode: str
    executable: Path
    cli_path: Path
    browser_path: Path | None = None

    @classmethod
    def for_development(
        cls,
        project_root,
        *,
        node_executable=None,
        browser_path=None,
    ):
        root = Path(project_root).resolve()
        node_value = node_executable or shutil.which('node')
        if not node_value:
            raise HyperframesRuntimeError('未找到 Node.js，无法启动 Hyperframes')
        node = Path(node_value).resolve()
        cli = (
            root / 'desktop' / 'node_modules' / 'hyperframes' / 'bin'
            / 'hyperframes.mjs'
        ).resolve()
        if not node.is_file():
            raise HyperframesRuntimeError(f'Node.js 可执行文件不存在: {node}')
        if not cli.is_file():
            raise HyperframesRuntimeError(f'开发环境 Hyperframes CLI 不存在: {cli}')
        browser = _optional_existing_file(browser_path, 'Hyperframes browser')
        return cls('development', node, cli, browser)

    @classmethod
    def for_packaged(cls, executable):
        electron = Path(executable).resolve()
        if not electron.is_file():
            raise HyperframesRuntimeError(f'Electron 可执行文件不存在: {electron}')
        resources = electron.parent / 'resources'
        app_asar = resources / 'app.asar'
        if not app_asar.is_file():
            raise HyperframesRuntimeError(f'打包运行时 app.asar 不存在: {app_asar}')

        browser_root = resources / 'hyperframes-browser'
        browser_manifest = browser_root / 'browser.json'
        try:
            manifest = json.loads(browser_manifest.read_text(encoding='utf-8'))
            browser_entry = manifest['executable']
        except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HyperframesRuntimeError('随包 Hyperframes browser.json 无效') from exc
        browser = _resolve_packaged_browser(browser_root, browser_entry)
        cli = (
            app_asar / 'node_modules' / 'hyperframes' / 'bin'
            / 'hyperframes.mjs'
        ).resolve()
        return cls('packaged', electron, cli, browser)


class _BundleHTMLInspector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.motion_ids = set()
        self.errors = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in DANGEROUS_TAGS:
            self.errors.append(f'场景 HTML 包含危险标签: {tag}')
        for raw_name, value in attrs:
            name = raw_name.lower()
            value = value or ''
            if name.startswith('on') or name == 'srcdoc':
                self.errors.append(f'场景 HTML 包含可执行属性: {name}')
            if name == 'data-motion-id':
                if not value or value in self.motion_ids:
                    self.errors.append('场景 HTML data-motion-id 缺失或重复')
                self.motion_ids.add(value)
            if name == 'style':
                _validate_css(value, self.errors, '场景 HTML style')
            if name in RESOURCE_ATTRIBUTES:
                _validate_resource_value(value, self.errors, name)

    handle_startendtag = handle_starttag


def _optional_existing_file(value, label):
    if value is None:
        return None
    path = Path(value).resolve()
    if not path.is_file():
        raise HyperframesRuntimeError(f'{label} 不存在: {path}')
    return path


def _resolve_packaged_browser(browser_root, browser_entry):
    if not isinstance(browser_entry, str) or not browser_entry.strip():
        raise HyperframesRuntimeError('随包 Hyperframes browser.json executable 无效')
    normalized = browser_entry.replace('\\', '/')
    relative = PurePosixPath(normalized)
    if (
        relative.is_absolute()
        or '..' in relative.parts
        or any(':' in part for part in relative.parts)
    ):
        raise HyperframesRuntimeError('随包 Hyperframes browser.json 路径不安全')
    root = Path(browser_root).resolve()
    browser = root.joinpath(*relative.parts).resolve()
    _require_within(root, browser, '随包 Hyperframes browser.json 路径不安全')
    if not browser.is_file():
        raise HyperframesRuntimeError(f'随包 Hyperframes browser 不存在: {browser}')
    return browser


def _require_within(root, candidate, message):
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HyperframesRuntimeError(message) from exc


def _validate_resource_value(value, errors, attribute):
    normalized = value.strip()
    if not normalized:
        return
    if not normalized.lower().startswith('data:') and re.search(
        r'(?i)(?:https?:)?//|javascript\s*:', normalized,
    ):
        errors.append(f'场景 HTML {attribute} 包含远程资源或未内联资源')
        return
    candidates = (
        re.split(r',\s+(?=\S)', normalized)
        if attribute == 'srcset'
        else [normalized]
    )
    if any(
        not candidate.strip().split(None, 1)[0].lower().startswith('data:')
        and not candidate.strip().startswith('#')
        for candidate in candidates
    ):
        errors.append(f'场景 HTML {attribute} 包含远程资源或未内联资源')


def _validate_css(css, errors, label):
    if re.search(r'</style\s*>', css, re.IGNORECASE):
        errors.append(f'{label} 包含危险的 CSS 结束标签')
    if re.search(r'@import\b|expression\s*\(|javascript\s*:', css, re.IGNORECASE):
        errors.append(f'{label} 包含危险 CSS')
    for match in CSS_URL_RE.finditer(css):
        value = match.group(2).strip().lower()
        if value and not value.startswith(('data:', '#')):
            errors.append(f'{label} 包含远程资源或未内联资源')


def _validate_inputs(bundle, motion_manifest):
    if not isinstance(bundle, dict) or not isinstance(motion_manifest, dict):
        raise HyperframesCompositionError('场景包和 Motion Manifest 必须是对象')
    page_id = bundle.get('page_id')
    if not isinstance(page_id, str) or not page_id:
        raise HyperframesCompositionError('场景包 page_id 无效')
    if motion_manifest.get('page_id') != page_id:
        raise HyperframesCompositionError('场景包与 Motion Manifest 页面不匹配')
    scene_hash = bundle.get('scene_manifest_sha256')
    if motion_manifest.get('scene_manifest_sha256') != scene_hash:
        raise HyperframesCompositionError('场景包与 Motion Manifest 场景 hash 不匹配')
    if bundle.get('width') != 1920 or bundle.get('height') != 1080:
        raise HyperframesCompositionError('原生场景包必须为 1920x1080')
    duration_ms = motion_manifest.get('duration_ms')
    if isinstance(duration_ms, bool) or not isinstance(duration_ms, int) or duration_ms <= 0:
        raise HyperframesCompositionError('Motion Manifest duration_ms 无效')

    bundle_html = bundle.get('html')
    bundle_css = bundle.get('css')
    if not isinstance(bundle_html, str) or not bundle_html:
        raise HyperframesCompositionError('场景包 HTML 无效')
    if not isinstance(bundle_css, str):
        raise HyperframesCompositionError('场景包 CSS 无效')
    inspector = _BundleHTMLInspector()
    inspector.feed(bundle_html)
    inspector.close()
    _validate_css(bundle_css, inspector.errors, '场景包 CSS')

    assets = bundle.get('assets')
    if not isinstance(assets, list) or any(
        not isinstance(asset, dict)
        or not isinstance(asset.get('data_url'), str)
        or not asset['data_url'].lower().startswith('data:')
        for asset in assets
    ):
        inspector.errors.append('场景包资源必须全部为 data URL')

    elements = motion_manifest.get('elements')
    if not isinstance(elements, list):
        raise HyperframesCompositionError('Motion Manifest elements 无效')
    for index, motion in enumerate(elements):
        if not isinstance(motion, dict):
            inspector.errors.append(f'Motion Manifest elements[{index}] 无效')
            continue
        if motion.get('element_id') not in inspector.motion_ids:
            inspector.errors.append(
                f"Motion Manifest data-motion-id 不存在: {motion.get('element_id')}",
            )
        if motion.get('effect') not in EFFECTS:
            inspector.errors.append(f"Motion Manifest effect 不支持: {motion.get('effect')}")
    camera = motion_manifest.get('camera')
    if not isinstance(camera, dict) or camera.get('preset') not in CAMERA_PRESETS:
        inspector.errors.append('Motion Manifest camera 不支持')
    if inspector.errors:
        raise HyperframesCompositionError(inspector.errors[0])


def _format_seconds(milliseconds):
    value = milliseconds / 1000
    return f'{value:.3f}'.rstrip('0').rstrip('.')


def _javascript_json(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(',', ':'),
    ).replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')


def _load_gsap_source(gsap_source):
    if gsap_source is None:
        root = Path(__file__).resolve().parents[2]
        path = root / 'experiments' / 'hyperframes-m0' / 'assets' / 'gsap.min.js'
        try:
            gsap_source = path.read_text(encoding='utf-8')
        except OSError as exc:
            raise HyperframesRuntimeError(f'离线 GSAP 运行时不存在: {path}') from exc
    if not isinstance(gsap_source, str) or not gsap_source.strip():
        raise HyperframesRuntimeError('离线 GSAP 运行时为空')
    if re.search(r'</script\s*>', gsap_source, re.IGNORECASE):
        raise HyperframesRuntimeError('离线 GSAP 运行时包含不安全的 script 结束标签')
    return gsap_source


def _build_composition_html(bundle, motion_manifest, gsap_source):
    page_key = hashlib.sha256(bundle['page_id'].encode('utf-8')).hexdigest()[:16]
    composition_id = f'easyslide-page-{page_key}'
    duration = _format_seconds(motion_manifest['duration_ms'])
    motions = [
        {
            'element_id': motion['element_id'],
            'effect': motion['effect'],
            'start': motion['start_ms'] / 1000,
            'duration': motion['duration_ms'] / 1000,
            'easing': motion['easing'],
        }
        for motion in motion_manifest['elements']
    ]
    camera = {
        'preset': motion_manifest['camera']['preset'],
        'start': motion_manifest['camera']['start_ms'] / 1000,
        'duration': (
            motion_manifest['camera']['end_ms']
            - motion_manifest['camera']['start_ms']
        ) / 1000,
    }
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EasySlide page composition</title>
  <style>
    *{{box-sizing:border-box}}
    html,body{{width:100%;height:100%;margin:0;overflow:hidden}}
    [data-composition-id="{composition_id}"]{{position:relative;width:1920px;height:1080px;overflow:hidden}}
    #hyperframes-stage{{position:absolute;inset:0;width:1920px;height:1080px;transform-origin:center center}}
    {bundle['css']}
  </style>
</head>
<body>
  <main id="hyperframes-root" data-composition-id="{composition_id}" data-start="0" data-duration="{duration}" data-track-index="0" data-width="1920" data-height="1080">
    <div id="hyperframes-stage">{bundle['html']}</div>
  </main>
  <script>{gsap_source}</script>
  <script>
    window.__timelines = window.__timelines || {{}};
    const compositionId = {_javascript_json(composition_id)};
    const motions = {_javascript_json(motions)};
    const camera = {_javascript_json(camera)};
    const motionElements = new Map(
      Array.from(document.querySelectorAll('[data-motion-id]')).map((element) => [element.dataset.motionId, element])
    );
    const timeline = gsap.timeline({{ paused: true }});

    function addCountUp(target, motion) {{
      const original = target.textContent || '';
      const match = original.match(/-?\\d+(?:\\.\\d+)?/);
      if (!match) {{
        timeline.from(target, {{ opacity: 0, duration: motion.duration, ease: motion.easing }}, motion.start);
        return;
      }}
      const decimals = (match[0].split('.')[1] || '').length;
      const state = {{ value: 0 }};
      const prefix = original.slice(0, match.index);
      const suffix = original.slice(match.index + match[0].length);
      timeline.fromTo(state, {{ value: 0 }}, {{
        value: Number(match[0]),
        duration: motion.duration,
        ease: motion.easing,
        onUpdate: () => {{ target.textContent = prefix + state.value.toFixed(decimals) + suffix; }},
      }}, motion.start);
    }}

    function addEffect(target, motion) {{
      const timing = {{ duration: motion.duration, ease: motion.easing }};
      switch (motion.effect) {{
        case 'fade_in': timeline.from(target, {{ opacity: 0, ...timing }}, motion.start); break;
        case 'fade_up': timeline.from(target, {{ y: 48, opacity: 0, ...timing }}, motion.start); break;
        case 'slide_in': timeline.from(target, {{ x: -64, opacity: 0, ...timing }}, motion.start); break;
        case 'scale_in': timeline.from(target, {{ scale: 0.92, opacity: 0, ...timing }}, motion.start); break;
        case 'mask_reveal': timeline.from(target, {{ clipPath: 'inset(0 100% 0 0)', ...timing }}, motion.start); break;
        case 'chart_reveal': timeline.from(target, {{ scaleY: 0, transformOrigin: 'bottom center', ...timing }}, motion.start); break;
        case 'count_up': addCountUp(target, motion); break;
        case 'highlight': timeline.from(target, {{ scale: 1.03, filter: 'brightness(1.2)', ...timing }}, motion.start); break;
        case 'drift': timeline.from(target, {{ x: -20, opacity: 0.92, ...timing }}, motion.start); break;
      }}
    }}

    function addCameraMotion(stage, motion) {{
      const timing = {{ duration: motion.duration, ease: 'none' }};
      switch (motion.preset) {{
        case 'static': break;
        case 'subtle_push': timeline.fromTo(stage, {{ scale: 1 }}, {{ scale: 1.035, ...timing }}, motion.start); break;
        case 'pan_left': timeline.fromTo(stage, {{ x: 0 }}, {{ x: -24, ...timing }}, motion.start); break;
        case 'pan_right': timeline.fromTo(stage, {{ x: 0 }}, {{ x: 24, ...timing }}, motion.start); break;
      }}
    }}

    for (const motion of motions) addEffect(motionElements.get(motion.element_id), motion);
    addCameraMotion(document.getElementById('hyperframes-stage'), camera);
    window.__timelines[compositionId] = timeline;
  </script>
</body>
</html>
'''


def _safe_output_child(root, name):
    root = Path(root).resolve()
    candidate = (root / name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HyperframesCompositionError('Hyperframes 输出路径不安全') from exc
    return candidate


def _atomic_write_text(path, content):
    descriptor, temporary_value = tempfile.mkstemp(
        prefix=f'.{path.name}.',
        suffix='.tmp',
        dir=path.parent,
    )
    temporary = Path(temporary_value)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def create_page_composition(
    native_scene_bundle,
    motion_manifest,
    output_root,
    *,
    gsap_source=None,
):
    _validate_inputs(native_scene_bundle, motion_manifest)
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    page_key = hashlib.sha256(
        native_scene_bundle['page_id'].encode('utf-8'),
    ).hexdigest()[:16]
    composition_dir = _safe_output_child(root, f'hyperframes_page_{page_key}')
    if composition_dir.exists() and not composition_dir.is_dir():
        raise HyperframesCompositionError('Hyperframes composition 路径不是目录')
    composition_dir.mkdir(exist_ok=True)
    unexpected = [
        child for child in composition_dir.iterdir()
        if child.name != 'index.html'
    ]
    if unexpected:
        raise HyperframesCompositionError('Hyperframes composition 目录包含未知文件')
    index_path = composition_dir / 'index.html'
    if index_path.is_symlink():
        raise HyperframesCompositionError('Hyperframes index.html 路径不安全')
    content = _build_composition_html(
        native_scene_bundle,
        motion_manifest,
        _load_gsap_source(gsap_source),
    )
    _atomic_write_text(index_path, content)
    return composition_dir


def _runtime_environment(runtime):
    environment = os.environ.copy()
    if runtime.mode == 'packaged':
        environment['ELECTRON_RUN_AS_NODE'] = '1'
    if runtime.browser_path is not None:
        environment['HYPERFRAMES_BROWSER_PATH'] = str(runtime.browser_path)
    return environment


def _unique_warnings(*warning_groups):
    result = []
    seen = set()
    for warnings in warning_groups:
        if not isinstance(warnings, list):
            continue
        for warning in warnings:
            if warning not in seen:
                seen.add(warning)
                result.append(warning)
    return result


def render_page(
    native_scene_bundle,
    motion_manifest,
    output_root,
    runtime,
    *,
    gsap_source=None,
    timeout_seconds=300,
):
    if not isinstance(runtime, HyperframesRuntime):
        raise HyperframesRuntimeError('Hyperframes runtime 无效')
    if timeout_seconds <= 0:
        raise HyperframesRuntimeError('Hyperframes timeout 必须大于 0')
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    page_key = hashlib.sha256(
        native_scene_bundle['page_id'].encode('utf-8'),
    ).hexdigest()[:16]
    output_path = _safe_output_child(root, f'hyperframes_page_{page_key}.mp4')
    if output_path.exists() and not (output_path.is_file() or output_path.is_symlink()):
        raise HyperframesCompositionError('Hyperframes 输出目标不是文件')

    with tempfile.TemporaryDirectory(prefix='easyslide-hf-') as scratch_value:
        scratch_root = Path(scratch_value).resolve()
        composition_dir = create_page_composition(
            native_scene_bundle,
            motion_manifest,
            scratch_root,
            gsap_source=gsap_source,
        )
        temporary_output = scratch_root / f'page-{page_key}.mp4'
        command = [
            str(runtime.executable),
            str(runtime.cli_path),
            'render',
            str(composition_dir),
            '--output',
            str(temporary_output),
            '--fps',
            '25',
            '--quality',
            'high',
            '--workers',
            '1',
        ]
        run_options = {
            'capture_output': True,
            'text': True,
            'encoding': 'utf-8',
            'errors': 'replace',
            'timeout': timeout_seconds,
            'cwd': str(composition_dir),
            'env': _runtime_environment(runtime),
        }
        if os.name == 'nt':
            run_options['creationflags'] = subprocess.CREATE_NO_WINDOW

        try:
            completed = subprocess.run(command, **run_options)
        except subprocess.TimeoutExpired as exc:
            detail = (exc.stderr or exc.output or '').strip()
            message = f'Hyperframes 页面渲染超时（{timeout_seconds}s）'
            if detail:
                message = f'{message}: {detail}'
            raise HyperframesTimeoutError(message) from exc
        except OSError as exc:
            raise HyperframesProcessError(
                f'Hyperframes 进程启动失败: {exc}',
                category='launch_error',
            ) from exc

        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or '').strip()
            message = f'Hyperframes 页面渲染失败，退出码 {completed.returncode}'
            if detail:
                message = f'{message}: {detail}'
            raise HyperframesProcessError(message)
        if not temporary_output.is_file() or temporary_output.stat().st_size == 0:
            raise HyperframesEmptyOutputError(
                'Hyperframes 返回成功但未生成有效视频文件',
            )
        descriptor, staged_value = tempfile.mkstemp(
            prefix='.hf-',
            suffix='.tmp',
            dir=root,
        )
        os.close(descriptor)
        staged_output = Path(staged_value)
        try:
            shutil.copyfile(temporary_output, staged_output)
            os.replace(staged_output, output_path)
        finally:
            if staged_output.exists():
                staged_output.unlink()

    return {
        'output_path': str(output_path.resolve()),
        'renderer': 'hyperframes',
        'warnings': _unique_warnings(
            native_scene_bundle.get('warnings'),
            motion_manifest.get('warnings'),
        ),
    }
