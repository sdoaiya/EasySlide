"""
TTS Video Service — 将 PPT 页面转换为带旁白的播报视频

功能:
  1. edge-tts 文本转语音
  2. Ken Burns 动效（zoompan，可选）
  3. FFmpeg 视频合成与拼接
  4. ASS 字幕烧录
"""
import asyncio
import hashlib
import json
import logging
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import unicodedata
from typing import List, Optional, Callable, Tuple

from services.video_audio_timeline import build_page_audio_timeline


logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# 模块级常量
# ═══════════════════════════════════════════════════════════════════════════════

# 字幕单段最大字符数，超过此长度的句子将按次级标点二次拆分
_MAX_SUBTITLE_SEGMENT_LENGTH = 30

# 无旁白页面的默认静音片段时长（秒）
_DEFAULT_SILENT_DURATION = 3.0

# 整片头/尾的静音 padding（秒），避免播放器开场吃掉首词、结尾被截断
_LEADING_PAD_SECONDS = 0.8
_TRAILING_PAD_SECONDS = 1.2

# FFmpeg 连续多久没有任何输出才视为卡死
_FFMPEG_IDLE_TIMEOUT_SECONDS = 600.0

# 进度输出频率（秒）
_FFMPEG_PROGRESS_INTERVAL_SECONDS = 1.0

# Bing TTS 的连接偶发抖动时给导出一次恢复机会，最终失败仍由上层策略处理。
_TTS_MAX_ATTEMPTS = 3
_TTS_RETRY_BACKOFF_SECONDS = (1.0, 2.0)


def _hidden_subprocess_kwargs() -> dict:
    """Hide child process consoles on Windows desktop builds."""
    if os.name != 'nt':
        return {}

    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return {
        'creationflags': subprocess.CREATE_NO_WINDOW,
        'startupinfo': startupinfo,
    }


def _inject_ffmpeg_progress_args(cmd: List[str]) -> List[str]:
    """为 FFmpeg 命令追加进度输出，便于 idle watchdog 判断进程是否卡死。"""
    if '-progress' in cmd:
        return cmd
    return [
        cmd[0],
        '-nostats',
        '-progress', 'pipe:2',
        '-stats_period', str(_FFMPEG_PROGRESS_INTERVAL_SECONDS),
        *cmd[1:],
    ]


def _read_process_lines(stream, output_queue: "queue.Queue[str]", collected_lines: List[str]) -> None:
    """后台读取 stderr，既用于错误回溯，也用于 watchdog 判断是否仍有进展。"""
    try:
        for raw_line in iter(stream.readline, b''):
            line = raw_line.decode('utf-8', errors='replace').strip()
            if not line:
                continue
            collected_lines.append(line)
            if len(collected_lines) > 200:
                del collected_lines[:len(collected_lines) - 200]
            output_queue.put(line)
    finally:
        stream.close()


def _wait_for_process_with_idle_watchdog(
    proc: subprocess.Popen,
    error_prefix: str,
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
) -> None:
    """
    等待 FFmpeg 结束。

    不限制总执行时长，只要 stderr/progress 持续有输出就继续等待；
    连续 idle_timeout 秒没有任何新输出，才认为进程卡死。
    """
    stderr_queue: "queue.Queue[str]" = queue.Queue()
    stderr_lines: List[str] = []
    reader = threading.Thread(
        target=_read_process_lines,
        args=(proc.stderr, stderr_queue, stderr_lines),
        daemon=True,
    )
    reader.start()

    last_output_at = time.monotonic()
    poll_interval = min(1.0, max(0.01, idle_timeout / 4))

    while True:
        try:
            stderr_queue.get(timeout=poll_interval)
            last_output_at = time.monotonic()
        except queue.Empty:
            pass

        if proc.poll() is not None:
            break

        if time.monotonic() - last_output_at > idle_timeout:
            proc.kill()
            proc.wait()
            reader.join(timeout=1)
            tail = '\n'.join(stderr_lines[-20:])
            raise RuntimeError(
                f"{error_prefix}: FFmpeg stalled after {int(idle_timeout)}s without progress. "
                f"Last output: {tail[-500:]}"
            )

    reader.join(timeout=1)

    if proc.returncode != 0:
        tail = '\n'.join(stderr_lines[-20:])
        raise RuntimeError(f"{error_prefix}: {tail[-500:]}")


def _run_ffmpeg_command(
    cmd: List[str],
    error_prefix: str,
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
) -> None:
    """运行 FFmpeg 命令，仅在无进展卡死时中止，不设置总超时。"""
    proc = subprocess.Popen(
        _inject_ffmpeg_progress_args(cmd),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        **_hidden_subprocess_kwargs(),
    )
    _wait_for_process_with_idle_watchdog(proc, error_prefix, idle_timeout=idle_timeout)


def create_placeholder_frame(
    output_path: str,
    title: str = '',
    width: int = 1920,
    height: int = 1080,
    ffmpeg_path: str = 'ffmpeg',
) -> None:
    """
    为没有图片的页面生成占位帧图片（深色渐变背景 + 标题文字）。

    使用 FFmpeg 纯滤镜生成，不需要外部图片资源。
    """
    # 清理标题中的特殊字符，防止 FFmpeg drawtext 解析错误
    safe_title = title.replace("'", "'").replace(":", "\\:").replace("\\", "\\\\")
    safe_title = safe_title[:60]  # 限制长度

    font_size = max(36, int(height / 20))

    # 检测可用的 CJK 字体文件路径
    font_file = _detect_cjk_font_file()
    if font_file:
        ffmpeg_font_file = font_file.replace('\\', '/').replace(':', '\\:')
        drawtext = (
            f"drawtext=text='{safe_title}':"
            f"fontfile='{ffmpeg_font_file}':"
            f"fontsize={font_size}:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2"
        )
    else:
        drawtext = (
            f"drawtext=text='{safe_title}':"
            f"fontsize={font_size}:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2"
        )

    # 渐变深色背景 + 居中白色标题
    vf = (
        f"color=c=#1a1a2e:s={width}x{height}:d=1,"
        f"format=rgb24,{drawtext}"
    )

    cmd = [
        ffmpeg_path, '-y',
        '-f', 'lavfi',
        '-i', vf,
        '-frames:v', '1',
        '-update', '1',
        output_path,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15, **_hidden_subprocess_kwargs())
    except subprocess.TimeoutExpired:
        result = None
    if not result or result.returncode != 0:
        # fallback: 纯色背景（无文字）
        logger.warning("Placeholder with text failed or timed out, using plain background")
        vf_plain = f"color=c=#1a1a2e:s={width}x{height}:d=1"
        cmd_plain = [
            ffmpeg_path, '-y',
            '-f', 'lavfi',
            '-i', vf_plain,
            '-frames:v', '1',
            '-update', '1',
            output_path,
        ]
        result2 = subprocess.run(cmd_plain, capture_output=True, text=True, timeout=15, **_hidden_subprocess_kwargs())
        if result2.returncode != 0:
            raise RuntimeError(f"FFmpeg placeholder frame failed: {result2.stderr[-300:]}")


def _detect_cjk_font_file() -> Optional[str]:
    """检测系统中 CJK 字体文件路径（用于 FFmpeg drawtext fontfile）"""
    # 常见 CJK 字体文件路径
    candidates = [
        r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\simhei.ttf',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
    ]
    for path in candidates:
        if os.path.exists(path):
            return path

    # 用 fc-match 查找
    try:
        result = subprocess.run(
            ['fc-match', '-f', '%{file}', ':lang=zh'],
            capture_output=True, text=True, timeout=5,
            **_hidden_subprocess_kwargs(),
        )
        path = result.stdout.strip()
        if path and os.path.exists(path):
            return path
    except Exception:
        pass

    return None


# ═══════════════════════════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════════════════════════


def check_ffmpeg_available(ffmpeg_path: str = 'ffmpeg') -> bool:
    """检查 ffmpeg 是否可用"""
    try:
        subprocess.run(
            [ffmpeg_path, '-version'],
            capture_output=True, check=True, timeout=5,
            **_hidden_subprocess_kwargs(),
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False


def check_ffmpeg_ass_filter_available(ffmpeg_path: str = 'ffmpeg') -> bool:
    """检查 ffmpeg 是否支持 ASS 字幕烧录滤镜。"""
    try:
        result = subprocess.run(
            [ffmpeg_path, '-hide_banner', '-filters'],
            capture_output=True, text=True, check=True, timeout=5,
            **_hidden_subprocess_kwargs(),
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False

    filter_listing = f"{result.stdout}\n{result.stderr}"
    return re.search(r'^\s*[TSC\.|]+\s+ass\s+', filter_listing, re.MULTILINE) is not None


def get_audio_duration(audio_path: str, ffmpeg_path: str = 'ffmpeg') -> float:
    """使用 ffprobe 获取音频时长（秒）"""
    ffprobe_path = ffmpeg_path.replace('ffmpeg', 'ffprobe')
    cmd = [
        ffprobe_path, '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=10, **_hidden_subprocess_kwargs())
    return float(result.stdout.strip())


def pad_audio_with_silence(
    src_path: str,
    dst_path: str,
    leading_seconds: float = 0.0,
    trailing_seconds: float = 0.0,
    ffmpeg_path: str = 'ffmpeg',
) -> float:
    """在音频两端追加静音，返回新音频时长。"""
    if leading_seconds <= 0 and trailing_seconds <= 0:
        shutil.copy2(src_path, dst_path)
        return get_audio_duration(dst_path, ffmpeg_path)

    filters: List[str] = []
    if leading_seconds > 0:
        filters.append(f'adelay={int(leading_seconds * 1000)}|{int(leading_seconds * 1000)}:all=1')
    if trailing_seconds > 0:
        filters.append(f'apad=pad_dur={trailing_seconds}')

    cmd = [
        ffmpeg_path, '-y',
        '-i', src_path,
        '-af', ','.join(filters),
        '-c:a', 'libmp3lame', '-b:a', '128k',
        dst_path,
    ]
    _run_ffmpeg_command(cmd, "FFmpeg failed to pad audio")
    return get_audio_duration(dst_path, ffmpeg_path)


def get_default_voice(language: str, config: Optional[dict] = None) -> str:
    """根据语言返回默认 TTS 语音名称"""
    defaults = {
        'zh': 'zh-CN-XiaoxiaoNeural',
        'en': 'en-US-JennyNeural',
        'ja': 'ja-JP-NanamiNeural',
    }
    if config:
        voice_map = {
            'zh': config.get('TTS_DEFAULT_VOICE_ZH', defaults['zh']),
            'en': config.get('TTS_DEFAULT_VOICE_EN', defaults['en']),
            'ja': config.get('TTS_DEFAULT_VOICE_JA', defaults['ja']),
        }
        return voice_map.get(language, voice_map['zh'])
    return defaults.get(language, defaults['zh'])


# ═══════════════════════════════════════════════════════════════════════════════
# TTS 语音合成
# ═══════════════════════════════════════════════════════════════════════════════


async def _generate_tts_async(
    text: str,
    output_path: str,
    voice: str,
    rate: str,
    pitch: str = '+0Hz',
    volume: str = '+0%',
) -> None:
    """edge-tts 异步语音合成"""
    import edge_tts
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume)
    await communicate.save(output_path)


def _generate_windows_sapi_audio(
    text: str,
    output_path: str,
    voice: str,
    rate: str,
    ffmpeg_path: str,
) -> None:
    """Use the built-in Windows speech engine when Bing TTS is unavailable."""
    locale_match = re.match(r'^([a-z]{2,3}-[A-Z]{2})-', voice)
    locale = locale_match.group(1) if locale_match else 'zh-CN'
    male_markers = ('yunxi', 'yunjian', 'yunyang', 'yunfeng', 'yunhao', 'guy', 'ryan', 'davis', 'tony', 'keita', 'naoki')
    gender = 'Male' if any(marker in voice.lower() for marker in male_markers) else 'Female'
    rate_match = re.fullmatch(r'([+-]?\d+)%', rate.strip())
    sapi_rate = max(-10, min(10, round(int(rate_match.group(1)) / 10))) if rate_match else 0
    text_path = f'{output_path}.sapi.txt'
    wav_path = f'{output_path}.sapi.wav'
    script_path = f'{output_path}.sapi.ps1'
    script = r"""
param($TextPath, $WavPath, $LocaleName, $GenderName, $SpeechRate)
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Speech
    $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    try {
        $culture = [System.Globalization.CultureInfo]::GetCultureInfo($LocaleName)
        $gender = [System.Enum]::Parse([System.Speech.Synthesis.VoiceGender], $GenderName)
        $language = $LocaleName.Split('-')[0]
        try {
            $installedVoices = $synth.GetInstalledVoices()
        } catch {
            throw 'Windows speech voices are unavailable on this device'
        }
        $voices = @($installedVoices | Where-Object { $_ -and $_.Enabled })
        if (-not $voices) { throw 'No Windows speech voice is installed' }
        $candidates = @($voices | Where-Object {
            $_ -and $_.VoiceInfo.Culture.Name -eq $culture.Name -and $_.VoiceInfo.Gender -eq $gender
        })
        $candidates += @($voices | Where-Object {
            $_ -and $_.VoiceInfo.Culture.Name.StartsWith($language) -and $_.VoiceInfo.Gender -eq $gender
        })
        $candidates += @($voices | Where-Object {
            $_ -and $_.VoiceInfo.Culture.Name -eq $culture.Name
        })
        $candidates += @($voices | Where-Object {
            $_ -and $_.VoiceInfo.Culture.Name.StartsWith($language)
        })
        $candidates += @($voices)
        $selected = $null
        foreach ($candidate in $candidates) {
            try {
                $synth.SelectVoice($candidate.VoiceInfo.Name)
                $selected = $candidate
                break
            } catch {
                continue
            }
        }
        if (-not $selected) { throw 'No Windows speech voice is installed' }
        $synth.Rate = [int]$SpeechRate
        $synth.SetOutputToWaveFile($WavPath)
        $text = [System.IO.File]::ReadAllText($TextPath, [System.Text.Encoding]::UTF8)
        $escapedText = [System.Security.SecurityElement]::Escape($text)
        $pitch = if ($gender -eq [System.Speech.Synthesis.VoiceGender]::Male) { '-18%' } else { '+8%' }
        $voiceLocale = $selected.VoiceInfo.Culture.Name
        $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$voiceLocale'><prosody pitch='$pitch'>$escapedText</prosody></speak>"
        $synth.SpeakSsml($ssml)
    } finally {
        $synth.Dispose()
    }
"""
    try:
        with open(text_path, 'w', encoding='utf-8') as handle:
            handle.write(text)
        with open(script_path, 'w', encoding='utf-8') as handle:
            handle.write(script)
        result = subprocess.run(
            [
                'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script_path,
                text_path, wav_path, locale, gender, str(sapi_rate),
            ],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=120,
            **_hidden_subprocess_kwargs(),
        )
        if result.returncode != 0 or not os.path.isfile(wav_path) or os.path.getsize(wav_path) <= 0:
            raise RuntimeError((result.stderr or result.stdout or 'Windows speech synthesis failed').strip())
        _run_ffmpeg_command([
            ffmpeg_path, '-y', '-i', wav_path, '-vn',
            '-c:a', 'libmp3lame', '-b:a', '128k', output_path,
        ], 'Windows local TTS conversion failed')
    finally:
        for temp_path in (text_path, wav_path, script_path):
            try:
                os.remove(temp_path)
            except FileNotFoundError:
                pass


def generate_tts_audio_sync(
    text: str,
    output_path: str,
    voice: str = 'zh-CN-XiaoxiaoNeural',
    rate: str = '+0%',
    ffmpeg_path: str = 'ffmpeg',
    pitch: str = '+0Hz',
    volume: str = '+0%',
) -> float:
    """
    同步封装：生成 TTS 音频文件（edge-tts）。

    Args:
        text: 待合成的文本
        output_path: 输出音频文件路径（MP3）
        voice: edge-tts 语音名称
        rate: 语速调整
        ffmpeg_path: ffmpeg 路径（用于 ffprobe 获取时长）

    Returns:
        float: 音频时长（秒）
    """
    last_error = None
    for attempt in range(_TTS_MAX_ATTEMPTS):
        try:
            if os.path.exists(output_path):
                os.remove(output_path)
            loop = asyncio.new_event_loop()
            try:
                if pitch == '+0Hz' and volume == '+0%':
                    # Keep the legacy four-argument call compatible with local test doubles.
                    task = _generate_tts_async(text, output_path, voice, rate)
                else:
                    task = _generate_tts_async(text, output_path, voice, rate, pitch, volume)
                loop.run_until_complete(task)
            finally:
                loop.close()

            if not os.path.isfile(output_path) or os.path.getsize(output_path) <= 0:
                raise RuntimeError('TTS returned an empty audio file')
            duration = get_audio_duration(output_path, ffmpeg_path)
            logger.debug(f"TTS audio generated: {output_path} ({duration:.1f}s)")
            return duration
        except Exception as error:
            last_error = error
            if attempt >= _TTS_MAX_ATTEMPTS - 1:
                break
            delay = _TTS_RETRY_BACKOFF_SECONDS[min(attempt, len(_TTS_RETRY_BACKOFF_SECONDS) - 1)]
            logger.warning(
                "TTS generation attempt %s/%s failed: %s; retrying in %.1fs",
                attempt + 1,
                _TTS_MAX_ATTEMPTS,
                error,
                delay,
            )
            time.sleep(delay)

    if os.name == 'nt':
        try:
            logger.warning(
                "Edge TTS failed after %s attempts; using Windows local speech for voice %s",
                _TTS_MAX_ATTEMPTS,
                voice,
            )
            _generate_windows_sapi_audio(text, output_path, voice, rate, ffmpeg_path)
            duration = get_audio_duration(output_path, ffmpeg_path)
            logger.info(f"Windows local TTS audio generated: {output_path} ({duration:.1f}s)")
            return duration
        except Exception as fallback_error:
            raise RuntimeError(
                f"Edge TTS failed after {_TTS_MAX_ATTEMPTS} attempts: {last_error}; "
                f"Windows local TTS fallback failed: {fallback_error}"
            ) from fallback_error

    raise RuntimeError(f"TTS generation failed after {_TTS_MAX_ATTEMPTS} attempts: {last_error}") from last_error


def _rate_percent(value: str) -> int:
    match = re.fullmatch(r'([+-]?\d+)%', str(value or '').strip())
    return int(match.group(1)) if match else 0


def _effective_tts_rate(rate: str, speed: float, delta: str = '+0%') -> str:
    pct = _rate_percent(rate) + _rate_percent(delta)
    if abs(speed - 1.0) > 1e-3:
        pct += int(round((speed - 1.0) * 100))
    return f"{'+' if pct >= 0 else ''}{pct}%"


_DELIVERY_DEFAULTS = {
    'question': {'rate_delta': '+2%', 'pitch_delta': '+2Hz', 'pause_after_ms': 360},
    'statement': {'rate_delta': '+0%', 'pitch_delta': '+0Hz', 'pause_after_ms': 250},
    'emphasis': {'rate_delta': '-2%', 'pitch_delta': '-2Hz', 'pause_after_ms': 520},
    'conclusion': {'rate_delta': '-3%', 'pitch_delta': '-1Hz', 'pause_after_ms': 620},
    'transition': {'rate_delta': '+3%', 'pitch_delta': '+1Hz', 'pause_after_ms': 300},
    'reflective': {'rate_delta': '-4%', 'pitch_delta': '-2Hz', 'pause_after_ms': 700},
}


def _resolve_segment_prosody(segment: dict) -> dict:
    delivery = str(segment.get('delivery') or '').strip().lower()
    if delivery not in _DELIVERY_DEFAULTS:
        delivery = 'transition' if str(segment.get('speaker_id') or 'host') == 'host' else 'statement'
    defaults = _DELIVERY_DEFAULTS[delivery]
    try:
        pause_after_ms = max(120, min(int(segment.get('pause_after_ms', defaults['pause_after_ms'])), 1200))
    except (TypeError, ValueError):
        pause_after_ms = defaults['pause_after_ms']
    pitch_delta = str(segment.get('pitch_delta') or defaults['pitch_delta']).strip()
    if not re.fullmatch(r'[+-]\d+Hz', pitch_delta):
        pitch_delta = defaults['pitch_delta']
    rate_delta = str(segment.get('rate_delta') or defaults['rate_delta']).strip()
    if not re.fullmatch(r'[+-]\d+%', rate_delta):
        rate_delta = defaults['rate_delta']
    volume = str(segment.get('volume') or '+0%').strip()
    if not re.fullmatch(r'[+-]\d+%', volume):
        volume = '+0%'
    return {
        'delivery': delivery,
        'rate_delta': rate_delta,
        'pitch_delta': pitch_delta,
        'volume': volume,
        'pause_after_ms': pause_after_ms,
    }


def generate_narration_segments_audio_sync(
    segments: List[dict],
    cache_dir: str,
    working_dir: str,
    default_voice: str,
    rate: str,
    speed: float = 1.0,
    ffmpeg_path: str = 'ffmpeg',
    pause_seconds: float = 0.25,
    return_cache_hit: bool = False,
) -> tuple:
    """Generate or reuse segment audio, then concatenate it into one page track."""
    if not segments:
        raise ValueError('No narration segments')
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(working_dir, exist_ok=True)
    audio_paths = []
    durations = []
    cache_hit = True
    for index, segment in enumerate(segments):
        text = str(segment.get('_tts_text') or segment.get('text') or '').strip()
        voice = str(segment.get('voice') or default_voice).strip()
        segment_rate = str(segment.get('rate') or rate)
        prosody = _resolve_segment_prosody(segment)
        effective_rate = _effective_tts_rate(segment_rate, speed, prosody['rate_delta'])
        segment['_pause_after_seconds'] = prosody['pause_after_ms'] / 1000.0
        segment_pitch = prosody['pitch_delta']
        segment_volume = prosody['volume']
        cache_key = hashlib.sha256(json.dumps({
            'text': text,
            'voice': voice,
            'rate': effective_rate,
            'pitch': segment_pitch,
            'volume': segment_volume,
        }, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
        cache_path = os.path.join(cache_dir, f'{cache_key}.mp3')
        if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 0:
            duration = get_audio_duration(cache_path, ffmpeg_path)
        else:
            cache_hit = False
            temp_path = os.path.join(working_dir, f'segment_{index:03d}.mp3')
            duration = generate_tts_audio_sync(
                text,
                temp_path,
                voice=voice,
                rate=effective_rate,
                ffmpeg_path=ffmpeg_path,
                pitch=segment_pitch,
                volume=segment_volume,
            )
            shutil.copy2(temp_path, cache_path)
        audio_paths.append(cache_path)
        durations.append(duration)

    padded_paths = []
    for index, path in enumerate(audio_paths):
        padded_path = os.path.join(working_dir, f'padded_segment_{index:03d}.mp3')
        pad_audio_with_silence(
            path,
            padded_path,
            trailing_seconds=(
                float(segments[index].get('_pause_after_seconds', pause_seconds))
                if index < len(audio_paths) - 1 else 0.0
            ),
            ffmpeg_path=ffmpeg_path,
        )
        padded_paths.append(padded_path)

    concat_file = os.path.join(working_dir, 'segments.concat.txt')
    output_path = os.path.join(working_dir, 'page_audio.mp3')
    encoding = 'mbcs' if os.name == 'nt' else 'utf-8'
    with open(concat_file, 'w', encoding=encoding, errors='replace') as handle:
        for path in padded_paths:
            safe_path = os.path.abspath(path).replace('\\', '/').replace("'", "'\\''")
            handle.write(f"file '{safe_path}'\n")
    _run_ffmpeg_command([
        ffmpeg_path, '-y', '-f', 'concat', '-safe', '0', '-i', concat_file,
        '-c:a', 'libmp3lame', '-b:a', '128k', output_path,
    ], 'FFmpeg segment audio concat failed')
    total_duration = get_audio_duration(output_path, ffmpeg_path)
    result = (output_path, total_duration, durations)
    return (*result, cache_hit) if return_cache_hit else result


_FISH_DELIVERY_EMOTIONS = {
    'question': 'curious',
    'emphasis': 'emphasis',
    'conclusion': 'confident',
    'reflective': 'calm',
    'transition': 'warm',
}
_FISH_PAGE_EMOTIONS = {
    'cover': 'confident',
    'chapter': 'confident',
    'data': 'confident',
    'process': 'calm',
    'summary': 'confident',
}
_FISH_PRESET_EMOTIONS = {
    'business': 'confident',
    'training': 'warm',
    'launch': 'excited',
    'brief': 'calm',
}


def _fish_emotion_tag(
    segment: dict,
    page_direction: dict,
    director_preset: str,
    emotion_director: Optional[dict] = None,
) -> str:
    emotion_director = emotion_director if isinstance(emotion_director, dict) else {}
    explicit = str(emotion_director.get('emotion') or '').strip().lower()
    if explicit in {'curious', 'emphasis', 'confident', 'calm', 'warm', 'excited'}:
        return f'[{explicit}]'
    delivery = str(segment.get('delivery') or '').strip().lower()
    emotion = _FISH_DELIVERY_EMOTIONS.get(delivery)
    if not emotion:
        page_kind = str((page_direction or {}).get('page_kind') or '').strip().lower()
        emotion = _FISH_PAGE_EMOTIONS.get(page_kind)
    if not emotion:
        relationship = str(emotion_director.get('relationship') or 'neutral').strip().lower()
        emotion = {
            'host_guest': 'warm',
            'mentor': 'confident',
            'debate': 'emphasis',
        }.get(relationship)
    if not emotion:
        emotion = _FISH_PRESET_EMOTIONS.get(str(director_preset or '').strip().lower(), 'warm')
    intensity = str(emotion_director.get('intensity') or 'standard').strip().lower()
    if intensity == 'gentle':
        emotion = {'excited': 'warm', 'emphasis': 'calm', 'confident': 'warm'}.get(emotion, emotion)
    elif intensity == 'strong':
        emotion = {'calm': 'confident', 'warm': 'excited', 'confident': 'emphasis'}.get(emotion, emotion)
    return f'[{emotion}]'


def build_fish_narration_request(
    segments: List[dict],
    *,
    speakers: Optional[List[dict]] = None,
    narration_mode: str = 'single',
    auto_emotion: bool = True,
    page_direction: Optional[dict] = None,
    director_preset: str = 'business',
    emotion_director: Optional[dict] = None,
) -> dict:
    """Build Fish Audio's native one-request multi-speaker protocol for one page."""
    from services.narration_service import MAX_FISH_TTS_CHARACTERS_PER_PAGE

    ordered_speakers = [item for item in (speakers or []) if isinstance(item, dict)][:4]
    speaker_indexes = {
        str(item.get('id') or '').strip(): index
        for index, item in enumerate(ordered_speakers)
        if str(item.get('id') or '').strip()
    }
    reference_ids = [str(item.get('voice') or '').strip() for item in ordered_speakers]

    if narration_mode == 'dialogue':
        if not 2 <= len(ordered_speakers) <= 4:
            raise RuntimeError('Fish Audio 多人旁白需要配置 2-4 位角色。')
        if any(not reference_id for reference_id in reference_ids):
            raise RuntimeError('Fish Audio 多人旁白的每位角色都必须选择克隆声音。')

    chunks = []
    used_speaker_indexes = set()
    for segment in segments:
        source_text = str(segment.get('text') or '').strip()
        text = str(segment.get('_tts_text') or source_text).strip()
        if not text:
            continue
        if re.search(r'<\|\s*speaker\s*:', source_text, flags=re.IGNORECASE) or re.search(r'<\|\s*speaker\s*:', text, flags=re.IGNORECASE):
            raise RuntimeError('Fish Audio 旁白正文不能包含说话人控制标记。')
        if re.search(r'\[[a-z][a-z _-]{1,30}\]', source_text) or re.search(r'\[[a-z][a-z _-]{1,30}\]', text):
            raise RuntimeError('Fish Audio 旁白正文不能包含情绪控制标记。')
        prefix = ''
        if narration_mode == 'dialogue':
            speaker_id = str(segment.get('speaker_id') or '').strip()
            if speaker_id not in speaker_indexes:
                raise RuntimeError(f'Fish Audio 旁白包含未配置的角色: {speaker_id or "unknown"}')
            speaker_index = speaker_indexes[speaker_id]
            used_speaker_indexes.add(speaker_index)
            prefix = f'<|speaker:{speaker_index}|>'
        emotion = _fish_emotion_tag(
            segment,
            page_direction or {},
            director_preset,
            emotion_director,
        ) if auto_emotion else ''
        chunks.append(f'{prefix}{emotion}{text}')

    if not chunks:
        raise RuntimeError('Fish Audio 没有可合成的旁白文本。')
    if sum(len(re.sub(r'\s+', '', str(segment.get('_tts_text') or segment.get('text') or ''))) for segment in segments) > MAX_FISH_TTS_CHARACTERS_PER_PAGE:
        raise RuntimeError(f'Fish Audio 单页旁白不能超过 {MAX_FISH_TTS_CHARACTERS_PER_PAGE} 个字符。')
    if narration_mode == 'dialogue' and used_speaker_indexes != set(range(len(ordered_speakers))):
        raise RuntimeError('Fish Audio 多人旁白的每位已配置角色都必须实际发言。')

    return {
        'text': ''.join(chunks),
        'reference_ids': reference_ids,
    }


def fish_narration_cache_key(
    *,
    text: str,
    reference_ids: List[str],
    speed: float,
    model: str,
    auto_emotion: bool,
) -> str:
    payload = {
        'provider': 'fish_audio',
        'schema_version': 1,
        'model': model,
        'text': text,
        'reference_ids': reference_ids,
        'speed': round(max(0.5, min(float(speed), 2.0)), 3),
        'auto_emotion': bool(auto_emotion),
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode('utf-8')
    ).hexdigest()


def _estimate_fish_segment_durations(segments: List[dict], total_duration: float) -> List[float]:
    visible_segments = [segment for segment in segments if str(segment.get('text') or '').strip()]
    if not visible_segments:
        return []
    weights = [max(1, len(re.sub(r'\s+', '', str(segment.get('text') or '')))) for segment in visible_segments]
    total_weight = sum(weights)
    durations = [total_duration * weight / total_weight for weight in weights[:-1]]
    durations.append(max(0.0, total_duration - sum(durations)))
    for segment in visible_segments:
        segment['_pause_after_seconds'] = 0.0
    return durations


def generate_fish_narration_audio_sync(
    *,
    segments: List[dict],
    speakers: Optional[List[dict]],
    narration_mode: str,
    cache_dir: str,
    working_dir: str,
    api_key: str,
    speed: float = 1.0,
    model: str = 's2.1-pro-free',
    api_base: str = 'https://api.fish.audio',
    auto_emotion: bool = True,
    page_direction: Optional[dict] = None,
    director_preset: str = 'business',
    emotion_director: Optional[dict] = None,
    ffmpeg_path: str = 'ffmpeg',
    return_cache_hit: bool = False,
    request_timeout: tuple[float, float] = (15, 300),
    total_timeout: float | None = None,
) -> tuple:
    """Generate one Fish Audio track per page, including native 2-4 speaker dialogue."""
    from services.fish_audio_service import synthesize

    if not api_key:
        raise RuntimeError('Fish Audio API Key 未配置，请先在设置中保存并验证。')
    request_data = build_fish_narration_request(
        segments,
        speakers=speakers,
        narration_mode=narration_mode,
        auto_emotion=auto_emotion,
        page_direction=page_direction,
        director_preset=director_preset,
        emotion_director=emotion_director,
    )
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(working_dir, exist_ok=True)
    cache_key = fish_narration_cache_key(
        text=request_data['text'],
        reference_ids=request_data['reference_ids'],
        speed=speed,
        model=model,
        auto_emotion=auto_emotion,
    )
    cache_path = os.path.join(cache_dir, f'fish_{cache_key}.mp3')
    cache_hit = os.path.isfile(cache_path) and os.path.getsize(cache_path) > 0
    if not cache_hit:
        temp_path = os.path.join(working_dir, 'fish_page_audio.mp3')
        reference_id: str | List[str] | None
        if narration_mode == 'dialogue':
            reference_id = request_data['reference_ids']
        else:
            reference_id = request_data['reference_ids'][0] if request_data['reference_ids'] else None
        synthesize(
            api_key=api_key,
            text=request_data['text'],
            output_path=temp_path,
            reference_id=reference_id,
            speed=speed,
            model=model,
            api_base=api_base,
            timeout=request_timeout,
            total_timeout=total_timeout,
        )
        shutil.copy2(temp_path, cache_path)
    duration = get_audio_duration(cache_path, ffmpeg_path)
    result = (cache_path, duration, _estimate_fish_segment_durations(segments, duration))
    return (*result, cache_hit) if return_cache_hit else result


# ═══════════════════════════════════════════════════════════════════════════════
# Ken Burns 动效
# ═══════════════════════════════════════════════════════════════════════════════

# 四种交替动效
KEN_BURNS_EFFECTS = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right']
KEN_BURNS_EFFECT_STYLES = {
    'auto': KEN_BURNS_EFFECTS,
    'zoom': ['zoom_in', 'zoom_out'],
    'pan': ['pan_left', 'pan_right'],
}

# 轻量动效参数：既保留镜头感，也避免把边缘文字裁出屏幕
KEN_BURNS_MAX_ZOOM = 1.08
KEN_BURNS_PAN_CANVAS_SCALE = 1.08
KEN_BURNS_INTENSITY_ZOOM = {
    'minimal': 1.03,
    'subtle': 1.12,
    'standard': 1.16,
    'legacy': KEN_BURNS_MAX_ZOOM,
}


def resolve_ken_burns_effect(page_index: int, motion_style: str = 'auto') -> str:
    """Choose a stable motion for each slide while preserving the legacy default."""
    effects = KEN_BURNS_EFFECT_STYLES.get(motion_style, KEN_BURNS_EFFECTS)
    return effects[page_index % len(effects)]


def _prepare_canvas(src, content_w: int, content_h: int, canvas_w: int, canvas_h: int):
    """将任意画幅的图片 contain 到 content 区域，居中放置在 canvas 上，空白用高斯模糊填充。

    content_w/h: 内容区域（zoom=1.0 时可见的区域）
    canvas_w/h: 画布总尺寸（包含动效余量）
    """
    import cv2

    sh, sw = src.shape[:2]

    bg = cv2.resize(src, (canvas_w, canvas_h), interpolation=cv2.INTER_LINEAR)
    ksize = max(canvas_w, canvas_h) // 10 | 1
    bg = cv2.GaussianBlur(bg, (ksize, ksize), 0)

    scale = min(content_w / sw, content_h / sh)
    new_w = int(sw * scale)
    new_h = int(sh * scale)
    fg = cv2.resize(src, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    x_off = (canvas_w - new_w) // 2
    y_off = (canvas_h - new_h) // 2
    bg[y_off:y_off + new_h, x_off:x_off + new_w] = fg
    return bg, (x_off, y_off, new_w, new_h)


def create_ken_burns_clip(
    image_path: str,
    output_path: str,
    duration: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    effect_type: str = 'zoom_in',
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
    fade_in_seconds: float = 0.0,
    fade_out_seconds: float = 0.0,
    motion_intensity: str = 'legacy',
) -> None:
    """OpenCV 逐帧渲染 Ken Burns 动效，pipe rawvideo 给 FFmpeg 编码。
    用 _prepare_canvas 适配任意画幅，getRectSubPix 实现浮点精度裁切。"""
    import cv2

    total_frames = max(int(duration * fps), 1)
    src = cv2.imread(image_path)
    if src is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    max_zoom = KEN_BURNS_INTENSITY_ZOOM.get(motion_intensity, KEN_BURNS_MAX_ZOOM)
    pan_canvas_scale = max(KEN_BURNS_PAN_CANVAS_SCALE, max_zoom)
    canvas_scale = max(max_zoom, pan_canvas_scale)
    canvas_w = int(width * canvas_scale)
    canvas_h = int(height * canvas_scale)
    # 先把整张 slide 缩进一个安全边距内，再做镜头运动，避免边缘文字被裁出画面。
    safe_content_w = max(1, int(width / max_zoom))
    safe_content_h = max(1, int(height / max_zoom))
    img, (slide_x, slide_y, slide_w, slide_h) = _prepare_canvas(
        src,
        safe_content_w,
        safe_content_h,
        canvas_w,
        canvas_h,
    )
    ih, iw = img.shape[:2]

    fade_filters: List[str] = []
    if fade_in_seconds > 0:
        fade_filters.append(f'fade=t=in:st=0:d={fade_in_seconds}')
    if fade_out_seconds > 0:
        fade_out_start = max(duration - fade_out_seconds, 0.0)
        fade_filters.append(f'fade=t=out:st={fade_out_start}:d={fade_out_seconds}')

    cmd = [
        ffmpeg_path, '-y',
        '-f', 'rawvideo', '-pix_fmt', 'bgr24',
        '-s', f'{width}x{height}', '-r', str(fps),
        '-i', 'pipe:0',
        '-t', str(duration),
    ]
    if fade_filters:
        cmd += ['-vf', ','.join(fade_filters)]
    cmd += [
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-preset', 'medium', '-crf', '23',
        '-movflags', '+faststart',
        output_path,
    ]

    proc = subprocess.Popen(
        _inject_ffmpeg_progress_args(cmd),
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        **_hidden_subprocess_kwargs(),
    )

    try:
        for i in range(total_frames):
            t = i / max(total_frames - 1, 1)

            if effect_type == 'zoom_in':
                z = 1.0 + (max_zoom - 1.0) * t
                if motion_intensity == 'legacy':
                    cx, cy = iw / 2.0, ih / 2.0
                else:
                    cx = iw / 2.0 + (t - 0.5) * iw * 0.08
                    cy = ih / 2.0 + (0.5 - t) * ih * 0.04
            elif effect_type == 'zoom_out':
                z = max_zoom - (max_zoom - 1.0) * t
                if motion_intensity == 'legacy':
                    cx, cy = iw / 2.0, ih / 2.0
                else:
                    cx = iw / 2.0 + (0.5 - t) * iw * 0.08
                    cy = ih / 2.0 + (t - 0.5) * ih * 0.04
            elif effect_type == 'pan_right':
                z = 1.0 + (max_zoom - 1.0) * 0.35 if motion_intensity != 'legacy' else 1.0
                min_cx = max(width / 2.0, slide_x + slide_w - width / 2.0)
                max_cx = min(iw - width / 2.0, slide_x + width / 2.0)
                cx = min_cx + max(max_cx - min_cx, 0.0) * t
                cy = ih / 2.0 + ((t - 0.5) * ih * 0.035 if motion_intensity != 'legacy' else 0.0)
            elif effect_type == 'pan_left':
                z = 1.0 + (max_zoom - 1.0) * 0.35 if motion_intensity != 'legacy' else 1.0
                min_cx = max(width / 2.0, slide_x + slide_w - width / 2.0)
                max_cx = min(iw - width / 2.0, slide_x + width / 2.0)
                cx = max_cx - max(max_cx - min_cx, 0.0) * t
                cy = ih / 2.0 + ((0.5 - t) * ih * 0.035 if motion_intensity != 'legacy' else 0.0)
            else:
                z = 1.0 + (max_zoom - 1.0) * t
                cx, cy = iw / 2.0, ih / 2.0

            crop_w = width / z
            crop_h = height / z
            cx = max(crop_w / 2.0, min(cx, iw - crop_w / 2.0))
            cy = max(crop_h / 2.0, min(cy, ih - crop_h / 2.0))

            patch = cv2.getRectSubPix(img, (int(crop_w + 0.5), int(crop_h + 0.5)), (cx, cy))
            frame = cv2.resize(patch, (width, height), interpolation=cv2.INTER_LINEAR)
            proc.stdin.write(frame.tobytes())

        proc.stdin.close()
        _wait_for_process_with_idle_watchdog(
            proc,
            "FFmpeg failed for Ken Burns clip",
            idle_timeout=idle_timeout,
        )
    except Exception:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        raise


def create_silent_clip(
    image_path: str,
    output_path: str,
    duration: float = 3.0,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    effect_type: str = 'zoom_in',
    enable_ken_burns: bool = True,
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
    fade_in_seconds: float = 0.0,
    fade_out_seconds: float = 0.0,
    motion_intensity: str = 'legacy',
) -> None:
    """创建无声视频片段（用于没有旁白的页面）"""
    if enable_ken_burns:
        tmp_video = output_path + '.tmp.mp4'
        create_ken_burns_clip(
            image_path, tmp_video, duration,
            width=width, height=height, fps=fps,
            effect_type=effect_type, ffmpeg_path=ffmpeg_path, idle_timeout=idle_timeout,
            fade_in_seconds=fade_in_seconds, fade_out_seconds=fade_out_seconds,
            motion_intensity=motion_intensity,
        )
        cmd = [
            ffmpeg_path, '-y',
            '-i', tmp_video,
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-c:v', 'copy', '-c:a', 'aac', '-shortest',
            '-movflags', '+faststart',
            output_path,
        ]
        try:
            _run_ffmpeg_command(cmd, "FFmpeg failed for silent clip", idle_timeout=idle_timeout)
        finally:
            if os.path.exists(tmp_video):
                os.remove(tmp_video)
    else:
        vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
        if fade_in_seconds > 0:
            vf += f",fade=t=in:st=0:d={fade_in_seconds}"
        if fade_out_seconds > 0:
            fade_out_start = max(duration - fade_out_seconds, 0.0)
            vf += f",fade=t=out:st={fade_out_start}:d={fade_out_seconds}"
        cmd = [
            ffmpeg_path, '-y',
            '-loop', '1',
            '-i', image_path,
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-vf', vf,
            '-t', str(duration),
            '-r', str(fps),
            '-c:v', 'libx264', '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-preset', 'medium', '-crf', '23',
            '-shortest', '-movflags', '+faststart',
            output_path,
        ]
        _run_ffmpeg_command(cmd, "FFmpeg failed for silent clip", idle_timeout=idle_timeout)


def create_static_clip(
    image_path: str,
    output_path: str,
    duration: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
    fade_in_seconds: float = 0.0,
    fade_out_seconds: float = 0.0,
) -> None:
    """从单张图片创建静态视频片段（无动效）"""
    vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
    if fade_in_seconds > 0:
        vf += f",fade=t=in:st=0:d={fade_in_seconds}"
    if fade_out_seconds > 0:
        fade_out_start = max(duration - fade_out_seconds, 0.0)
        vf += f",fade=t=out:st={fade_out_start}:d={fade_out_seconds}"

    cmd = [
        ffmpeg_path, '-y',
        '-loop', '1',
        '-i', image_path,
        '-vf', vf,
        '-t', str(duration),
        '-r', str(fps),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '23',
        '-movflags', '+faststart',
        output_path,
    ]

    logger.debug(f"Static clip: {duration:.1f}s, {width}x{height}")
    _run_ffmpeg_command(cmd, "FFmpeg failed for static clip", idle_timeout=idle_timeout)


def create_staged_clip(
    image_paths: List[str],
    output_path: str,
    duration: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
    include_silent_audio: bool = False,
) -> None:
    """Build a bounded sequence of native reveal stages for one slide."""
    if not image_paths:
        raise ValueError('Native staged clip requires at least one frame')
    if len(image_paths) == 1:
        if include_silent_audio:
            create_silent_clip(
                image_paths[0], output_path, duration=duration, width=width, height=height,
                fps=fps, enable_ken_burns=False, ffmpeg_path=ffmpeg_path, idle_timeout=idle_timeout,
            )
        else:
            create_static_clip(
                image_paths[0], output_path, duration, width=width, height=height,
                fps=fps, ffmpeg_path=ffmpeg_path, idle_timeout=idle_timeout,
            )
        return

    stage_duration = max(duration / len(image_paths), 0.25)
    stage_clips = []
    try:
        for index, image_path in enumerate(image_paths):
            stage_path = f'{output_path}.stage_{index:02d}.mp4'
            if include_silent_audio:
                create_silent_clip(
                    image_path, stage_path, duration=stage_duration, width=width, height=height,
                    fps=fps, enable_ken_burns=False, ffmpeg_path=ffmpeg_path, idle_timeout=idle_timeout,
                )
            else:
                create_static_clip(
                    image_path, stage_path, stage_duration, width=width, height=height,
                    fps=fps, ffmpeg_path=ffmpeg_path, idle_timeout=idle_timeout,
                )
            stage_clips.append(stage_path)
        composite_video(stage_clips, output_path, fps=fps, ffmpeg_path=ffmpeg_path, idle_timeout=idle_timeout)
    finally:
        for stage_path in stage_clips:
            if os.path.exists(stage_path):
                os.remove(stage_path)


# ═══════════════════════════════════════════════════════════════════════════════
# 字幕生成与烧录
# ═══════════════════════════════════════════════════════════════════════════════


def _format_ass_time(seconds: float) -> str:
    """将秒数格式化为 ASS 时间格式 H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _split_narration_to_sentences(text: str) -> List[str]:
    """
    将旁白文本按句拆分。
    优先按中/英文句号、问号、叹号等断句，
    过长的分句再按逗号/顿号二次拆分。
    """
    # 先按主要句末标点断句（保留标点在前一句末尾）
    raw_parts = re.split(r'(?<=[。！？!?\n])', text.strip())
    sentences = [p.strip() for p in raw_parts if p.strip()]

    # 对超长句子按逗号等次级标点二次拆分
    result = []
    for sent in sentences:
        if len(sent) <= _MAX_SUBTITLE_SEGMENT_LENGTH:
            result.append(sent)
            continue
        # 按逗号、分号、顿号拆分
        sub_parts = re.split(r'(?<=[，；、,;])', sent)
        current = ''
        for part in sub_parts:
            if len(current) + len(part) <= _MAX_SUBTITLE_SEGMENT_LENGTH:
                current += part
            else:
                if current:
                    result.append(current)
                # 单段还是超长就硬切
                while len(part) > _MAX_SUBTITLE_SEGMENT_LENGTH:
                    result.append(part[:_MAX_SUBTITLE_SEGMENT_LENGTH])
                    part = part[_MAX_SUBTITLE_SEGMENT_LENGTH:]
                current = part
        if current:
            result.append(current)

    return result if result else [text.strip()]



def _build_timed_subtitle_entries(
    narration_text: str,
    page_start: float,
    page_duration: float,
) -> List[dict]:
    """
    将一页的旁白文本拆分为按时间均匀分配的字幕条目。

    每个条目的时长与其字符数成正比，实现"跟读"效果。
    """
    sentences = _split_narration_to_sentences(narration_text)
    if not sentences:
        return []

    total_chars = sum(len(s) for s in sentences)
    if total_chars == 0:
        return []

    entries = []
    t = page_start
    for sent in sentences:
        # 按字符比例分配时长，至少 0.8 秒
        seg_duration = page_duration * len(sent) / total_chars
        entries.append({
            'start': t,
            'end': t + seg_duration,
            'text': sent,
        })
        t += seg_duration

    # 修正最后一条对齐到页面结束时间
    if entries:
        entries[-1]['end'] = page_start + page_duration

    return entries


def _build_asr_subtitle_entries(
    segments: List[dict],
    asr_segments: List[dict],
    *,
    page_start: float,
    speakers: Optional[List[dict]] = None,
) -> List[dict]:
    """Use ASR time boundaries while keeping the authored script as subtitle text."""
    timeline = []
    for item in asr_segments or []:
        if not isinstance(item, dict):
            continue
        try:
            start = max(0.0, float(item.get('start') or 0))
            end = max(start, float(item.get('end') or start))
        except (TypeError, ValueError):
            continue
        timeline.append({
            'start': start,
            'end': end,
            'weight': max(1, len(re.sub(r'\s+', '', str(item.get('text') or '')))),
        })
    if not timeline:
        return []

    authored = []
    speaker_names = {
        str(item.get('id')): str(item.get('name') or item.get('id'))
        for item in (speakers or [])
        if isinstance(item, dict) and item.get('id')
    }
    for segment in segments:
        speaker = speaker_names.get(
            str(segment.get('speaker_id') or ''),
            str(segment.get('speaker_id') or ''),
        )
        for sentence in _split_narration_to_sentences(str(segment.get('text') or '').strip()):
            if sentence:
                authored.append({
                    'text': sentence,
                    'speaker': speaker,
                    'weight': max(1, len(re.sub(r'\s+', '', sentence))),
                })
    if not authored:
        return []

    timeline_weight = sum(item['weight'] for item in timeline)
    authored_weight = sum(item['weight'] for item in authored)

    def time_at(ratio: float) -> float:
        target = max(0.0, min(ratio, 1.0)) * timeline_weight
        cursor = 0.0
        for item in timeline:
            next_cursor = cursor + item['weight']
            if target <= next_cursor or item is timeline[-1]:
                local = (target - cursor) / item['weight']
                local = max(0.0, min(local, 1.0))
                return page_start + item['start'] + (item['end'] - item['start']) * local
            cursor = next_cursor
        return page_start + timeline[-1]['end']

    entries = []
    cursor = 0
    for item in authored:
        start_ratio = cursor / authored_weight
        cursor += item['weight']
        entries.append({
            'start': time_at(start_ratio),
            'end': time_at(cursor / authored_weight),
            'text': item['text'],
            'speaker': item['speaker'],
        })
    entries[0]['start'] = page_start + timeline[0]['start']
    entries[-1]['end'] = page_start + timeline[-1]['end']
    return entries


# macOS / Linux / Windows 已知 CJK 字体文件 → libass 友好的 Latin 家族名。
# 顺序即优先级。fontsdir 用对应文件所在目录。
_CJK_FONT_FILE_CANDIDATES: List[Tuple[str, str]] = [
    # macOS
    ('/System/Library/Fonts/PingFang.ttc', 'PingFang SC'),
    ('/System/Library/Fonts/Hiragino Sans GB.ttc', 'Hiragino Sans GB'),
    ('/System/Library/Fonts/STHeiti Medium.ttc', 'Heiti SC'),
    ('/System/Library/Fonts/STHeiti Light.ttc', 'Heiti SC'),
    ('/Library/Fonts/Songti.ttc', 'Songti SC'),
    # Linux
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'Noto Sans CJK SC'),
    ('/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', 'Noto Sans CJK SC'),
    ('/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc', 'Noto Sans CJK SC'),
    ('/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', 'Noto Sans CJK SC'),
    ('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', 'Noto Serif CJK SC'),
    # Windows
    ('C:/Windows/Fonts/msyh.ttc', 'Microsoft YaHei'),
    ('C:/Windows/Fonts/msyh.ttf', 'Microsoft YaHei'),
    ('C:/Windows/Fonts/simhei.ttf', 'SimHei'),
]


def _resolve_cjk_font_file() -> Optional[Tuple[str, str]]:
    """
    解析当前系统可用的 CJK 字体文件。

    返回 (font_file_path, font_family_name)；找不到时 None。
    优先扫已知路径（避免 fc-list 在 macOS 上返回本地化名字导致 libass 找不到字体）。
    """
    for path, family in _CJK_FONT_FILE_CANDIDATES:
        if os.path.exists(path):
            return path, family

    # fc-match 路径回退；强制 LC_ALL=C 拿 Latin 家族名
    try:
        env = {**os.environ, 'LC_ALL': 'C', 'LANG': 'C'}
        result = subprocess.run(
            ['fc-match', '-f', '%{file}|%{family}', ':lang=zh'],
            capture_output=True, text=True, timeout=5, env=env,
            **_hidden_subprocess_kwargs(),
        )
        out = result.stdout.strip()
        if out and '|' in out:
            file_part, family_part = out.split('|', 1)
            family = family_part.split(',')[0].strip()
            if file_part and os.path.exists(file_part) and family:
                return file_part, family
    except Exception:
        pass

    return None


def _detect_cjk_font() -> str:
    """返回 ASS Style 用的 CJK 字体家族名（libass 能查到的 Latin 名）。"""
    resolved = _resolve_cjk_font_file()
    if resolved:
        return resolved[1]
    return 'Noto Sans CJK SC'


def _detect_cjk_font_dir() -> Optional[str]:
    """返回检测到的 CJK 字体文件所在目录，作为 ass filter 的 fontsdir。"""
    resolved = _resolve_cjk_font_file()
    if resolved:
        return os.path.dirname(resolved[0])
    return None


def generate_ass_subtitle(
    subtitle_entries: List[dict],
    output_path: str,
    width: int = 1920,
    height: int = 1080,
    font_size: int = 0,
    subtitle_mode: str = 'standard',
) -> None:
    """
    生成 ASS 字幕文件（带半透明底栏，CJK 字体）。

    Args:
        subtitle_entries: 字幕条目列表，每项含 start/end/text
        output_path: 输出 ASS 文件路径
        width: 视频宽度
        height: 视频高度
        font_size: 字幕字号，0 表示自动按分辨率计算
    """
    if font_size <= 0:
        font_size = max(28, int(height / 25))  # 1080p → 43

    font_name = _detect_cjk_font()
    margin_v = max(40, int(height / 18))  # 底部边距
    outline = max(2, int(font_size / 16))
    shadow = 1
    spacing = 1  # 字间距

    # ASS 颜色格式：&HAABBGGRR（注意是 BGR 顺序）
    # PrimaryColour: 白色 &H00FFFFFF
    # OutlineColour: 深灰 &H00202020 (轮廓)
    # BackColour:    半透明黑 &H96000000 (阴影/背景)
    # BorderStyle=3 表示使用 BackColour 作为背景框

    header = f"""[Script Info]
Title: Narration Subtitles
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},&H00FFFFFF,&H000000FF,&H00202020,&H96000000,-1,0,0,0,100,100,{spacing},0,3,{outline},{shadow},2,50,50,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    with open(output_path, 'w', encoding='utf-8-sig') as f:
        f.write(header)
        for entry in subtitle_entries:
            start = _format_ass_time(entry['start'])
            end = _format_ass_time(entry['end'])
            text = _sanitize_ass_dialogue_text(entry['text'])
            speaker = _sanitize_ass_dialogue_text(str(entry.get('speaker') or ''))
            if subtitle_mode == 'highlight':
                text = _highlight_ass_keywords(text)
            f.write(f"Dialogue: 0,{start},{end},Default,{speaker},0,0,0,,{text}\n")


def _highlight_ass_keywords(text: str) -> str:
    accent = r'{\c&H0034D399&}'
    normal = r'{\c&H00FFFFFF&}'
    pattern = re.compile(r'(?<=[“「『])[^”」』]{2,12}(?=[”」』])|(?:[$￥¥]\s*)?\d+(?:[.,]\d+)*(?:%|％|万|亿|元|倍)?')
    return pattern.sub(lambda match: f'{accent}{match.group(0)}{normal}', text)


def _strip_invisible_unicode(text: str, keep_newlines: bool = False) -> str:
    """
    去除不可见 Unicode 控制类字符，避免在 ASS 解析中产生干扰。

    过滤所有 Cc/Cf/Co/Cs/Cn 类，以及行/段分隔符 U+2028/U+2029。
    keep_newlines=True 时保留 \n / \r / \t（用于 TTS 输入，保留语义换行）。
    """
    out = []
    for ch in text:
        if keep_newlines and ch in ('\n', '\r', '\t'):
            out.append(ch)
            continue
        if ch in ('\u2028', '\u2029'):
            continue
        cat = unicodedata.category(ch)
        if cat[0] == 'C':
            continue
        out.append(ch)
    return ''.join(out)


def _sanitize_ass_dialogue_text(text: str) -> str:
    """
    清洗旁白文本，避免被 libass 当成 ASS override 标签解析。

    libass 在 Dialogue Text 字段里会特殊解析：
      - `{...}` 是内联 override 块，会被吞或错渲染；
      - `\\N` `\\h` `\\n` 等反斜杠序列是 libass 转义；
      - 不可见控制字符（ZWSP / BOM / LRE 等）也可能干扰解析或字体 shaping。

    旁白偶尔出现这些字符时，整段对白会被错误解析、变成视觉上的"乱码/方块"。
    先剥掉控制字符，再把 `\\` `{` `}` 替换成全角等价字符。
    """
    cleaned = _strip_invisible_unicode(text, keep_newlines=False)
    return (
        cleaned
        .replace('\\', '＼')
        .replace('{', '｛')
        .replace('}', '｝')
    )


def _escape_ffmpeg_filter_value(value: str) -> str:
    """转义 FFmpeg filter 参数值，避免路径被误解析为额外选项。"""
    escaped = value.replace('\\', '/')
    for old, new in (
        (':', '\\:'),
        ("'", "\\'"),
        (',', '\\,'),
        ('[', '\\['),
        (']', '\\]'),
        (';', '\\;'),
    ):
        escaped = escaped.replace(old, new)
    return escaped


def burn_subtitles(
    video_path: str,
    subtitle_path: str,
    output_path: str,
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
) -> None:
    """将 ASS 字幕烧录到视频中"""
    escaped_sub = _escape_ffmpeg_filter_value(subtitle_path)

    ass_args = f"ass=filename='{escaped_sub}'"
    fonts_dir = _detect_cjk_font_dir()
    if fonts_dir:
        escaped_fontsdir = _escape_ffmpeg_filter_value(fonts_dir)
        ass_args += f":fontsdir='{escaped_fontsdir}'"

    cmd = [
        ffmpeg_path, '-y',
        '-i', video_path,
        '-vf', ass_args,
        '-c:v', 'libx264',
        '-c:a', 'copy',
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '23',
        '-movflags', '+faststart',
        output_path,
    ]
    _run_ffmpeg_command(cmd, "FFmpeg subtitle burn failed", idle_timeout=idle_timeout)


# ═══════════════════════════════════════════════════════════════════════════════
# 视频合成
# ═══════════════════════════════════════════════════════════════════════════════


def mux_video_audio(
    video_path: str,
    audio_path: str,
    output_path: str,
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
    normalize_audio: bool = False,
) -> None:
    """将视频和音频合并为一个 MP4 文件"""
    cmd = [
        ffmpeg_path, '-y',
        '-i', video_path,
        '-i', audio_path,
        '-c:v', 'copy',
    ]
    if normalize_audio:
        cmd += ['-af', 'loudnorm=I=-16:LRA=7:TP=-1.5']
    cmd += ['-c:a', 'aac', '-shortest', '-movflags', '+faststart', output_path]
    _run_ffmpeg_command(cmd, "FFmpeg mux failed", idle_timeout=idle_timeout)


def _legacy_mix_audio_cues(
    narration_path: Optional[str],
    output_path: str,
    cue_assets: List[dict],
    *,
    duration: float,
    ffmpeg_path: str = 'ffmpeg',
) -> float:
    """Mix frozen page BGM/SFX assets into the narration track."""
    if not cue_assets and narration_path:
        shutil.copy2(narration_path, output_path)
        return get_audio_duration(output_path, ffmpeg_path)
    if duration <= 0:
        raise ValueError('Audio cue mix duration must be positive')

    inputs = [ffmpeg_path, '-y']
    if narration_path:
        inputs.extend(['-i', narration_path])
        narration_input = '[0:a]'
        cue_index = 1
    else:
        inputs.extend(['-f', 'lavfi', '-t', f'{duration:.3f}', '-i', 'anullsrc=r=48000:cl=stereo'])
        narration_input = '[0:a]'
        cue_index = 1
    filters = [f'{narration_input}aresample=async=1:first_pts=0,apad=pad_dur={duration:.3f},atrim=duration={duration:.3f}[voice]']
    mix_labels = ['[voice]']
    for index, asset in enumerate(cue_assets, start=cue_index):
        path = asset.get('path')
        if not isinstance(path, str) or not os.path.isfile(path):
            raise FileNotFoundError(f"Audio cue asset is unavailable: {asset.get('asset_ref')}")
        expected_hash = asset.get('sha256')
        if expected_hash:
            hasher = hashlib.sha256()
            with open(path, 'rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    hasher.update(chunk)
            if hasher.hexdigest() != expected_hash:
                raise ValueError(f"Audio cue asset changed after snapshot: {asset.get('asset_ref')}")
        cue = asset.get('cue') or asset
        kind = str(cue.get('kind') or 'sfx')
        if kind not in {'bgm', 'sfx'}:
            raise ValueError(f'Unsupported audio cue kind: {kind}')
        offset_ms = int(cue.get('offset_ms') or 0)
        gain_db = float(cue.get('gain_db') or 0)
        if offset_ms < 0 or offset_ms > int(round(duration * 1000)):
            raise ValueError('Audio cue offset is outside the page duration')
        if kind == 'bgm':
            inputs.extend(['-stream_loop', '-1'])
        inputs.extend(['-i', path])
        delay = f'adelay={offset_ms}|{offset_ms}:all=1' if offset_ms else 'anull'
        label = f'[cue{index}]'
        filters.append(
            f'[{index}:a]{delay},atrim=duration={duration:.3f},'
            f'volume={gain_db:.2f}dB,asetpts=N/SR/TB{label}'
        )
        mix_labels.append(label)
    filters.append(
        f'{"".join(mix_labels)}amix=inputs={len(mix_labels)}:duration=first:'
        'dropout_transition=0:normalize=0[mixed]'
    )
    command = inputs + [
        '-filter_complex', ';'.join(filters),
        '-map', '[mixed]', '-c:a', 'libmp3lame', '-b:a', '128k', output_path,
    ]
    _run_ffmpeg_command(command, 'FFmpeg audio cue mix failed')
    return get_audio_duration(output_path, ffmpeg_path)


def mix_audio_cues(
    narration_path: Optional[str],
    output_path: str,
    cue_assets: List[dict],
    *,
    duration: float,
    ffmpeg_path: str = 'ffmpeg',
) -> float:
    """Use the shared manifest mixer for video workspace and legacy callers."""
    from services.audio_mix_service import mix_audio_cues as mix_manifest_audio_cues

    return mix_manifest_audio_cues(
        narration_path,
        output_path,
        cue_assets,
        duration=duration,
        ffmpeg_path=ffmpeg_path,
    )


def composite_video(
    clip_paths: List[str],
    output_path: str,
    fps: int = 25,
    ffmpeg_path: str = 'ffmpeg',
    idle_timeout: float = _FFMPEG_IDLE_TIMEOUT_SECONDS,
) -> None:
    """
    使用 FFmpeg concat demuxer 将多个视频片段拼接为最终 MP4。

    Args:
        clip_paths: 各页合并后的视频片段路径列表
        output_path: 最终输出 MP4 路径
        fps: 帧率（确保拼接后一致）
        ffmpeg_path: ffmpeg 路径
        idle_timeout: 连续无输出多久视为卡死
    """
    if len(clip_paths) == 1:
        # 单片段也统一重编码（不直接 copy）：hyperframes GPU 编码片段默认
        # H.264 High Level 5.0，Windows 自带播放器（电影和电视/WMP）解码失败，
        # PotPlayer 正常。统一为 libx264 High L4.0 兼容参数，保证最终产物
        # 跨播放器可用。
        cmd = [
            ffmpeg_path, '-y',
            '-i', clip_paths[0],
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-r', str(fps),
            '-pix_fmt', 'yuv420p',
            '-preset', 'medium',
            '-crf', '23',
            '-movflags', '+faststart',
            output_path,
        ]
        _run_ffmpeg_command(cmd, "FFmpeg single clip re-encode failed", idle_timeout=idle_timeout)
        return

    # 创建 concat 列表文件 — 使用绝对路径并验证文件确实存在于临时目录
    concat_file = output_path + '.concat.txt'
    # FFmpeg concat demuxer 在 Windows 上用系统 ANSI 代码页（cp936/GBK）解析文件内容，
    # 若用 UTF-8 写入中文路径会出现乱码导致 "Error opening input: Invalid argument"。
    # 其他平台用 UTF-8。
    concat_encoding = 'mbcs' if os.name == 'nt' else 'utf-8'
    try:
        with open(concat_file, 'w', encoding=concat_encoding, errors='replace') as f:
            for path in clip_paths:
                # 安全检查：路径不能包含换行符（防止 concat 文件注入）
                safe_path = os.path.abspath(path)
                if '\n' in safe_path or '\r' in safe_path:
                    raise ValueError(f"Invalid clip path contains newline: {safe_path}")
                # 转义单引号
                escaped = safe_path.replace("'", "''")
                f.write(f"file '{escaped}'\n")

        cmd = [
            ffmpeg_path, '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-r', str(fps),
            '-pix_fmt', 'yuv420p',
            '-preset', 'medium',
            '-crf', '23',
            '-movflags', '+faststart',
            output_path,
        ]
        _run_ffmpeg_command(cmd, "FFmpeg concat failed", idle_timeout=idle_timeout)
    finally:
        if os.path.exists(concat_file):
            os.remove(concat_file)

    logger.info(f"Final video composited: {output_path}")


# ═══════════════════════════════════════════════════════════════════════════════
# 完整流水线
# ═══════════════════════════════════════════════════════════════════════════════


def _timeline_page_id(page: dict, page_index: int) -> str:
    return str(page.get('page_id') or page_index)


def _save_page_audio_artifact(audio_path: Optional[str], directory: str, page_id: str):
    if not audio_path:
        return None
    source = os.path.abspath(audio_path)
    if not os.path.isfile(source) or os.path.getsize(source) <= 0:
        raise ValueError('页面旁白音频文件无效')
    digest = hashlib.sha256()
    with open(source, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    target_dir = os.path.abspath(directory)
    os.makedirs(target_dir, exist_ok=True)
    page_key = hashlib.sha256(page_id.encode('utf-8')).hexdigest()[:16]
    target = os.path.join(target_dir, f'audio_{page_key}.mp3')
    if os.path.abspath(source) != os.path.abspath(target):
        temporary = f'{target}.tmp'
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    return {'page_id': page_id, 'path': target, 'sha256': digest.hexdigest()}


def _prepare_timeline_segments(page: dict, segments: List[dict], page_index: int) -> List[dict]:
    raw_segments = page.get('narration_segments')
    if isinstance(raw_segments, str):
        try:
            raw_segments = json.loads(raw_segments)
        except (TypeError, json.JSONDecodeError):
            raw_segments = []
    raw_segments = raw_segments if isinstance(raw_segments, list) else []
    page_id = _timeline_page_id(page, page_index)
    prepared = []
    for index, segment in enumerate(segments):
        raw_index = int(segment.get('segment_index', index))
        raw = raw_segments[raw_index] if 0 <= raw_index < len(raw_segments) else {}
        raw = raw if isinstance(raw, dict) else {}
        item = dict(segment)
        item['id'] = str(
            segment.get('id')
            or segment.get('segment_id')
            or raw.get('segment_id')
            or raw.get('id')
            or f'{page_id}:segment:{raw_index + 1}'
        ).strip()
        prepared.append(item)
    return prepared


def _page_audio_padding_ms(
    *,
    page: dict,
    page_index: int,
    page_position: int,
    total_pages: int,
    page_direction: dict,
    preferences: dict,
) -> tuple[int, int]:
    audio_direction = page_direction.get('audio') if isinstance(page_direction.get('audio'), dict) else {}
    planned_pause_ms = max(int(round(float(audio_direction.get('pause_before_ms') or 0))), 0)
    page_override = preferences['page_overrides'].get(
        str(page.get('page_id') or page_index),
        preferences['page_overrides'].get(str(page_index), {}),
    )
    pause_seconds = {'short': 0.1, 'normal': 0.25, 'long': 0.5}.get(
        str(page_override.get('pause') or preferences['emotion_director'].get('pause') or 'normal'),
        0.25,
    )
    default_leading_ms = int(round(
        (_LEADING_PAD_SECONDS if page_position == 0 else pause_seconds) * 1000
    ))
    trailing_ms = int(round(_TRAILING_PAD_SECONDS * 1000)) if page_position == total_pages - 1 else 0
    return max(default_leading_ms, planned_pause_ms), trailing_ms


def _asr_aligned_boundaries(
    segments: List[dict],
    asr_result: Optional[dict],
    audio_duration_ms: int,
    transcript_matched: bool,
) -> Optional[List[dict]]:
    raw_boundaries = asr_result.get('segments') if isinstance(asr_result, dict) else None
    if not transcript_matched or not isinstance(raw_boundaries, list) or len(raw_boundaries) != len(segments):
        return None
    boundaries = []
    previous_end = 0
    for segment, item in zip(segments, raw_boundaries):
        if not isinstance(item, dict) or not str(item.get('text') or '').strip():
            return None
        try:
            start_ms = int(round(float(item.get('start')) * 1000))
            end_ms = int(round(float(item.get('end')) * 1000))
        except (TypeError, ValueError):
            return None
        if start_ms < previous_end or end_ms <= start_ms or end_ms > audio_duration_ms:
            return None
        boundaries.append({
            'segment_id': segment['id'],
            'start_ms': start_ms,
            'end_ms': end_ms,
        })
        previous_end = end_ms
    return boundaries


def _build_page_tts_timeline(
    *,
    page_id: str,
    segments: List[dict],
    audio_duration: float,
    segment_durations: List[float],
    padding_before_ms: int,
    padding_after_ms: int,
    provider: str,
    asr_result: Optional[dict] = None,
    transcript_matched: bool = False,
) -> tuple[dict, Optional[str]]:
    audio_duration_ms = int(round(max(0.0, float(audio_duration)) * 1000))
    aligned_boundaries = _asr_aligned_boundaries(
        segments,
        asr_result,
        audio_duration_ms,
        transcript_matched,
    )
    if aligned_boundaries is not None:
        return build_page_audio_timeline(
            page_id,
            segments,
            audio_duration_ms=audio_duration_ms,
            padding_before_ms=padding_before_ms,
            padding_after_ms=padding_after_ms,
            timing_quality='aligned',
            segment_boundaries=aligned_boundaries,
        ), None

    if provider != 'fish_audio' and len(segment_durations) == len(segments):
        duration_ms = [int(round(max(0.0, float(value)) * 1000)) for value in segment_durations]
        pause_ms = []
        for segment in segments[:-1]:
            if segment.get('pause_after_ms') is not None:
                pause_ms.append(int(round(float(segment['pause_after_ms']))))
            elif segment.get('_pause_after_seconds') is not None:
                pause_ms.append(int(round(float(segment['_pause_after_seconds']) * 1000)))
            else:
                pause_ms.append(0)
        drift_ms = audio_duration_ms - sum(duration_ms) - sum(pause_ms)
        # Rounding N durations, N-1 pauses, and the page total can differ by at most N ms.
        rounding_limit_ms = max(1, len(segments))
        if abs(drift_ms) <= rounding_limit_ms and duration_ms and duration_ms[-1] + drift_ms >= 0:
            duration_ms[-1] += drift_ms
            return build_page_audio_timeline(
                page_id,
                segments,
                audio_duration_ms=audio_duration_ms,
                padding_before_ms=padding_before_ms,
                padding_after_ms=padding_after_ms,
                timing_quality='segment_exact',
                segment_durations_ms=duration_ms,
            ), None
        warning = (
            f'Edge 音频实测时长与分段边界相差 {drift_ms}ms，超过毫秒舍入上限 '
            f'{rounding_limit_ms}ms，已降级为粗粒度时间线。'
        )
    else:
        warning = None

    return build_page_audio_timeline(
        page_id,
        segments,
        audio_duration_ms=audio_duration_ms,
        padding_before_ms=padding_before_ms,
        padding_after_ms=padding_after_ms,
        timing_quality='estimated',
    ), warning


def _speaker_display_name(segment: dict, speakers: Optional[List[dict]]) -> str:
    return next(
        (
            str(item.get('name') or item.get('id'))
            for item in (speakers or [])
            if isinstance(item, dict) and item.get('id') == segment.get('speaker_id')
        ),
        str(segment.get('speaker_id') or ''),
    )


def _prepare_native_motion_manifest(
    page: dict,
    audio_timeline: dict,
    narration_segments: list[dict],
    page_direction: dict,
    directory: str,
):
    scene_ref = page.get('scene_manifest_ref')
    bundle_ref = page.get('native_scene_bundle_ref')
    if not scene_ref or not bundle_ref:
        return None, None

    from services.motion_manifest import save_motion_manifest
    from services.native_scene_bundle import load_native_scene_bundle
    from services.scene_manifest import load_scene_manifest
    from services.video_director import build_motion_manifest

    scene_manifest = load_scene_manifest(scene_ref, page.get('page_id'))
    load_native_scene_bundle(
        bundle_ref,
        page.get('page_id'),
        scene_ref.get('sha256'),
    )
    motion_manifest = build_motion_manifest(
        scene_manifest,
        scene_ref['sha256'],
        audio_timeline,
        narration_segments,
        page_direction,
        page.get('native_animation'),
    )
    reference = save_motion_manifest(
        motion_manifest,
        directory,
        scene_manifest,
        expected_page_id=page.get('page_id'),
        expected_scene_sha256=scene_ref['sha256'],
        audio_timeline=audio_timeline,
    )
    return motion_manifest, reference


def _build_timeline_subtitle_entries(
    segments: List[dict],
    timeline: dict,
    *,
    page_start: float,
    speakers: Optional[List[dict]] = None,
) -> List[dict]:
    entries = []
    for segment, boundary in zip(segments, timeline.get('segments') or []):
        start = page_start + boundary['start_ms'] / 1000.0
        end = page_start + boundary['end_ms'] / 1000.0
        text = str(segment.get('text') or '').strip()
        speaker = _speaker_display_name(segment, speakers)
        if timeline.get('timing_quality') == 'segment_exact':
            page_entries = _build_timed_subtitle_entries(text, start, max(0.0, end - start))
            for item in page_entries:
                item['speaker'] = speaker
            entries.extend(page_entries)
        elif text:
            # Estimated/aligned timelines never claim sentence-level precision.
            entries.append({'start': start, 'end': end, 'text': text, 'speaker': speaker})
    return entries


def _asr_cache_path(cache_dir: str, audio_path: str) -> str:
    """ASR 结果缓存路径：与音频缓存 key 强一致（同名 .asr.json）。"""
    base = os.path.basename(audio_path)
    if base.endswith('.mp3'):
        base = base[:-4] + '.asr.json'
    else:
        base = f'{hashlib.sha256(audio_path.encode("utf-8")).hexdigest()}.asr.json'
    return os.path.join(cache_dir, base)


def _load_or_run_asr(cache_dir: str, audio_path: str, run_transcribe):
    """按音频缓存 key 读取/生成 ASR 结果，返回 ``(asr_result, from_cache)``。

    proof/final 或任务重试共用同一音频缓存文件时，跳过重复的外部转写
    调用（转写既慢又计费）。缓存文件损坏（半截写入）时删除并重新转写。
    """
    asr_cache_path = _asr_cache_path(cache_dir, audio_path)
    if os.path.isfile(asr_cache_path):
        try:
            with open(asr_cache_path, 'r', encoding='utf-8') as handle:
                return json.load(handle), True
        except (OSError, ValueError):
            # 上次写入被进程崩溃打断，留下半截 JSON——删除缓存重新转写
            os.remove(asr_cache_path)
    asr_result = run_transcribe()
    if isinstance(asr_result, dict) and asr_result.get('segments') is not None:
        os.makedirs(cache_dir, exist_ok=True)
        tmp_path = f'{asr_cache_path}.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as handle:
            json.dump(asr_result, handle, ensure_ascii=False)
        os.replace(tmp_path, asr_cache_path)
    return asr_result, False


def generate_narration_video(
    pages_data: List[dict],
    output_path: str,
    voice: str = 'zh-CN-XiaoxiaoNeural',
    rate: str = '+0%',
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    enable_ken_burns: bool = False,
    ken_burns_style: str = 'auto',
    ffmpeg_path: str = 'ffmpeg',
    progress_callback: Optional[Callable[[str, str, int], None]] = None,
    silent_duration: float = 0,
    fail_fast: bool = False,
    speed: float = 1.0,
    narration_mode: str = 'single',
    speakers: Optional[List[dict]] = None,
    director_plan: Optional[dict] = None,
    tts_provider: str = 'edge',
    fish_api_key: str = '',
    fish_model: str = 's2.1-pro-free',
    auto_emotion: bool = True,
    pronunciation_lexicon: Optional[List[dict]] = None,
    narration_preferences: Optional[dict] = None,
    language: str = 'zh',
    hyperframes_enabled: bool = False,
    hyperframes_executable: Optional[str] = None,
    artifact_directory: Optional[str] = None,
    project_id: Optional[str] = None,
    narration_snapshot_path: Optional[str] = None,
    narration_snapshot_hash: Optional[str] = None,
) -> dict:
    """
    完整的播报视频生成流水线。

    Args:
        pages_data: 页面数据列表，每项包含:
            - image_path: str  幻灯片图片路径
            - narration_text: str | None  旁白文本
            - page_index: int  页码（从 0 开始）
        output_path: 最终 MP4 输出路径
        voice: TTS 语音
        rate: 语速
        width: 视频宽度
        height: 视频高度
        fps: 帧率
        enable_ken_burns: 是否启用 Ken Burns 动效（默认关闭）
        ken_burns_style: auto（交替）、zoom（推近）、pan（横移）
        ffmpeg_path: ffmpeg 路径
        progress_callback: 进度回调 (step, message, percent)
        silent_duration: 无旁白页面的静音时长（秒），0 表示使用默认值
        fail_fast: 是否在缺少有效旁白音频时立即失败
    """
    if not pages_data:
        raise ValueError("No pages to process")

    tts_provider = str(tts_provider or 'edge').strip().lower()
    if tts_provider not in {'edge', 'fish_audio'}:
        raise ValueError(f'Unsupported TTS provider: {tts_provider}')
    if tts_provider == 'fish_audio' and not fish_api_key:
        raise RuntimeError('Fish Audio API Key 未配置，请先在设置中保存并验证。')

    # 检查 ffmpeg
    if not check_ffmpeg_available(ffmpeg_path):
        raise RuntimeError(
            "FFmpeg is not installed or not found in PATH. "
            "Please install FFmpeg to use video export."
        )

    requires_subtitles = any(
        (page.get('narration_text') or '').strip() or page.get('narration_segments')
        for page in pages_data
    )
    if requires_subtitles and not check_ffmpeg_ass_filter_available(ffmpeg_path):
        raise RuntimeError(
            "当前 FFmpeg 不支持 ASS 字幕烧录（缺少 libass / ass filter）。"
            "视频导出需要安装带 libass 的 FFmpeg。"
            "请安装或重装支持 ASS 字幕的 FFmpeg 后重试。"
        )

    from services.narration_service import (
        apply_pronunciation_lexicon,
        compare_asr_transcript,
        has_dialogue_speakers,
        normalize_narration_preferences,
        normalize_narration_segments,
        segments_to_text,
    )

    if silent_duration <= 0:
        silent_duration = _DEFAULT_SILENT_DURATION

    # 临时目录用 ASCII 名（基于输出路径的 hash），避免 Windows 下 FFmpeg concat demuxer
    # 用 ANSI 代码页解析文件内容时，中文路径变成乱码导致 "Error opening input"。
    import hashlib
    tmp_dir_name = '_tmp_' + hashlib.md5(output_path.encode('utf-8')).hexdigest()[:16]
    tmp_dir = os.path.join(os.path.dirname(os.path.abspath(output_path)), tmp_dir_name)
    os.makedirs(tmp_dir, exist_ok=True)
    manifest_dir = artifact_directory or tmp_dir

    try:
        started_at = time.monotonic()
        preferences = normalize_narration_preferences(narration_preferences)
        asr_requested = (
            tts_provider == 'fish_audio'
            and (preferences['quality_check'] or preferences['subtitle_timing'] == 'asr')
        )
        quality_pages = []
        quality_warnings = []
        total = len(pages_data)
        directed_pages = {
            int(item.get('page_index', index)): item
            for index, item in enumerate((director_plan or {}).get('pages', []))
            if isinstance(item, dict)
        }
        muxed_clips: List[str] = []
        subtitle_entries: List[dict] = []
        cumulative_time = 0.0

        # ── Phase A: TTS 音频生成 ──
        # 先统一生成所有 TTS 音频，获取每页实际时长
        page_durations: List[float] = []
        audio_paths: List[Optional[str]] = []
        page_audio_timelines: List[dict] = []
        page_segments: List[List[dict]] = []
        page_motion_manifests: List[Optional[dict]] = []
        page_audio_timeline_refs: List[dict] = []
        page_audio_refs: List[Optional[dict]] = []
        page_motion_manifest_refs: List[Optional[dict]] = []
        silent_page_indexes: List[int] = []
        cache_dir = os.path.join(os.path.dirname(os.path.abspath(output_path)), 'audio_cache')
        speaker_voices = {
            str(item.get('id')): str(item.get('voice') or voice)
            for item in (speakers or [])
            if isinstance(item, dict) and item.get('id')
        }
        fish_speakers = list(speakers or [])
        if tts_provider == 'fish_audio' and not fish_speakers and voice:
            fish_speakers = [{'id': 'host', 'name': '旁白', 'voice': voice}]
        speaker_aliases = {
            str(item.get('name')).strip(): str(item.get('id')).strip()
            for item in (speakers or [])
            if isinstance(item, dict) and item.get('id') and item.get('name')
        }
        configured_speaker_ids = set(speaker_voices)
        if narration_mode == 'dialogue' and len(configured_speaker_ids) < 2:
            raise RuntimeError('双人旁白缺少至少两位有效角色音色配置。')

        for i, page in enumerate(pages_data):
            narration = page.get('narration_text')
            allow_silent = bool(page.get('allow_silent'))
            segments = normalize_narration_segments(
                page.get('narration_segments'),
                fallback_text=narration,
                default_voice=voice,
                default_rate=rate,
            )
            page_idx = page.get('page_index', i)
            page_override = preferences['page_overrides'].get(
                str(page.get('page_id') or page_idx),
                preferences['page_overrides'].get(str(page_idx), {}),
            )
            emotion_director = {**preferences['emotion_director'], **page_override}
            for segment in segments:
                segment['_tts_text'] = apply_pronunciation_lexicon(
                    segment.get('text'),
                    pronunciation_lexicon,
                )

            audio_path = None
            scene_duration_ms = page.get('duration_ms')
            duration = (
                float(scene_duration_ms) / 1000.0
                if isinstance(scene_duration_ms, (int, float))
                and not isinstance(scene_duration_ms, bool)
                and scene_duration_ms > 0
                else silent_duration
            )
            segment_durations: List[float] = []
            if segments:
                try:
                    if narration_mode == 'dialogue' and not has_dialogue_speakers(segments):
                        raise RuntimeError(f'第 {page_idx + 1} 页缺少有效的双人旁白分段。')
                    for segment in segments:
                        speaker_id = str(segment.get('speaker_id') or '').strip()
                        segment['speaker_id'] = speaker_aliases.get(speaker_id, speaker_id or 'host')
                        if narration_mode == 'dialogue' and segment['speaker_id'] not in configured_speaker_ids:
                            raise RuntimeError(
                                f"第 {page_idx + 1} 页包含未配置的旁白角色: {segment['speaker_id']}"
                            )
                        if narration_mode == 'dialogue':
                            # Dialogue role voices are authoritative over stale segment metadata.
                            segment['voice'] = speaker_voices.get(segment['speaker_id'], segment.get('voice') or voice)
                        elif not segment.get('voice'):
                            segment['voice'] = speaker_voices.get(segment['speaker_id'], voice)
                    working_dir = os.path.join(tmp_dir, f'page_{i:03d}')
                    if tts_provider == 'fish_audio':
                        base_speed = 1.0 + (_rate_percent(rate) / 100.0)
                        pace_factor = {
                            'slow': 0.92,
                            'normal': 1.0,
                            'fast': 1.08,
                        }.get(str(emotion_director.get('pace') or 'normal'), 1.0)
                        fish_speed = max(0.5, min(base_speed * speed * pace_factor, 2.0))
                        audio_path, duration, segment_durations = generate_fish_narration_audio_sync(
                            segments=segments,
                            speakers=fish_speakers,
                            narration_mode=narration_mode,
                            cache_dir=cache_dir,
                            working_dir=working_dir,
                            api_key=fish_api_key,
                            speed=fish_speed,
                            model=fish_model,
                            auto_emotion=auto_emotion,
                            page_direction=directed_pages.get(page_idx, {}),
                            director_preset=str((director_plan or {}).get('preset') or 'business'),
                            emotion_director=emotion_director,
                            ffmpeg_path=ffmpeg_path,
                        )
                    else:
                        audio_path, duration, segment_durations = generate_narration_segments_audio_sync(
                            segments,
                            cache_dir=cache_dir,
                            working_dir=working_dir,
                            default_voice=voice,
                            rate=rate,
                            speed=speed,
                            ffmpeg_path=ffmpeg_path,
                        )
                except Exception as e:
                    if fail_fast or narration_mode == 'dialogue':
                        raise RuntimeError(
                            f"第 {page_idx + 1} 页旁白语音生成失败，当前项目未开启“允许返回半成品”，已停止导出: {e}"
                        ) from e

                    logger.warning(f"TTS failed for page {page_idx}: {e}, using silent clip")
                    audio_path = None
                    duration = silent_duration
                    segment_durations = []
                    silent_page_indexes.append(page_idx + 1)
            else:
                if not allow_silent and (fail_fast or narration_mode == 'dialogue'):
                    raise RuntimeError(
                        f"第 {page_idx + 1} 页缺少旁白文本，当前项目未开启“允许返回半成品”，无法导出视频。"
                    )
                if not allow_silent:
                    silent_page_indexes.append(page_idx + 1)

            asr_result = None
            transcript_matched = False
            quality_page = {'page_index': page_idx}
            if page.get('scene_level'):
                quality_page['scene_level'] = page['scene_level']
                quality_page['scene_level_reason'] = page.get('scene_level_reason') or ''
            if audio_path and asr_requested:
                try:
                    from services.fish_audio_service import transcribe

                    asr_result, _asr_from_cache = _load_or_run_asr(
                        cache_dir,
                        audio_path,
                        lambda: transcribe(
                            api_key=fish_api_key,
                            audio_path=audio_path,
                            language=language,
                            include_timestamps=True,
                        ),
                    )
                    comparison = compare_asr_transcript(segments_to_text(segments), asr_result.get('text'))
                    issues = []
                    if not str(asr_result.get('text') or '').strip():
                        issues.append('empty_transcript')
                    if not comparison['matched']:
                        issues.append('transcript_mismatch')
                    if duration > 0 and float(asr_result.get('duration') or 0) <= 0:
                        issues.append('invalid_asr_duration')
                    transcript_matched = comparison['matched'] and not issues
                    quality_page.update({
                        'similarity': comparison['similarity'],
                        'matched': comparison['matched'],
                        'issues': issues,
                        'asr_duration': asr_result.get('duration', 0),
                    })
                    if preferences['strict_quality_check'] and issues:
                        raise RuntimeError(f'第 {page_idx + 1} 页 ASR 质检未通过：{", ".join(issues)}')
                except Exception as exc:
                    if preferences['strict_quality_check']:
                        raise
                    quality_warnings.append(f'第 {page_idx + 1} 页 ASR 质检不可用：{exc}')
                    logger.warning('ASR quality check failed for page %s: %s', page_idx + 1, exc)
                    asr_result = None

            cue_assets = [
                {**asset, 'cue': cue}
                for cue, asset in zip(
                    page.get('audio_cues') or [],
                    page.get('audio_cue_assets') or [],
                )
            ]
            if (page.get('audio_cues') or []) and len(cue_assets) != len(page.get('audio_cues') or []):
                raise ValueError('Video audio cue assets are missing from the frozen export snapshot')
            if cue_assets or (page.get('audio_cues') or []):
                mixed_audio_path = os.path.join(tmp_dir, f'audio_mixed_{i:03d}.mp3')
                mix_audio_cues(
                    audio_path,
                    mixed_audio_path,
                    cue_assets,
                    duration=duration,
                    ffmpeg_path=ffmpeg_path,
                )
                audio_path = mixed_audio_path

            timeline_segments = _prepare_timeline_segments(page, segments, page_idx)
            if audio_path:
                padding_before_ms, padding_after_ms = _page_audio_padding_ms(
                    page=page,
                    page_index=page_idx,
                    page_position=i,
                    total_pages=total,
                    page_direction=directed_pages.get(page_idx, {}),
                    preferences=preferences,
                )
                audio_timeline, timing_warning = _build_page_tts_timeline(
                    page_id=_timeline_page_id(page, page_idx),
                    segments=timeline_segments,
                    audio_duration=duration,
                    segment_durations=segment_durations,
                    padding_before_ms=padding_before_ms,
                    padding_after_ms=padding_after_ms,
                    provider=tts_provider,
                    asr_result=asr_result,
                    transcript_matched=transcript_matched,
                )
                if timing_warning:
                    quality_warnings.append(f'第 {page_idx + 1} 页：{timing_warning}')
            else:
                audio_timeline = build_page_audio_timeline(
                    _timeline_page_id(page, page_idx),
                    [],
                    audio_duration_ms=0,
                    padding_before_ms=0,
                    padding_after_ms=int(round(duration * 1000)),
                    timing_quality='estimated',
                )
            quality_page['timing_quality'] = audio_timeline['timing_quality']
            audio_ref = _save_page_audio_artifact(
                audio_path,
                manifest_dir,
                _timeline_page_id(page, page_idx),
            )
            if audio_ref:
                quality_page['audio_sha256'] = audio_ref['sha256']
            from services.video_audio_timeline import save_audio_timeline

            audio_timeline_ref = save_audio_timeline(
                audio_timeline,
                manifest_dir,
                expected_page_id=_timeline_page_id(page, page_idx),
            )
            quality_page['audio_timeline_sha256'] = audio_timeline_ref['sha256']
            try:
                motion_manifest, motion_manifest_ref = _prepare_native_motion_manifest(
                    page,
                    audio_timeline,
                    timeline_segments,
                    directed_pages.get(page_idx, {}),
                    manifest_dir,
                )
            except Exception as exc:
                motion_manifest = None
                motion_manifest_ref = None
                warning = f'第 {page_idx + 1} 页元素动画准备失败，已保留浏览器帧回退：{exc}'
                quality_warnings.append(warning)
                logger.warning(warning)
            if motion_manifest_ref:
                quality_page['motion_manifest_sha256'] = motion_manifest_ref['sha256']
            quality_pages.append(quality_page)
            page_durations.append(duration)
            audio_paths.append(audio_path)
            page_audio_timelines.append(audio_timeline)
            page_audio_timeline_refs.append(audio_timeline_ref)
            page_audio_refs.append(audio_ref)
            page_segments.append(timeline_segments)
            page_motion_manifests.append(motion_manifest)
            page_motion_manifest_refs.append(motion_manifest_ref)

            if progress_callback:
                pct = int(20 + (i + 1) / total * 30)  # 20-50%
                if audio_path:
                    message = f"已生成第 {i+1}/{total} 页音频"
                else:
                    message = f"第 {i+1}/{total} 页无有效语音，改为静音片段"
                progress_callback("TTS", message, pct)

        if fail_fast and silent_page_indexes:
            pages = '、'.join(str(idx) for idx in silent_page_indexes)
            raise RuntimeError(
                f"以下页面没有可用旁白语音：第 {pages} 页。当前项目未开启“允许返回半成品”，已停止导出。"
            )

        # ── Phase B: 视频片段 + 字幕条目 ──
        for i, page in enumerate(pages_data):
            segments = page_segments[i]
            page_idx = page.get('page_index', i)
            page_direction = directed_pages.get(page_idx, {})
            audio_direction = page_direction.get('audio') if isinstance(page_direction.get('audio'), dict) else {}
            motion = page_direction.get('motion') if isinstance(page_direction.get('motion'), dict) else {}
            if enable_ken_burns:
                # Explicit user style wins over the director's automatic choice.
                effect = (
                    resolve_ken_burns_effect(page_idx, ken_burns_style)
                    if ken_burns_style != 'auto'
                    else motion.get('effect') or resolve_ken_burns_effect(page_idx, ken_burns_style)
                )
            else:
                effect = 'static'
            motion_intensity = str(motion.get('intensity') or 'legacy')
            audio_path = audio_paths[i]
            audio_timeline = page_audio_timelines[i]
            # 整片头/尾的静音 padding 与画面淡入/淡出
            is_first = (i == 0)
            leading_pad = (
                audio_timeline['padding']['before_ms'] / 1000.0
                if audio_paths[i] else 0.0
            )
            trailing_pad = (
                audio_timeline['padding']['after_ms'] / 1000.0
                if audio_paths[i] else 0.0
            )
            transition = page_direction.get('transition') if isinstance(page_direction.get('transition'), dict) else {}
            transition_fade = min(float(transition.get('duration_ms') or 0) / 1000.0, 0.35)
            fade_in_seconds = max(leading_pad if is_first else 0.0, transition_fade if not is_first and transition.get('type') == 'fade' else 0.0)

            if audio_path and (leading_pad > 0 or trailing_pad > 0):
                padded_audio = os.path.join(tmp_dir, f'audio_padded_{i:03d}.mp3')
                pad_audio_with_silence(
                    audio_path, padded_audio,
                    leading_seconds=leading_pad,
                    trailing_seconds=trailing_pad,
                    ffmpeg_path=ffmpeg_path,
                )
                audio_path = padded_audio

            display_duration = audio_timeline['duration_ms'] / 1000.0

            # 收集字幕条目（字幕仅覆盖真实语音区间，避开首/末静音）
            if segments and audio_paths[i]:
                subtitle_entries.extend(_build_timeline_subtitle_entries(
                    segments,
                    audio_timeline,
                    page_start=cumulative_time,
                    speakers=speakers,
                ))
            cumulative_time += display_duration

            from services.video_visual_renderer import render_page_visual

            visual_path = os.path.join(
                tmp_dir,
                f"{'video' if audio_paths[i] else 'silent'}_{i:03d}.mp4",
            )
            visual_result = render_page_visual(
                page=page,
                motion_manifest=page_motion_manifests[i],
                output_path=visual_path,
                output_root=tmp_dir,
                duration=display_duration,
                width=width,
                height=height,
                fps=fps,
                ffmpeg_path=ffmpeg_path,
                effect=effect,
                enable_ken_burns=enable_ken_burns,
                fade_in_seconds=fade_in_seconds,
                fade_out_seconds=trailing_pad,
                motion_intensity=motion_intensity,
                include_silent_audio=not bool(audio_paths[i]),
                hyperframes_enabled=hyperframes_enabled,
                hyperframes_executable=hyperframes_executable,
            )
            quality_pages[i]['visual_renderer'] = visual_result['renderer']
            if visual_result.get('fallback_from'):
                quality_pages[i]['fallback_from'] = visual_result['fallback_from']
                quality_pages[i]['fallback_reason'] = visual_result.get('fallback_reason')
            visual_warnings = list(visual_result.get('warnings') or [])
            if visual_warnings:
                quality_warnings.extend(
                    f'第 {page_idx + 1} 页：{warning}'
                    for warning in visual_warnings
                )

            if audio_paths[i]:
                muxed_path = os.path.join(tmp_dir, f'muxed_{i:03d}.mp4')
                mux_video_audio(
                    visual_path,
                    audio_path,
                    muxed_path,
                    ffmpeg_path=ffmpeg_path,
                    normalize_audio=bool(audio_direction.get('normalize_loudness')),
                )
                muxed_clips.append(muxed_path)
            else:
                muxed_clips.append(visual_path)

            if progress_callback:
                pct = int(50 + (i + 1) / total * 30)  # 50-80%
                progress_callback("视频", f"已生成第 {i+1}/{total} 页视频片段", pct)

        render_snapshot_ref = None
        if project_id and narration_snapshot_path and narration_snapshot_hash:
            from services.video_export_snapshot import create_video_render_snapshot

            render_snapshot_ref = create_video_render_snapshot(
                directory=manifest_dir,
                project_id=project_id,
                narration_snapshot_path=narration_snapshot_path,
                narration_snapshot_hash=narration_snapshot_hash,
                pages=[{
                    'page_id': _timeline_page_id(page, page.get('page_index', index)),
                    'audio_timeline': page_audio_timeline_refs[index],
                    'audio_track': page_audio_refs[index],
                    'motion_manifest': page_motion_manifest_refs[index],
                    'scene_manifest': page.get('scene_manifest_ref'),
                    'native_scene_bundle': page.get('native_scene_bundle_ref'),
                    'visual_renderer': quality_pages[index]['visual_renderer'],
                    'fallback_from': quality_pages[index].get('fallback_from'),
                    'fallback_reason': quality_pages[index].get('fallback_reason'),
                } for index, page in enumerate(pages_data)],
                renderer_config={
                    'width': width,
                    'height': height,
                    'fps': fps,
                    'hyperframes_enabled': hyperframes_enabled,
                },
            )

        # ── Phase C: 拼接视频 ──
        if progress_callback:
            progress_callback("合成", "正在拼接视频…", 82)

        raw_video = os.path.join(tmp_dir, 'raw_composite.mp4')
        composite_video(muxed_clips, raw_video, fps=fps, ffmpeg_path=ffmpeg_path)

        # ── Phase D: 烧录字幕 ──
        if subtitle_entries:
            if progress_callback:
                progress_callback("字幕", "正在烧录字幕…", 88)

            ass_path = os.path.join(tmp_dir, 'subtitles.ass')
            subtitle_mode = str((director_plan or {}).get('config', {}).get('subtitle_mode') or 'standard')
            generate_ass_subtitle(subtitle_entries, ass_path, width=width, height=height, subtitle_mode=subtitle_mode)
            burn_subtitles(raw_video, ass_path, output_path, ffmpeg_path=ffmpeg_path)
        else:
            shutil.copy2(raw_video, output_path)

        if progress_callback:
            progress_callback("完成", "视频导出完成", 100)

        return {
            'provider': tts_provider,
            'model': fish_model if tts_provider == 'fish_audio' else 'edge-tts',
            'characters': sum(
                len(re.sub(r'\s+', '', str(segment.get('text') or '')))
                for segments in page_segments for segment in segments
            ),
            'requests': sum(1 for path in audio_paths if path),
            'duration_seconds': round(sum(page_durations), 2),
            'elapsed_seconds': round(time.monotonic() - started_at, 2),
            'retry_count': 0,
            'quality_pages': quality_pages,
            'warnings': quality_warnings,
            'render_snapshot': (
                {'path': render_snapshot_ref['path'], 'sha256': render_snapshot_ref['sha256']}
                if render_snapshot_ref else None
            ),
        }

    finally:
        # 清理临时目录
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)
