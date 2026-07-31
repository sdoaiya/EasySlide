import os
import os
import shutil
from pathlib import Path


def _hyperframes_runtime(packaged_executable=None):
    from services.hyperframes_renderer import HyperframesRuntime

    if packaged_executable:
        return HyperframesRuntime.for_packaged(packaged_executable)
    project_root = Path(__file__).resolve().parents[2]
    return HyperframesRuntime.for_development(
        project_root,
        browser_path=os.environ.get('HYPERFRAMES_BROWSER_PATH'),
    )


def render_page_visual(
    *,
    page,
    motion_manifest,
    output_path,
    output_root,
    duration,
    width,
    height,
    fps,
    ffmpeg_path,
    effect,
    enable_ken_burns,
    fade_in_seconds,
    fade_out_seconds,
    motion_intensity,
    include_silent_audio,
    hyperframes_enabled=False,
    hyperframes_executable=None,
):
    from services import tts_video_service as legacy

    warnings = []
    fallback_from = None
    fallback_reason = None
    bundle_ref = page.get('native_scene_bundle_ref')
    if hyperframes_enabled and bundle_ref and motion_manifest and not include_silent_audio:
        try:
            from services.hyperframes_renderer import render_page
            from services.native_scene_bundle import load_native_scene_bundle

            bundle = load_native_scene_bundle(
                bundle_ref,
                page.get('page_id'),
                motion_manifest.get('scene_manifest_sha256'),
            )
            result = render_page(
                bundle,
                motion_manifest,
                output_root,
                _hyperframes_runtime(hyperframes_executable),
            )
            rendered_path = Path(result['output_path'])
            target_path = Path(output_path)
            if rendered_path.resolve() != target_path.resolve():
                shutil.copy2(rendered_path, target_path)
            return {
                'output_path': str(target_path),
                'renderer': 'hyperframes',
                'warnings': list(result.get('warnings') or []),
            }
        except Exception as exc:
            fallback_from = 'hyperframes'
            fallback_reason = str(exc)
            warnings.append(f'Hyperframes 渲染失败，已自动降级：{exc}')

    stage_image_paths = [
        path for path in (page.get('stage_image_paths') or [])
        if isinstance(path, str) and os.path.isfile(path)
    ]
    if len(stage_image_paths) > 1:
        try:
            legacy.create_staged_clip(
                stage_image_paths,
                output_path,
                duration,
                width=width,
                height=height,
                fps=fps,
                ffmpeg_path=ffmpeg_path,
                include_silent_audio=include_silent_audio,
            )
            return {
                'output_path': output_path,
                'renderer': 'browser_frames',
                'warnings': warnings,
                'fallback_from': fallback_from,
                'fallback_reason': fallback_reason,
            }
        except Exception as exc:
            fallback_from = 'browser_frames'
            fallback_reason = str(exc)
            warnings.append(f'阶段帧渲染失败，已自动降级：{exc}')

    image_path = page['image_path']
    if include_silent_audio:
        legacy.create_silent_clip(
            image_path,
            output_path,
            duration=duration,
            width=width,
            height=height,
            fps=fps,
            effect_type=effect,
            enable_ken_burns=effect != 'static' and enable_ken_burns,
            ffmpeg_path=ffmpeg_path,
            fade_in_seconds=fade_in_seconds,
            fade_out_seconds=fade_out_seconds,
            motion_intensity=motion_intensity,
        )
        renderer = 'ken_burns' if effect != 'static' and enable_ken_burns else 'static_frame'
    elif effect != 'static' and enable_ken_burns:
        legacy.create_ken_burns_clip(
            image_path,
            output_path,
            duration,
            width=width,
            height=height,
            fps=fps,
            effect_type=effect,
            ffmpeg_path=ffmpeg_path,
            fade_in_seconds=fade_in_seconds,
            fade_out_seconds=fade_out_seconds,
            motion_intensity=motion_intensity,
        )
        renderer = 'ken_burns'
    else:
        legacy.create_static_clip(
            image_path,
            output_path,
            duration,
            width=width,
            height=height,
            fps=fps,
            ffmpeg_path=ffmpeg_path,
            fade_in_seconds=fade_in_seconds,
            fade_out_seconds=fade_out_seconds,
        )
        renderer = 'static_frame'
    return {
        'output_path': output_path,
        'renderer': renderer,
        'warnings': warnings,
        'fallback_from': fallback_from,
        'fallback_reason': fallback_reason,
    }
