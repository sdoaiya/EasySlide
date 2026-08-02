"""内置 BGM 库：程序化合成免版权氛围音乐，注册为全局素材。

零资源依赖：用 ffmpeg lavfi 多路 sine 叠加成和弦 pad（含低通与淡入），
按曲目的和弦进行逐段合成后 concat。曲目惰性生成（首次访问时落盘并注册
全局 Material），导出预检视其为内置素材（license_status=builtin）。
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

TRACKS = [
    {
        'id': 'bgm.calm',
        'name': '轻松舒缓',
        'note': '温暖的 C 大调氛围垫乐，适合访谈与日常话题',
        'chords': [[48, 52, 55], [55, 59, 62], [45, 48, 52], [41, 45, 48]],
        'duration_per_chord': 12,
        'lowpass': 900,
        'volume': 0.30,
    },
    {
        'id': 'bgm.business',
        'name': '商务访谈',
        'note': '克制的小调进行，适合职场与商业话题',
        'chords': [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]],
        'duration_per_chord': 12,
        'lowpass': 1100,
        'volume': 0.32,
    },
    {
        'id': 'bgm.tech',
        'name': '科技前沿',
        'note': '明亮的高音 pad，适合科技与创新内容',
        'chords': [[45, 52, 55, 59], [40, 45, 48, 52], [43, 50, 55, 59], [38, 45, 48, 53]],
        'duration_per_chord': 10,
        'lowpass': 1400,
        'volume': 0.34,
    },
    {
        'id': 'bgm.night',
        'name': '深夜电台',
        'note': '低沉的爵士和弦，适合夜谈与情感话题',
        'chords': [[48, 52, 55, 59], [41, 45, 48, 52], [43, 47, 50, 54], [45, 49, 52, 56]],
        'duration_per_chord': 12,
        'lowpass': 800,
        'volume': 0.28,
    },
    {
        'id': 'bgm.energy',
        'name': '活力开场',
        'note': '明快的进行，适合开场与活动回顾',
        'chords': [[48, 52, 55], [43, 47, 50], [45, 49, 52], [41, 45, 48]],
        'duration_per_chord': 8,
        'lowpass': 1600,
        'volume': 0.36,
    },
]


def _note_frequency(midi_note: int) -> float:
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))


def _render_chord_segment(ffmpeg_path, segment_path, chord, duration, lowpass, volume, fade_in):
    inputs = []
    for midi_note in chord:
        freq = _note_frequency(midi_note)
        inputs += [
            '-f', 'lavfi',
            '-i', f'sine=frequency={freq:.2f}:sample_rate=44100:duration={duration}',
        ]
    # amix 输入标签需相邻拼接（[0][1][2]），filter 之间用逗号分隔
    input_labels = ''.join(f'[{index}]' for index in range(len(chord)))
    filters = [
        f'{input_labels}amix=inputs={len(chord)}:normalize=0,'
        f'lowpass=f={lowpass},volume={volume}',
    ]
    if fade_in:
        filters.append('afade=t=in:d=1.5')
    command = [ffmpeg_path, '-y'] + inputs + [
        '-filter_complex', ','.join(filters),
        '-t', str(duration),
        segment_path,
    ]
    subprocess.run(
        command, check=True, capture_output=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
    )


def _render_track(track, output_path, ffmpeg_path):
    """按和弦进行逐段合成并 concat 为 mp3（曲目总时长 = 和弦数 × 单段时长）。"""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix=f'.bgm_{track["id"]}.', dir=output_path.parent))
    try:
        segment_paths = []
        for index, chord in enumerate(track['chords']):
            segment = tmp_dir / f'{index:02d}.wav'
            _render_chord_segment(
                ffmpeg_path, str(segment), chord,
                track['duration_per_chord'], track['lowpass'], track['volume'],
                fade_in=(index == 0),
            )
            segment_paths.append(segment)
        concat_file = tmp_dir / 'concat.txt'
        concat_file.write_text(
            ''.join(f"file '{str(segment).replace(chr(39), chr(39) * 2)}'\n" for segment in segment_paths),
            encoding='utf-8',
        )
        subprocess.run(
            [
                ffmpeg_path, '-y', '-f', 'concat', '-safe', '0',
                '-i', str(concat_file),
                '-c:a', 'libmp3lame', '-b:a', '128k',
                str(output_path),
            ],
            check=True, capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def ensure_bgm_library(upload_root, ffmpeg_path='ffmpeg') -> list[dict]:
    """惰性生成内置 BGM 并注册为全局素材；返回曲目列表。

    幂等：文件已存在且 Material 已注册时直接返回。
    """
    from models import Material, db

    library_dir = Path(upload_root) / 'bgm_library'
    library_dir.mkdir(parents=True, exist_ok=True)
    tracks = []
    for track in TRACKS:
        relative_path = f'bgm_library/{track["id"]}.mp3'
        output_path = library_dir / f'{track["id"]}.mp3'
        if not output_path.is_file() or output_path.stat().st_size == 0:
            _render_track(track, output_path, ffmpeg_path)
        duration_ms = (
            len(track['chords']) * track['duration_per_chord'] * 1000
        )
        url = f'/files/{relative_path}'
        material = Material.query.filter_by(
            url=url, project_id=None,
        ).one_or_none()
        if not material:
            material = Material(
                project_id=None,
                filename=f'{track["name"]}.mp3',
                relative_path=relative_path,
                url=url,
                media_kind='audio',
                purpose='bgm',
                mime_type='audio/mpeg',
                duration_ms=duration_ms,
                source_note='内置背景音乐（程序化合成，免版权）',
                license_status='builtin',
            )
            db.session.add(material)
            db.session.flush()
        tracks.append({
            'id': track['id'],
            'name': track['name'],
            'note': track['note'],
            'url': url,
            'duration_ms': duration_ms,
            'material_id': material.id,
        })
    db.session.commit()
    return tracks
